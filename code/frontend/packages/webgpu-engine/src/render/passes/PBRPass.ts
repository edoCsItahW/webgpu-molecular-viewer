// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PBRPass.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 主渲染 Pass：用 PBR 管线把 Scene 里可见的 Renderable 画到颜色 / 深度目标上
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Pass, PassContext } from "../../gpu/PassManager";
import { ATTRIB_NORMAL, ATTRIB_POSITION, INTERLEAVED_BYTES_PER_VERTEX, type Geometry } from "../Geometry";
import type { Renderable, Scene } from "../Scene";
import type { Renderer } from "../Renderer";
import { Console, type Nullable } from "@wmv/common";
import { t } from "../../locales";


/**
 * 可绘制的 Renderable。
 *
 * Scene 的 Renderable 契约只要求 uniformBuffer / packObjectUniform，
 * 而 draw 还必须拿到几何体，故这里补一层结构性约束：
 * 带 geometry 的对象才参与绘制，其余对象静默跳过。
 * */
interface Drawable extends Renderable {
    /** 几何体。Mesh 提供；自定义 Renderable 可以不提供，此时不参与绘制 */
    readonly geometry?: Geometry;
}


export interface PBRPassOptions {
    /**
     * 输出目标纹理名（由 PassManager 声明）。
     *   - 非 null：写中间纹理（如 'scene-color'），供 SSAO 等后处理消费
     *   - null：直接写交换链（无后处理）
     * */
    targetTexture: Nullable<string>;

    /**
     * 离屏渲染时的深度纹理名（由 PassManager 声明）。
     * 默认 'depth'。写交换链时不使用它 —— 那种情况沿用 GPUContext 的深度纹理。
     * */
    depthTexture?: string;

    /**
     * 是否每帧重传 scene / object uniform。默认 true。
     *
     * Renderer 在 pass 之前已经传过一次，这里重传是幂等的；
     * 想让 Renderer 独占上传职责就传 false。
     * */
    updateUniforms?: boolean;
}


const DEFAULT_PBR_PASS_OPTIONS: Required<Pick<PBRPassOptions, "depthTexture" | "updateUniforms">> = {
    depthTexture: "depth",
    updateUniforms: true
};


/** 补齐默认值后的选项。targetTexture 必填，无法整体 `{...DEFAULT, ...options}` 合并 */
type ResolvedPBRPassOptions = Required<Pick<PBRPassOptions, "depthTexture" | "updateUniforms">> & PBRPassOptions;


export class PBRPass implements Pass {
    /** pass 名，同时是 SSAOPass / PickingPass 的 after 依赖名 */
    readonly name = "pbr";

    /** 无前置依赖，按注册顺序最先执行 */
    readonly after: string[] = [];

    #disposed = false;

    private readonly renderer: Renderer;

    private readonly opts: ResolvedPBRPassOptions;

    /** group 0：scene 级 bindgroup（scene uniform buffer 全场景唯一，构造时建一次） */
    private readonly sceneBindGroup: GPUBindGroup;

    /** group 1 的 layout。bindgroup 本身按对象缓存在 objectBindGroups 里 */
    private readonly objectBGL: GPUBindGroupLayout;

    private readonly pipeline: GPURenderPipeline;

    /**
     * 对象级 bindgroup 缓存。
     * key 是对象身份，保证同一个 Mesh 每帧拿到同一个 bindgroup；
     * WeakMap 让 Mesh 被回收后对应条目自动消失。
     * */
    private readonly objectBindGroups = new WeakMap<Renderable, GPUBindGroup>();


    constructor(renderer: Renderer, options: PBRPassOptions) {
        this.renderer = renderer;
        this.opts = {
            targetTexture: options.targetTexture,
            depthTexture: options.depthTexture ?? DEFAULT_PBR_PASS_OPTIONS.depthTexture,
            updateUniforms: options.updateUniforms ?? DEFAULT_PBR_PASS_OPTIONS.updateUniforms
        };

        // ---- BindGroupLayout：group 0 = scene，group 1 = object ----
        // key 相同则返回同一个 layout，所以 PickingPass 拿到的也是这两份
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

        // ---- 管线 ----
        const module = renderer.shaders.compile("pbr");

        this.pipeline = renderer.pm.getRenderPipeline("pbr", {
            layout: renderer.pm.getPipelineLayout("pbr", [sceneBGL, this.objectBGL]),
            vertex: {
                module,
                entryPoint: "vs_main",
                buffers: [PBRPass.vertexLayout()]
            },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{format: renderer.gpu.format}]
            },
            primitive: {
                topology: "triangle-list",
                // 暂不剔除背面：WebGPU 的 frontFace 字面量（默认 'ccw'）与几何绕序的对应关系
                // 取决于"framebuffer 的 y 轴向下"这一约定，本机尚未实测；而"绕序与剔除方向不匹配"
                // 会让所有球面整体不可见（只剩内表面 → 亮度≈背景色 → 视口一片黑）。
                // 对不透明凸体（球）来说深度测试已经决定了可见面，关闭剔除只多画一遍背面
                // （片段着色器无 discard/无 UAV 写入，驱动会做早期深度测试挡掉）。
                // 若要开回来：先在本机确认 frontFace 语义（GL 习惯用 'ccw'，Vulkan 习惯用 'cw'），
                // 再与 SphereGeometry 的绕序对齐；引入 ribbon / surface 等开放曲面时，
                // 应按材质配置 side，而不是在这里全局写死。
                cullMode: "none"
            },
            // 写交换链时跟随 GPUContext 的 MSAA；写中间纹理时中间纹理是单采样的
            multisample: {count: this.offscreen ? 1 : renderer.gpu.options.sampleCount},
            depthStencil: {
                format: renderer.gpu.options.depthFormat,
                depthWriteEnabled: true,
                depthCompare: "less"
            }
        });

        // ---- scene bindgroup ----
        const sceneUniformBuffer = renderer.scene?.sceneUniformBuffer;
        if (!sceneUniformBuffer)
            throw new Error(t("PBRPass.constructor.error_1"));

        this.sceneBindGroup = renderer.bg.getOrCreate(
            sceneBGL,
            [{binding: 0, resource: {buffer: sceneUniformBuffer}}],
            "pbr:scene"
        );
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    execute(ctx: PassContext): void {
        const scene = this.renderer.scene;
        if (!scene) return;

        if (this.opts.updateUniforms)
            this.updateUniforms(ctx, scene);

        // ---- 1. 决定颜色目标 ----
        const targetName = this.opts.targetTexture;
        const background = scene.background;

        const colorAttachment: GPURenderPassColorAttachment = {
            view: targetName === null ? ctx.frame.msaaView : ctx.getTexture(targetName),
            clearValue: {r: background[0], g: background[1], b: background[2], a: 1},
            loadOp: "clear",
            storeOp: "store"
        };

        // 写交换链且开了 MSAA 时才需要 resolve：msaaView 与 colorView 是两张纹理
        if (targetName === null && ctx.frame.msaaView !== ctx.frame.colorView)
            colorAttachment.resolveTarget = ctx.frame.colorView;

        const descriptor: Partial<GPURenderPassDescriptor> = {colorAttachments: [colorAttachment]};

        // 离屏渲染时把深度写进 PassManager 的深度纹理（SSAO 会采样它）；
        // 写交换链时不指定，走 beginRenderPass 的默认 depthView
        if (this.offscreen)
            descriptor.depthStencilAttachment = {
                view: ctx.getTexture(this.opts.depthTexture),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            };

        // ---- 2. 遍历 scene 的 renderables ----
        const pass = ctx.beginRenderPass(descriptor);

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.sceneBindGroup);

        for (const obj of scene.renderables) {
            if (!obj.visible) continue;

            const geometry = (obj as Drawable).geometry;
            if (!geometry) continue;

            // 未上传的几何没有缓冲可绑，跳过（uploaded 等价于两个缓冲都非 null）
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
    }

    /**
     * 释放 pass 私有资源。
     *
     * 管线 / pipeline layout 归 PipelineManager，bindgroup 归 BindGroupCache，
     * 本 pass 没有独占的 GPU 资源，所以只置销毁标记。
     * */
    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;
    }

    /** 是否写到中间纹理（true）还是交换链（false） */
    private get offscreen(): boolean {
        return this.opts.targetTexture !== null;
    }

    /**
     * 重传 scene 级与对象级 uniform。
     *
     * 打包逻辑属于 Scene / Mesh 自己（packSceneUniforms / packObjectUniform），
     * 这里只负责触发写入。
     * */
    private updateUniforms(ctx: PassContext, scene: Scene): void {
        const rm = this.renderer.rm;

        const aspect = ctx.frame.height === 0 ? 1 : ctx.frame.width / ctx.frame.height;
        const sceneData = scene.packSceneUniforms(aspect);
        const sceneUniformBuffer = scene.sceneUniformBuffer;

        if (sceneData && sceneUniformBuffer)
            rm.writeBuffer(sceneUniformBuffer, sceneData);

        for (const obj of scene.renderables) {
            if (!obj.visible) continue;

            const data = obj.packObjectUniform();
            const buffer = obj.uniformBuffer;

            if (data && buffer)
                rm.writeBuffer(buffer, data);
        }
    }

    /**
     * 取 / 建某个 Renderable 的 object bindgroup。
     *
     * 先查 WeakMap（按对象身份），未命中时交给 BindGroupCache（按资源签名去重）建，
     * 建好塞回 WeakMap，避免每帧重算签名。
     * */
    private getObjectBindGroup(obj: Renderable): Nullable<GPUBindGroup> {
        const cached = this.objectBindGroups.get(obj);
        if (cached) return cached;

        const buffer = obj.uniformBuffer;
        if (!buffer) return null;

        const bindGroup = this.renderer.bg.getOrCreate(
            this.objectBGL,
            [{binding: 0, resource: {buffer}}],
            `pbr:object:${obj.name ?? "unnamed"}`
        );

        this.objectBindGroups.set(obj, bindGroup);

        return bindGroup;
    }

    /**
     * Geometry 的默认交错顶点布局：location 0 = position(vec3) @ 0，
     * location 1 = normal(vec3) @ 12，arrayStride 24。
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
