// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file SSAOPass.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 屏幕空间环境光遮蔽 Pass：读 PBR 写下的深度纹理，输出一张 AO 因子图
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Pass, PassContext } from "../../gpu/PassManager";
import type { Renderer } from "../Renderer";
import { mat4Invert } from "@wmv/mathematical";
import { Console, type Nullable } from "@wmv/common";
import { t } from "../../locales";


export interface SSAOPassOptions {
    /** 深度纹理名（由 PassManager 声明，需带 TEXTURE_BINDING，单采样） */
    depthTexture: string;

    /** 输出纹理名（由 PassManager 声明，格式必须是 r8unorm，通常半分辨率） */
    outputTexture: string;

    /** 采样半径（视图空间单位）。默认 0.6 */
    radius?: number;

    /** 遮蔽强度（0~1）。默认 0.9 */
    intensity?: number;

    /** 深度偏置，避免自遮挡。默认 0.02 */
    bias?: number;
}


const DEFAULT_SSAO_PASS_OPTIONS: Required<Pick<SSAOPassOptions, "radius" | "intensity" | "bias">> = {
    radius: 0.6,
    intensity: 0.9,
    bias: 0.02
};


/** SSAO uniform 的 float 个数：invProj(16) + params(4) + screenSize(2) + pad(2) */
const SSAO_UNIFORM_FLOATS = 24;


/** SSAO uniform 的字节数（24 × 4 = 96），与 ssao.wgsl 的 SsaoUniforms 一致 */
const SSAO_UNIFORM_BYTES = SSAO_UNIFORM_FLOATS * 4;


/** 补齐默认值后的选项。depthTexture / outputTexture 必填，无法整体 `{...DEFAULT, ...options}` 合并 */
type ResolvedSSAOPassOptions = Required<Pick<SSAOPassOptions, "radius" | "intensity" | "bias">> & SSAOPassOptions;


export class SSAOPass implements Pass {
    readonly name = "ssao";

    /** 必须等 pbr 把深度写完再跑 */
    readonly after: string[] = ["pbr"];

    /** 是否启用。Renderer 可以在运行时改，PassManager 每帧读一次 */
    enabled = true;

    /** 懒建的 bindgroup。深度纹理 view 要等 PassManager 把中间纹理建出来 */
    #bindGroup: Nullable<GPUBindGroup> = null;

    /** 上面那份 bindgroup 绑的深度纹理。纹理重建（resize）后 identity 会变，据此重建 bindgroup */
    #boundDepthTexture: Nullable<GPUTexture> = null;

    #disposed = false;

    private readonly renderer: Renderer;

    private readonly opts: ResolvedSSAOPassOptions;

    private readonly ssaoBGL: GPUBindGroupLayout;

    private readonly pipeline: GPURenderPipeline;

    /** SSAO 私有 uniform：invProj + params + screenSize */
    private readonly uniformBuffer: GPUBuffer;

    /** uniform 打包缓存，复用同一块内存 */
    private readonly uniformData: Float32Array;


    constructor(renderer: Renderer, options: SSAOPassOptions) {
        this.renderer = renderer;
        this.opts = {
            depthTexture: options.depthTexture,
            outputTexture: options.outputTexture,
            radius: options.radius ?? DEFAULT_SSAO_PASS_OPTIONS.radius,
            intensity: options.intensity ?? DEFAULT_SSAO_PASS_OPTIONS.intensity,
            bias: options.bias ?? DEFAULT_SSAO_PASS_OPTIONS.bias
        };

        // ---- BindGroupLayout：一个 group 装完 scene uniform / SSAO uniform / 深度纹理 ----
        // binding 顺序与 ssao.wgsl 的 @group(0) 声明一一对应
        this.ssaoBGL = renderer.pm.getBindGroupLayouts("ssao", [
            {
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {type: "uniform"}
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: {type: "uniform"}
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {sampleType: "depth"}
            }
        ]);

        // ---- 管线：全屏三角形，无顶点缓冲、无深度附着 ----
        const module = renderer.shaders.compile("ssao");

        this.pipeline = renderer.pm.getRenderPipeline("ssao", {
            layout: renderer.pm.getPipelineLayout("ssao", [this.ssaoBGL]),
            vertex: {
                module,
                entryPoint: "vs_main"
            },
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{format: "r8unorm"}]
            },
            primitive: {topology: "triangle-list"},
            // AO 图是单采样的中间纹理（半分辨率），MSAA 由 PBRPass 负责
            multisample: {count: 1}
        });

        this.uniformBuffer = renderer.rm.create("uniform-buffer", SSAO_UNIFORM_BYTES, "ssao:uniforms");
        this.uniformData = new Float32Array(SSAO_UNIFORM_FLOATS);

        // ---- 提前校验：group 0 binding 0 是 scene uniform ----
        if (!renderer.scene?.sceneUniformBuffer)
            throw new Error(t("SSAOPass.constructor.error_1"));
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    execute(ctx: PassContext): void {
        this.updateUniforms(ctx);

        const bindGroup = this.ensureBindGroup(ctx);

        // SSAO 不与已有几何做遮挡，也不需要深度测试，更要避免 clear 掉 PBR 写的深度，
        // 所以这里直接用 encoder 开一个只有颜色附着的 pass
        // （PassContext.beginRenderPass 在未给附着时会补上默认的多采样 frame.depthView）
        const pass = ctx.encoder.beginRenderPass({
            colorAttachments: [{
                view: ctx.getTexture(this.opts.outputTexture),
                clearValue: {r: 1, g: 1, b: 1, a: 1},   // 1 = 完全无遮蔽
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);   // 全屏三角形

        pass.end();
    }

    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;
        this.#bindGroup = null;
        this.#boundDepthTexture = null;

        this.renderer.rm.destroy(this.uniformBuffer);
    }

    /**
     * 懒建 bindgroup：深度纹理的 view 要等 PassManager 在帧内把中间纹理建出来才有，
     * 所以不能在构造期创建。
     *
     * 中间纹理在 resize 时会被销毁重建，此时必须换绑新的 view，
     * 故用 GPUTexture 的 identity（而不是每次调用都新建的 view）判断是否需要重建。
     * */
    private ensureBindGroup(ctx: PassContext): GPUBindGroup {
        const depthTexture = ctx.getTextureRaw(this.opts.depthTexture);

        const cached = this.#bindGroup;
        if (cached && this.#boundDepthTexture === depthTexture) return cached;

        const bindGroup = this.renderer.bg.getOrCreate(
            this.ssaoBGL,
            [
                {binding: 0, resource: {buffer: this.sceneUniformBuffer()}},
                {binding: 1, resource: {buffer: this.uniformBuffer}},
                {binding: 2, resource: ctx.getTexture(this.opts.depthTexture)}
            ],
            "ssao:main"
        );

        this.#bindGroup = bindGroup;
        this.#boundDepthTexture = depthTexture;

        return bindGroup;
    }

    /**
     * 每帧重算 invProj 并写 uniform。
     *
     * 布局（float）：
     *   0  ~ 15 : invProj    —— 逆投影矩阵，用于从 (ndc, depth) 重建视图空间位置
     *   16 ~ 19 : params     —— (radius, intensity, bias, unused)
     *   20 ~ 21 : screenSize —— 深度纹理的像素尺寸
     *   22 ~ 23 : pad
     * */
    private updateUniforms(ctx: PassContext): void {
        const camera = this.renderer.scene?.camera;
        if (!camera) return;

        const d = this.uniformData;

        const aspect = ctx.frame.height === 0 ? 1 : ctx.frame.width / ctx.frame.height;
        d.set(mat4Invert(camera.projectionMatrix(aspect)), 0);

        d[16] = this.opts.radius;
        d[17] = this.opts.intensity;
        d[18] = this.opts.bias;
        d[19] = 0;

        d[20] = ctx.frame.width;
        d[21] = ctx.frame.height;
        d[22] = 0;
        d[23] = 0;

        this.renderer.rm.writeBuffer(this.uniformBuffer, d);
    }

    /** Scene 的 scene uniform buffer。Scene 未 attachGpu 或已销毁时抛错 */
    private sceneUniformBuffer(): GPUBuffer {
        const buffer = this.renderer.scene?.sceneUniformBuffer;
        if (!buffer)
            throw new Error(t("SSAOPass.sceneUniformBuffer.error_1"));

        return buffer;
    }
}
