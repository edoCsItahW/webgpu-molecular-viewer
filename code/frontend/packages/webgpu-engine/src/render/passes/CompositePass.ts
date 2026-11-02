// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file CompositePass.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc SSAO 合成 pass（P4 补齐）：把 scene-color 与 ssao 因子相乘后写交换链。
 *
 *       之前 SSAO 只写了一张 AO 图，没有 composite，所以默认关闭；本 pass 补上
 *       "PBR → SSAO → Composite → 屏幕" 的最后一环。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Pass, PassContext } from "../../gpu/PassManager";
import type { Renderer } from "../Renderer";
import type { Nullable } from "@wmv/common";


export interface CompositePassOptions {
    /** PBR 的颜色目标（全分辨率） */
    colorTexture: string;

    /** SSAO pass 的输出（半分辨率，r8unorm） */
    aoTexture: string;
}


export class CompositePass implements Pass {
    readonly name = "composite";

    /** 必须等 SSAO 把 AO 图写完 */
    readonly after: string[] = ["ssao"];

    enabled = true;

    #disposed = false;

    private readonly renderer: Renderer;

    private readonly opts: CompositePassOptions;

    private readonly bgl: GPUBindGroupLayout;

    private readonly pipeline: GPURenderPipeline;

    /** 合成开关：1 = 应用 AO，0 = 直出（SSAO 关闭时） */
    private readonly uniformBuffer: GPUBuffer;

    #useAo = true;

    #bindGroup: Nullable<GPUBindGroup> = null;

    /** 纹理 resize 后 view identity 变化，需要重建 bindgroup */
    #boundColor: Nullable<GPUTexture> = null;
    #boundAo: Nullable<GPUTexture> = null;

    constructor(renderer: Renderer, options: CompositePassOptions) {
        this.renderer = renderer;
        this.opts = options;

        this.bgl = renderer.pm.getBindGroupLayouts("composite", [
            {binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: "float"}},
            {binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {sampleType: "float"}},
            {binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: {type: "uniform"}}
        ]);

        this.uniformBuffer = renderer.rm.create("uniform-buffer", 16, "composite:uniforms");
        this.writeUniform();

        const module = renderer.shaders.compile("composite");

        this.pipeline = renderer.pm.getRenderPipeline("composite", {
            layout: renderer.pm.getPipelineLayout("composite", [this.bgl]),
            vertex: {module, entryPoint: "vs_main"},
            fragment: {
                module,
                entryPoint: "fs_main",
                targets: [{format: renderer.gpu.format}]
            },
            primitive: {topology: "triangle-list"},
            // 直接写交换链（colorView 是单采样 resolve 目标）
            multisample: {count: 1}
        });
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    execute(ctx: PassContext): void {
        const bindGroup = this.ensureBindGroup(ctx);

        const pass = ctx.encoder.beginRenderPass({
            colorAttachments: [{
                view: ctx.frame.colorView,
                clearValue: {r: 0, g: 0, b: 0, a: 1},
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();
    }

    /** 运行时开关 AO（SSAO 关闭时直出 scene-color） */
    setAo(enabled: boolean): void {
        if (this.#useAo === enabled) return;

        this.#useAo = enabled;
        this.writeUniform();
    }

    dispose(): void {
        this.#disposed = true;
        this.#bindGroup = null;
        this.#boundColor = null;
        this.#boundAo = null;

        this.renderer.rm.destroy(this.uniformBuffer);
    }

    private writeUniform(): void {
        this.renderer.rm.writeBuffer(this.uniformBuffer, new Uint32Array([this.#useAo ? 1 : 0, 0, 0, 0]));
    }

    private ensureBindGroup(ctx: PassContext): GPUBindGroup {
        const color = ctx.getTextureRaw(this.opts.colorTexture);
        const ao = ctx.getTextureRaw(this.opts.aoTexture);

        const cached = this.#bindGroup;
        if (cached && this.#boundColor === color && this.#boundAo === ao) return cached;

        const bindGroup = this.renderer.bg.getOrCreate(
            this.bgl,
            [
                {binding: 0, resource: ctx.getTexture(this.opts.colorTexture)},
                {binding: 1, resource: ctx.getTexture(this.opts.aoTexture)},
                {binding: 2, resource: {buffer: this.uniformBuffer}}
            ],
            "composite:main"
        );

        this.#bindGroup = bindGroup;
        this.#boundColor = color;
        this.#boundAo = ao;

        return bindGroup;
    }
}
