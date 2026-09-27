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
import type { Renderable } from "../Scene";
import type { Renderer } from "../Renderer";
import type { Nullable } from "@wmv/common";


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

    /** 对象级 bindgroup 缓存，语义同 PBRPass */
    private readonly objectBindGroups = new WeakMap<Renderable, GPUBindGroup>();

    /** 1 像素回读缓冲。复用同一块：写 → mapAsync → 读 → unmap → 下次再用 */
    private readonly readbackBuffer: GPUBuffer;


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

        // ---- scene bindgroup ----
        const sceneUniformBuffer = renderer.scene?.sceneUniformBuffer;
        if (!sceneUniformBuffer)
            throw new Error("MsgId: PickingPass 构造时 Scene 尚未 attachGpu 或 sceneUniformBuffer 未创建");

        this.sceneBindGroup = renderer.bg.getOrCreate(
            sceneBGL,
            [{binding: 0, resource: {buffer: sceneUniformBuffer}}],
            "picking:scene"
        );

        // ---- 回读缓冲 ----
        this.readbackBuffer = renderer.rm.create("readback-buffer", PICK_READBACK_BYTES, "picking:readback");
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
     * 坐标用 canvas 的 CSS 像素（不是物理像素），pass 内部乘 devicePixelRatio 换算。
     * 多次调用只保留最后一次。
     * */
    requestPick(screenX: number, screenY: number): void {
        if (this.#disposed) return;

        this.#pendingPick = {screenX, screenY};
    }

    execute(ctx: PassContext): void {
        const pick = this.#pendingPick;
        if (!pick) return;

        const scene = this.renderer.scene;
        if (!scene) return;

        // 一次请求只处理一次：先消费再干活，回调里再次 requestPick 不会丢
        this.#pendingPick = null;

        // ---- 1. CSS 像素 → 物理像素 ----
        const dpr = window.devicePixelRatio || 1;
        const physX = Math.floor(pick.screenX * dpr);
        const physY = Math.floor(pick.screenY * dpr);

        // 越界直接回 0（背景），不为一次无效点击渲染
        if (physX < 0 || physY < 0 || physX >= ctx.frame.width || physY >= ctx.frame.height) {
            this.opts.onPick?.({id: 0, screenX: pick.screenX, screenY: pick.screenY});

            return;
        }

        // ---- 2. 把 objectId 画到 pick 纹理 ----
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

        // ---- 4. 异步回读 ----
        this.readback(pick.screenX, pick.screenY);
    }

    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;
        this.#pendingPick = null;

        this.renderer.rm.destroy(this.readbackBuffer);
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
                console.error(`MsgId: 拾取回读失败: ${String(err)}`);
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
