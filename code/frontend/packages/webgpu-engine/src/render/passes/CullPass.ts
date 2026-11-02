// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file CullPass.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/28
 * @desc GPU 视锥剔除 pass（P3）：对每个 GPU 批次 dispatch 一次 compute，
 *       把可见实例压缩进 visible[]，并把 indirect args 的 instanceCount 原子累加。
 *
 *       为什么值得：
 *         分子缩放/旋转时，视口里往往只有一部分原子；CPU 无法低成本地每帧判断，
 *         而 GPU 上每个实例一个线程的剔除只要 0.1 ms 量级。
 *       为什么每帧清零：
 *         args[1] 是原子累加计数器，必须在 dispatch 前归零（2 个批次 = 2 次 4 B 写）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Pass, PassContext } from "../../gpu/PassManager";
import type { Renderer } from "../Renderer";
import type { Batch } from "../Batch";
import type { Nullable } from "@wmv/common";


/** 剔除线程组大小，与 cull-*.wgsl 的 workgroup_size 一致 */
const CULL_WORKGROUP_SIZE = 64;


export class CullPass implements Pass {
    readonly name = "cull";

    /** 无前置依赖；由 Renderer 在 pbr 之前注册，保证先剔除后绘制 */
    readonly after: string[] = [];

    private readonly renderer: Renderer;

    /** group 0：scene uniform */
    private readonly sceneBGL: GPUBindGroupLayout;

    /** group 1：实例 storage + visible storage + args storage */
    private readonly cullBGL: GPUBindGroupLayout;

    private readonly pipelines: Record<"sphere" | "cylinder", GPUComputePipeline>;

    /**
     * 每批次一个 active-count uniform。
     *
     * 不能复用同一个 buffer：同一帧多个 batch 的 dispatch 在同一次 submit 里，
     * 若共用一个 buffer，最后一次 writeBuffer 会覆盖前面 batch 的 count。
     */
    private readonly countBuffers = new Map<Batch, GPUBuffer>();

    constructor(renderer: Renderer) {
        this.renderer = renderer;

        this.sceneBGL = renderer.pm.getBindGroupLayouts("cull-scene", [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}}
        ]);

        this.cullBGL = renderer.pm.getBindGroupLayouts("cull-batch", [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}},
            {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
            {binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}}
        ]);

        const make = (name: string): GPUComputePipeline => {
            const module = renderer.shaders.compile(name);

            return renderer.pm.getComputePipeline(name, {
                layout: renderer.pm.getPipelineLayout(name, [this.sceneBGL, this.cullBGL]),
                compute: {module, entryPoint: "main"}
            });
        };

        this.pipelines = {
            sphere: make("cull-sphere"),
            cylinder: make("cull-cylinder")
        };
    }

    get disposed(): boolean {
        return false;
    }

    /** 只有存在"有数据的 GPU 批次"时才需要执行 */
    get enabled(): boolean {
        const scene = this.renderer.scene;

        return !!scene && scene.batches.some(batch =>
            batch.gpuDriven && batch.count > 0 && !!batch.storageBuffer && !!batch.visibleBuffer && !!batch.argsBuffer
        );
    }

    execute(ctx: PassContext): void {
        const scene = this.renderer.scene;
        if (!scene) return;

        const sceneUniformBuffer = scene.sceneUniformBuffer;
        if (!sceneUniformBuffer) return;

        const sceneBG = this.renderer.bg.getOrCreate(
            this.sceneBGL,
            [{binding: 0, resource: {buffer: sceneUniformBuffer}}],
            "cull:scene"
        );

        for (const batch of scene.batches) {
            if (!this.eligible(batch)) continue;

            // 清零 instanceCount（args[1]），其余字段在 Batch 创建时已写死
            this.renderer.rm.writeBuffer(batch.argsBuffer!, new Uint32Array([0]), 4);

            // 活跃实例数：cull shader 必须按 count 判界，不能按 buffer 容量判界，
            // 否则换小分子后会把旧实例的尾部也剔选进来（旧球/键残留）。
            const countBuffer = this.ensureCountBuffer(batch);
            this.renderer.rm.writeBuffer(countBuffer, new Uint32Array([batch.count, 0, 0, 0]));

            const bindGroup = this.renderer.bg.getOrCreate(
                this.cullBGL,
                [
                    {binding: 0, resource: {buffer: batch.storageBuffer!}},
                    {binding: 1, resource: {buffer: countBuffer}},
                    {binding: 2, resource: {buffer: batch.visibleBuffer!}},
                    {binding: 3, resource: {buffer: batch.argsBuffer!}}
                ],
                `cull:${batch.name ?? "unnamed"}`
            );

            const pass = ctx.beginComputePass();
            pass.setPipeline(this.pipelines[batch.kind === "sphere" ? "sphere" : "cylinder"]);
            pass.setBindGroup(0, sceneBG);
            pass.setBindGroup(1, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(batch.count / CULL_WORKGROUP_SIZE));
            pass.end();
        }
    }

    dispose(): void {
        for (const buffer of this.countBuffers.values())
            this.renderer.rm.destroy(buffer);

        this.countBuffers.clear();
    }

    private ensureCountBuffer(batch: Batch): GPUBuffer {
        const existing = this.countBuffers.get(batch);
        if (existing) return existing;

        const buffer = this.renderer.rm.create("uniform-buffer", 16, `cull:${batch.name ?? "unnamed"}:count`);

        this.countBuffers.set(batch, buffer);

        return buffer;
    }

    private eligible(batch: Batch): boolean {
        return batch.visible
            && batch.gpuDriven
            && batch.count > 0
            && !!batch.storageBuffer
            && !!batch.visibleBuffer
            && !!batch.argsBuffer;
    }
}

