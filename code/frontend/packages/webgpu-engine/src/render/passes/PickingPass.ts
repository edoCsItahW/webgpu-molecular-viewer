// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PickingPass.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc GPU 拾取 Pass：按需把 objectId 画进 r32uint 纹理，再异步回读被点击的那一个像素
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Pass, PassContext } from "../../gpu/PassManager";
import { ATTRIB_NORMAL, ATTRIB_POSITION, INTERLEAVED_BYTES_PER_VERTEX, type Geometry } from "../Geometry";
import type { Renderable, Scene } from "../Scene";
import type { Batch } from "../Batch";
import type { Renderer } from "../Renderer";
import {
    BATCH_ATTRIB_ID,
    BATCH_ATTRIB_MODEL,
    BATCH_INSTANCE_BYTES
} from "../Batch";
import { Console, type Nullable } from "@wmv/common";
import { t } from "../../locales";


/**
 * 可绘制的 Renderable。
 * Scene 的 Renderable 契约不含几何，而 draw 必须拿到顶点 / 索引缓冲。
 * */
interface Drawable extends Renderable {
    /** 几何体。Mesh 提供；自定义 Renderable 可以不提供，此时不参与绘制 */
    readonly geometry?: Geometry;
}


/** 一次待处理的拾取请求。screenX / screenY 是 canvas 的 CSS 像素坐标 */
interface PendingPick {
    screenX: number;
    screenY: number;
}


export interface PickingPassOptions {
    /** ID 纹理名（由 PassManager 声明，格式必须是 r32uint） */
    textureName: string;

    /**
     * 拾取用的深度纹理名（由 PassManager 声明，单采样）。
     * 默认 'depth'。pick 纹理是单采样的，深度附着也必须是单采样，
     * 否则与 GPUContext 的 MSAA 深度纹理样本数不一致。
     * */
    depthTexture?: string;

    /**
     * 拾取完成回调。
     * id = 0 表示没拾到（点到背景）。
     * */
    onPick?: (info: {id: number; screenX: number; screenY: number}) => void;
}


const DEFAULT_PICKING_PASS_OPTIONS: Required<Pick<PickingPassOptions, "depthTexture">> = {
    depthTexture: "depth"
};


/** 回读 1 个像素用的缓冲字节数，同时也是 copyTextureToBuffer 的 bytesPerRow（必须是 256 的倍数） */
const PICK_READBACK_BYTES = 256;


/** 补齐默认值后的选项 */
type ResolvedPickingPassOptions = Required<Pick<PickingPassOptions, "depthTexture">> & PickingPassOptions;


export class PickingPass implements Pass {
    readonly name = "picking";

    /**
     * 依赖 pbr：picking 只需要 scene uniform，而它由 PBRPass 负责上传
     * （Renderer 每帧也会上传，这里保证顺序上不会读到上一帧的矩阵）。
     * */
    readonly after: string[] = ["pbr"];

    /** 上一次回读还没结束时，本帧先不画，避免对同一个 buffer 重复 mapAsync */
    #readbackInFlight = false;

    /** 待处理的拾取请求。null 表示当前帧不需要 pick */
    #pendingPick: Nullable<PendingPick> = null;

    #disposed = false;

    private readonly renderer: Renderer;

    private readonly opts: ResolvedPickingPassOptions;

    /** group 0：scene 级 bindgroup */
    private readonly sceneBindGroup: GPUBindGroup;

    /** group 1 的 layout。bindgroup 本身按对象缓存在 objectBindGroups 里 */
    private readonly objectBGL: GPUBindGroupLayout;

    private readonly pipeline: GPURenderPipeline;

    /** 实例化批次的拾取管线：id 来自实例属性，不需要 object bindgroup */
    private readonly batchPipeline: GPURenderPipeline;

    /** 对象级 bindgroup 缓存，语义同 PBRPass */
    private readonly objectBindGroups = new WeakMap<Renderable, GPUBindGroup>();

    /** 1 像素回读缓冲。复用同一块：写 → mapAsync → 读 → unmap → 下次再用 */
    private readonly readbackBuffer: GPUBuffer;

    /** 计算拾取：球实例 storage + scene + pick uniform + 结果 */
    private readonly computePickBGL: GPUBindGroupLayout;
    private readonly computeMinDepth: GPUComputePipeline;
    private readonly computeMinIndex: GPUComputePipeline;
    private readonly pickUniformBuffer: GPUBuffer;
    private readonly pickResultBuffer: GPUBuffer;
    private readonly pickReadBuffer: GPUBuffer;

    /** 本帧是否走的计算拾取路径（决定 afterSubmit 读哪个缓冲） */
    #computeReadback = false;

    /** 本帧已录制 copy、等待 afterSubmit 发起 mapAsync 的坐标（物理像素） */
    #pendingReadback: Nullable<{screenX: number; screenY: number}> = null;

    /** 上一帧的渲染尺寸（物理像素），CPU 射线拾取用它把屏幕坐标转成 NDC */
    #viewport: Nullable<{width: number; height: number}> = null;


    constructor(renderer: Renderer, options: PickingPassOptions) {
        this.renderer = renderer;
        this.opts = {
            textureName: options.textureName,
            depthTexture: options.depthTexture ?? DEFAULT_PICKING_PASS_OPTIONS.depthTexture,
            onPick: options.onPick
        };

        // ---- BindGroupLayout：与 PBR 完全一致，两个 shader 共用同一份 layout ----
        const sceneBGL = renderer.pm.getBindGroupLayouts("scene", [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {type: "uniform"}
            }
        ]);

        this.objectBGL = renderer.pm.getBindGroupLayouts("object", [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {type: "uniform"}
            }
        ]);

        // ---- 管线。片元目标固定 r32uint，与 pick 纹理一致 ----
        const module = renderer.shaders.compile("picking");

        this.pipeline = renderer.pm.getRenderPipeline("picking", {
            layout: renderer.pm.getPipelineLayout("picking", [sceneBGL, this.objectBGL]),
            vertex: {
                module,
                entryPoint: "vs_main",
                buffers: [PickingPass.vertexLayout()]
            },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{format: "r32uint"}]
            },
            primitive: {
                topology: "triangle-list",
                // 与 PBRPass 保持一致：剔除方向必须与几何绕序匹配，否则拾取到的表面与
                // 画面看到的表面不是同一个（详见 PBRPass 中同一处的说明）。
                cullMode: "none"
            },
            // pick 纹理是单采样的中间纹理
            multisample: {count: 1},
            depthStencil: {
                format: renderer.gpu.options.depthFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        // ---- 批次拾取管线：r32uint 目标，id 从实例属性来 ----
        const batchModule = renderer.shaders.compile("picking-batch");

        this.batchPipeline = renderer.pm.getRenderPipeline("picking-batch", {
            layout: renderer.pm.getPipelineLayout("picking-batch", [sceneBGL]),
            vertex: {
                module: batchModule,
                entryPoint: "vs_main",
                buffers: [PickingPass.vertexLayout(), PickingPass.instanceLayout()]
            },
            fragment: {
                module: batchModule,
                entryPoint: "fs_main",
                targets: [{format: "r32uint"}]
            },
            primitive: {
                topology: "triangle-list",
                cullMode: "none"
            },
            multisample: {count: 1},
            depthStencil: {
                format: renderer.gpu.options.depthFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        // ---- scene bindgroup ----
        const sceneUniformBuffer = renderer.scene?.sceneUniformBuffer;
        if (!sceneUniformBuffer)
            throw new Error(t("PickingPass.constructor.error_1"));

        this.sceneBindGroup = renderer.bg.getOrCreate(
            sceneBGL,
            [{binding: 0, resource: {buffer: sceneUniformBuffer}}],
            "picking:scene"
        );

        // ---- 回读缓冲 ----
        this.readbackBuffer = renderer.rm.create("readback-buffer", PICK_READBACK_BYTES, "picking:readback");

        // ---- 计算拾取：球实例 storage → 射线求交 → atomicMin ----
        this.computePickBGL = renderer.pm.getBindGroupLayouts("pick-compute", [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}},
            {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}},
            {binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}}
        ]);

        const computeModule = renderer.shaders.compile("picking-compute");
        const computeLayout = renderer.pm.getPipelineLayout("picking-compute", [this.computePickBGL]);

        this.computeMinDepth = renderer.pm.getComputePipeline("picking-compute:depth", {
            layout: computeLayout,
            compute: {module: computeModule, entryPoint: "minDepth"}
        });

        this.computeMinIndex = renderer.pm.getComputePipeline("picking-compute:index", {
            layout: computeLayout,
            compute: {module: computeModule, entryPoint: "minIndex"}
        });

        this.pickUniformBuffer = renderer.rm.create("uniform-buffer", 48, "picking:compute-uniforms");
        this.pickResultBuffer = renderer.rm.create("storage-buffer", 8, {
            copySrc: true,
            label: "picking:compute-result"
        });
        this.pickReadBuffer = renderer.rm.create("readback-buffer", 8, "picking:compute-readback");
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 是否有待处理的拾取请求 */
    get hasPendingPick(): boolean {
        return this.#pendingPick !== null;
    }

    /**
     * enabled 是 getter：PassManager 每帧读一次，只有"有请求且上一次回读已结束"时才执行，
     * 其余帧完全不占 encoder。
     * */
    get enabled(): boolean {
        return this.#pendingPick !== null && !this.#readbackInFlight && !this.#disposed;
    }

    /**
     * 请求下一帧拾取某个屏幕像素。
     *
     * 坐标是**物理像素**（canvas backbuffer 坐标系）：CSS → 物理的换算由
     * `Renderer.requestPick` 统一做掉（用 canvas 自身比例），这里不再乘 devicePixelRatio，
     * 否则会二次缩放导致点击位置偏移。
     * 多次调用只保留最后一次。
     */
    requestPick(physicalX: number, physicalY: number): void {
        if (this.#disposed) return;

        // P3：球批次在 CPU 侧有紧凑实例数据，直接做 O(N) 射线求交。
        // 这样点击 → 选中的延迟是"一帧内的同步计算"（<1 ms），
        // 不必等 GPU 计算 + 8 B 回读（实测在持续渲染时会被队列拖到 40 ms 量级）。
        const scene = this.renderer.scene;
        const camera = scene?.camera;
        const batch = scene?.batches.find(item =>
            item.kind === "sphere" && item.count > 0 && item.data.length > 0
        );

        const viewport = this.#viewport ?? {
            width: this.renderer.gpu.width,
            height: this.renderer.gpu.height
        };

        if (camera && batch && !batch.dynamic && viewport.width > 0) {
            const id = this.pickCpu(camera, physicalX, physicalY, batch, viewport);

            this.opts.onPick?.({id, screenX: physicalX, screenY: physicalY});

            return;
        }

        this.#pendingPick = {screenX: physicalX, screenY: physicalY};
    }

    /**
     * CPU 射线拾取：与 compute 版本同样的 ray-sphere 求交，但同步返回。
     * 4HHB 4779 个原子约 0.05 ms；100k 约 1 ms，仍然远低于 GPU 回读的固定延迟。
     */
    private pickCpu(
        camera: NonNullable<Scene["camera"]>,
        screenX: number,
        screenY: number,
        batch: Batch,
        viewport: { width: number; height: number }
    ): number {
        const ray = camera.screenToRay(screenX, screenY, viewport);
        const [ox, oy, oz] = ray.origin;
        const [dx, dy, dz] = ray.direction;

        const data = batch.data;
        const ids = new Uint32Array(data.buffer, data.byteOffset, data.length);

        let best = Infinity;
        let id = 0;

        for (let i = 0; i < batch.count; i++) {
            const o = i * 8;
            const r = data[o + 3];

            if (r <= 0) continue;

            const cx = data[o];
            const cy = data[o + 1];
            const cz = data[o + 2];

            const ocx = ox - cx;
            const ocy = oy - cy;
            const ocz = oz - cz;

            const b = ocx * dx + ocy * dy + ocz * dz;
            const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
            const h = b * b - c;

            if (h < 0) continue;

            const t = -b - Math.sqrt(h);

            if (t > 0 && t < best) {
                best = t;
                id = ids[o + 5];
            }
        }

        return id;
    }

    execute(ctx: PassContext): void {
        this.#viewport = {width: ctx.frame.width, height: ctx.frame.height};

        const pick = this.#pendingPick;
        if (!pick) return;

        const scene = this.renderer.scene;
        if (!scene) return;

        // 一次请求只处理一次：先消费再干活，回调里再次 requestPick 不会丢
        this.#pendingPick = null;

        const physX = Math.floor(pick.screenX);
        const physY = Math.floor(pick.screenY);

        // 越界直接回 0（背景），不为一次无效点击渲染
        if (physX < 0 || physY < 0 || physX >= ctx.frame.width || physY >= ctx.frame.height) {
            this.opts.onPick?.({id: 0, screenX: pick.screenX, screenY: pick.screenY});

            return;
        }

        // ---- 2. GPU 批次优先走计算拾取（P3）：不重绘场景，只做射线 vs 球 ----
        const sphereBatch = scene.batches.find(batch =>
            batch.kind === "sphere" && batch.gpuDriven && batch.count > 0 && !!batch.storageBuffer
        );

        if (sphereBatch) {
            this.executeComputePick(ctx, sphereBatch, physX, physY, pick);

            return;
        }

        // ---- 3. 回退：把 objectId 画到 pick 纹理（mesh 批次 / 自定义 Renderable） ----
        const pass = ctx.beginRenderPass({
            colorAttachments: [{
                view: ctx.getTexture(this.opts.textureName),
                clearValue: {r: 0, g: 0, b: 0, a: 0},   // 0 = 背景
                loadOp: "clear",
                storeOp: "store"
            }],
            // 深度必须清成 1 再画：pick 与 pbr 用的是同一批矩阵，
            // 沿用 pbr 的深度会让所有片元在 depthCompare 'less' 下被丢弃
            depthStencilAttachment: {
                view: ctx.getTexture(this.opts.depthTexture),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.sceneBindGroup);

        for (const obj of scene.renderables) {
            if (!obj.visible) continue;

            const geometry = (obj as Drawable).geometry;
            if (!geometry) continue;

            const vertexBuffer = geometry.vertexBuffer;
            const indexBuffer = geometry.indexBuffer;
            if (!vertexBuffer || !indexBuffer) continue;

            const bindGroup = this.getObjectBindGroup(obj);
            if (!bindGroup) continue;

            pass.setBindGroup(1, bindGroup);
            pass.setVertexBuffer(0, vertexBuffer);
            pass.setIndexBuffer(indexBuffer, "uint32");
            pass.drawIndexed(geometry.indexCount);
        }

        // ---- 3. 批次：一次 draw 把每个实例的 id 写进 pick 纹理 ----
        this.drawBatches(pass);

        pass.end();

        // ---- 3. 复制被点击的那 1 个像素到回读缓冲 ----
        ctx.encoder.copyTextureToBuffer(
            {
                texture: ctx.getTextureRaw(this.opts.textureName),
                origin: {x: physX, y: physY, z: 0}
            },
            {
                buffer: this.readbackBuffer,
                bytesPerRow: PICK_READBACK_BYTES,
                rowsPerImage: 1
            },
            {width: 1, height: 1, depthOrArrayLayers: 1}
        );

        // ---- 4. 回读：必须等本帧提交之后再发起 mapAsync ----
        // 这里只登记待回读的位置，真正的 mapAsync 放在 afterSubmit() 里。
        // 原因：execute 只是录制命令，写这块 buffer 的 copy 要到提交时才执行，
        // 而"有 pending map / 已 mapped 的 buffer 不能被 submit 写入"是 WebGPU 的硬性规定；
        // 在 execute 里 mapAsync 会让整帧命令缓冲校验失败（copy 被丢弃、回读恒为 0，
        // 并且 buffer 会一直停在 mapped 状态导致后续所有拾取都失败）。
        this.#pendingReadback = {screenX: pick.screenX, screenY: pick.screenY};
    }

    /**
     * 本帧提交之后由 PassManager 回调：在这里发起回读，不会与 submit 冲突。
     */
    afterSubmit(): void {
        const pending = this.#pendingReadback;
        if (!pending || this.#disposed) return;

        this.#pendingReadback = null;

        if (this.#computeReadback)
            this.readbackCompute(pending.screenX, pending.screenY);
        else
            this.readback(pending.screenX, pending.screenY);
    }

    /**
     * 计算拾取：对球实例做屏幕射线求交，atomicMin 取最近命中。
     * 不重绘场景，也不碰 pick 纹理 / 深度纹理。
     */
    private executeComputePick(
        ctx: PassContext,
        batch: Batch,
        physX: number,
        physY: number,
        pick: PendingPick
    ): void {
        const sceneUniformBuffer = this.renderer.scene?.sceneUniformBuffer;
        if (!sceneUniformBuffer || !batch.storageBuffer) return;

        // 32 B uniform：[click.xy, screen.xy, count(u32), pad×3]
        const data = new ArrayBuffer(48);
        const f = new Float32Array(data);
        f[0] = physX;
        f[1] = physY;
        f[2] = ctx.frame.width;
        f[3] = ctx.frame.height;
        new Uint32Array(data, 16, 1)[0] = batch.count;

        this.renderer.rm.writeBuffer(this.pickUniformBuffer, data);
        this.renderer.rm.writeBuffer(this.pickResultBuffer, new Uint32Array([0xffffffff, 0xffffffff]));

        const bindGroup = this.renderer.bg.getOrCreate(
            this.computePickBGL,
            [
                {binding: 0, resource: {buffer: batch.storageBuffer}},
                {binding: 1, resource: {buffer: sceneUniformBuffer}},
                {binding: 2, resource: {buffer: this.pickUniformBuffer}},
                {binding: 3, resource: {buffer: this.pickResultBuffer}}
            ],
            `pick-compute:${batch.name ?? "unnamed"}`
        );

        const groups = Math.ceil(batch.count / 64);
        const pass = ctx.beginComputePass();
        pass.setBindGroup(0, bindGroup);
        pass.setPipeline(this.computeMinDepth);
        pass.dispatchWorkgroups(groups);
        pass.setPipeline(this.computeMinIndex);
        pass.dispatchWorkgroups(groups);
        pass.end();

        ctx.encoder.copyBufferToBuffer(this.pickResultBuffer, 0, this.pickReadBuffer, 0, 8);

        this.#computeReadback = true;
        this.#pendingReadback = {screenX: pick.screenX, screenY: pick.screenY};
    }

    /** 计算拾取的回读：8 B 里第 2 个 u32 是 objectId（0xffffffff = 未命中） */
    private readbackCompute(screenX: number, screenY: number): void {
        this.#readbackInFlight = true;
        this.#computeReadback = false;

        this.pickReadBuffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                const result = new Uint32Array(this.pickReadBuffer.getMappedRange().slice(0));

                this.pickReadBuffer.unmap();

                const id = result[1] === 0xffffffff ? 0 : result[1];

                this.opts.onPick?.({id, screenX, screenY});
            })
            .catch((err: unknown) => {
                Console.error(t("PickingPass.readback.error_1", {err: String(err)}));
            })
            .finally(() => {
                this.#readbackInFlight = false;
            });
    }

    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;
        this.#pendingPick = null;

        this.renderer.rm.destroy(this.readbackBuffer);
        this.renderer.rm.destroy(this.pickUniformBuffer);
        this.renderer.rm.destroy(this.pickResultBuffer);
        this.renderer.rm.destroy(this.pickReadBuffer);
    }

    /**
     * 异步回读 pick 纹理的 1 个像素。
     *
     * copyTextureToBuffer 只是录进 encoder，真正的拷贝发生在 PassManager submit 之后；
     * mapAsync 的 Promise 也在这之后才 resolve，所以这里发起回读不会阻塞帧循环。
     * */
    private readback(screenX: number, screenY: number): void {
        this.#readbackInFlight = true;

        this.readbackBuffer
            .mapAsync(GPUMapMode.READ)
            .then(() => {
                const id = new Uint32Array(this.readbackBuffer.getMappedRange())[0];

                this.readbackBuffer.unmap();

                this.opts.onPick?.({id, screenX, screenY});
            })
            .catch((err: unknown) => {
                Console.error(t("PickingPass.readback.error_1", { err: String(err) }));
            })
            .finally(() => {
                this.#readbackInFlight = false;
            });
    }

    /**
     * 取 / 建某个 Renderable 的 object bindgroup。
     * objectId 由 Mesh 打包进 ObjectUniforms 的最后一个槽位，pass 不参与它的计算。
     * */
    private getObjectBindGroup(obj: Renderable): Nullable<GPUBindGroup> {
        const cached = this.objectBindGroups.get(obj);
        if (cached) return cached;

        const buffer = obj.uniformBuffer;
        if (!buffer) return null;

        const bindGroup = this.renderer.bg.getOrCreate(
            this.objectBGL,
            [{binding: 0, resource: {buffer}}],
            `picking:object:${obj.name ?? "unnamed"}`
        );

        this.objectBindGroups.set(obj, bindGroup);

        return bindGroup;
    }

    /**
     * 绘制批次。每个批次一次 draw，id 由实例数据自带（location 7）。
     * 键批次的 id 为 0，因此只会"遮住"后面的原子，不会被选中。
     */
    private drawBatches(pass: GPURenderPassEncoder): void {
        const scene = this.renderer.scene;
        if (!scene || scene.batches.length === 0) return;

        pass.setPipeline(this.batchPipeline);
        pass.setBindGroup(0, this.sceneBindGroup);

        for (const batch of scene.batches) {
            if (!batch.visible || batch.count === 0) continue;

            // impostor 批次的绘制几何是 quad；拾取用 pickGeometry（单位球/柱网格）
            const geometry = batch.pickGeometry ?? batch.geometry;
            const vertexBuffer = geometry.vertexBuffer;
            const indexBuffer = geometry.indexBuffer;
            if (!vertexBuffer || !indexBuffer || !batch.instanceBuffer) continue;

            pass.setVertexBuffer(0, vertexBuffer);
            pass.setVertexBuffer(1, batch.instanceBuffer);
            pass.setIndexBuffer(indexBuffer, "uint32");
            pass.drawIndexed(geometry.indexCount, batch.count);
        }
    }

    /**
     * 实例缓冲布局（与 PBRPass 一致）：model 4xvec4 + color vec4 + id u32 + pad。
     * */
    private static instanceLayout(): GPUVertexBufferLayout {
        return {
            arrayStride: BATCH_INSTANCE_BYTES,
            stepMode: "instance",
            attributes: [
                {shaderLocation: BATCH_ATTRIB_MODEL, offset: 0, format: "float32x4"},
                {shaderLocation: BATCH_ATTRIB_MODEL + 1, offset: 16, format: "float32x4"},
                {shaderLocation: BATCH_ATTRIB_MODEL + 2, offset: 32, format: "float32x4"},
                {shaderLocation: BATCH_ATTRIB_MODEL + 3, offset: 48, format: "float32x4"},
                {shaderLocation: 6, offset: 64, format: "float32x4"},
                {shaderLocation: BATCH_ATTRIB_ID, offset: 80, format: "uint32"}
            ]
        };
    }

    /**
     * Geometry 的默认交错顶点布局，与 PBRPass 保持一致
     * （picking.wgsl 的 VertexInput 与 pbr.wgsl 同布局）。
     * */
    private static vertexLayout(): GPUVertexBufferLayout {
        return {
            arrayStride: INTERLEAVED_BYTES_PER_VERTEX,
            attributes: [
                {shaderLocation: ATTRIB_POSITION, offset: 0, format: "float32x3"},
                {shaderLocation: ATTRIB_NORMAL, offset: 12, format: "float32x3"}
            ]
        };
    }
}




