// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ComputePass.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 把"一个计算操作"封装成对象：管线 + 绑定组 + dispatch + 计时与统计
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {ComputeContext} from "./ComputeContext";
import type { Nullable, Optional } from "@wmv/common";
import { t } from "../locales";


/** 计算操作的构造选项 */
export interface ComputePassOptions {
    /** 唯一名字，用于调试、日志与时间戳标签 */
    name: string;

    /** 已创建的 ComputePipeline，由调用方通过 PipelineManager.getComputePipeline 取得 */
    pipeline: GPUComputePipeline;

    /**
     * 是否包裹 GPU 时间戳。
     * true 时 execute 自动配对 beginTiming / endTiming，false（默认）不包裹。
     * 实际是否生效取决于 ComputeContext.timingSupported，不支持时静默降级。
     */
    timing?: boolean;

    /** 默认 workgroup 大小。不传时用 ComputeContext.defaultWorkgroupSize */
    defaultWorkgroupSize?: number;
}


/** 单次执行的覆盖项 */
export interface ExecuteOptions {
    /** workgroup 大小，同时覆盖 ComputePass 与 ComputeContext 的默认值 */
    workgroupSize?: number;

    /** 本次是否包裹时间戳。不传时用构造时的 timing 选项 */
    timing?: boolean;
}


/** 补齐默认值后的选项 */
type ResolvedComputePassOptions = Required<Pick<ComputePassOptions, "timing">> & ComputePassOptions;


const DEFAULT_COMPUTE_PASS_OPTIONS: Required<Pick<ComputePassOptions, "timing">> = {
    timing: false
};


/**
 * 一个可复用的计算操作。
 *
 * 分工：ComputeContext 负责"如何 dispatch"（workgroup 数学、时间戳、缓存），
 * ComputePass 负责"dispatch 什么"（管线 + 绑定 + itemCount）。
 *
 * 它做的事：
 *   1. 组合一个 ComputePipeline 和一组 bindgroup 槽位
 *   2. execute(encoder, cc, itemCount) 一步完成整个 dispatch 序列
 *   3. 可选地包裹 GPU 时间戳，测量这一次 dispatch 的真实耗时
 *   4. 支持间接 dispatch（dispatchWorkgroupsIndirect）
 *   5. 统计累计 dispatch 次数
 *
 * 它不做的事：
 *   - 不创建 ComputePipeline（那是 PipelineManager 的活，本类只接收已创建的管线）
 *   - 不创建 bindgroup（那是 ComputeContext.createStorageBindGroup 的活）
 *   - 不管理 storage buffer 生命周期（那是 StorageBuffer 的活）
 *   - 不管 workgroup 数学（那是 ComputeContext 的活）
 *
 * 为什么不实现 Pass 接口：Pass 面向"每帧最多执行一次、无参数"的渲染 pass，
 * 而 ComputePass 可能一帧被调用多次（迭代求解），也可能一帧都不跑（仿真暂停），
 * 两者调度语义不同，硬塞进同一个接口反而扭曲接口。
 *
 * 用法：
 *   const forcePass = new ComputePass({
 *       name: "force-lj",
 *       pipeline: pm.getComputePipeline("sim-force-lj", {...}),
 *       timing: true
 *   }).setBindGroup(0, cc.createStorageBindGroup(bgl, entries));
 *
 *   // 每帧（换一组原子只需换 itemCount，可复用同一个实例）
 *   forcePass.execute(ctx.encoder, cc, atomCount);
 * */
export class ComputePass {
    /** 名字，调试与时间戳标签用 */
    readonly name: string;

    /** 计算管线。生命周期由 PipelineManager 管理，本类不销毁它 */
    readonly pipeline: GPUComputePipeline;

    /**
     * bindgroup 槽位：索引 = bind group index，值 = 对应的 bindgroup。
     * 允许稀疏（setBindGroup(0) 与 setBindGroup(2) 都合法），
     * 但 execute 前会校验连续性（见 validateBindings）。
     */
    #bindGroups: Array<Optional<GPUBindGroup>> = [];

    /** 累计 dispatch 次数，自构造以来不清零 */
    #dispatchCount = 0;

    /** 最近一次 execute 的 GPU 耗时（毫秒）。未计时或尚未通过 updateTimingFrom 回读时为 null */
    #lastTimingMs: Nullable<number> = null;

    #disposed = false;

    private readonly opts: ResolvedComputePassOptions;


    constructor(options: ComputePassOptions) {
        if (!options.name)
            throw new Error(t("ComputePass.constructor.error_1"));

        this.name = options.name;
        this.pipeline = options.pipeline;
        this.opts = {
            name: options.name,
            pipeline: options.pipeline,
            timing: options.timing ?? DEFAULT_COMPUTE_PASS_OPTIONS.timing,
            defaultWorkgroupSize: options.defaultWorkgroupSize
        };
    }

    /** 累计 dispatch 次数 */
    get dispatchCount(): number {
        return this.#dispatchCount;
    }

    /** 最近一次 execute 的 GPU 耗时（毫秒），无数据显示 null 由 UI 层显示占位符 */
    get lastTimingMs(): Nullable<number> {
        return this.#lastTimingMs;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /**
     * 设置指定槽位的 bindgroup，支持链式调用。
     * 重复设置同一槽位时后设置的生效。
     */
    setBindGroup(index: number, bindGroup: GPUBindGroup): this {
        this.assertAlive();

        if (!Number.isInteger(index) || index < 0)
            throw new Error(t("ComputePass.setBindGroup.error_1", { name: this.name, index }));

        this.#bindGroups[index] = bindGroup;

        return this;
    }

    /** 批量设置，等价于从 0 开始连续调用 setBindGroup */
    setBindGroups(bindGroups: GPUBindGroup[]): this {
        this.assertAlive();

        for (let i = 0; i < bindGroups.length; i++)
            this.#bindGroups[i] = bindGroups[i];

        return this;
    }

    /** 清空所有绑定，用于重建 */
    clearBindings(): this {
        this.#bindGroups = [];

        return this;
    }

    /**
     * 执行这个计算操作。
     *
     * 流程：校验绑定 →（可选）开始时间戳 → 开 pass、设管线与绑定、dispatch、结束 pass
     * →（可选）结束时间戳 → 计数 +1。
     *
     * @param encoder 命令编码器，通常来自 PassContext.encoder
     * @param cc ComputeContext，提供 workgroup 数学与时间戳
     * @param itemCount 要处理的数据元素数量。<= 0 时静默跳过 dispatch
     * @param options 本次执行的覆盖项
     */
    execute(
        encoder: GPUCommandEncoder,
        cc: ComputeContext,
        itemCount: number,
        options: ExecuteOptions = {}
    ): void {
        this.assertAlive();
        this.validateBindings();

        // itemCount <= 0 是合法状态（分子为空、仿真暂停），语义等同"dispatch 0 个 workgroup"
        if (itemCount <= 0) return;

        const wantTiming = options.timing ?? this.opts.timing;
        const workgroupSize = options.workgroupSize ?? this.opts.defaultWorkgroupSize;

        if (wantTiming)
            cc.beginTiming(encoder, this.name);

        const pass = encoder.beginComputePass({label: this.name});
        pass.setPipeline(this.pipeline);

        // 稀疏槽位已在 validateBindings 中拦截，这里可以按索引连续设置
        for (let i = 0; i < this.#bindGroups.length; i++)
            pass.setBindGroup(i, this.#bindGroups[i]!);

        // workgroup 数量由 ComputeContext 统一计算（含设备上限保护）
        cc.dispatch(pass, itemCount, {workgroupSize});

        pass.end();

        if (wantTiming)
            cc.endTiming(encoder);

        this.#dispatchCount++;
    }

    /**
     * 间接 dispatch：从 indirect buffer 读 3 个 u32（x、y、z）作为 workgroup 数量。
     *
     * 典型用途：前一个 compute pass 算出"本轮实际要处理多少数据"写进 buffer，
     * 这里直接按它 dispatch。buffer 布局必须符合 WebGPU 规范：
     * offset 0 为 x、4 为 y、8 为 z，且 indirectOffset 必须 4 字节对齐。
     *
     * @param indirectBuffer 装载 workgroup 数量的 buffer，需带 INDIRECT usage
     * @param indirectOffset 读取偏移，必须是 4 的倍数
     */
    executeIndirect(
        encoder: GPUCommandEncoder,
        cc: ComputeContext,
        indirectBuffer: GPUBuffer,
        indirectOffset = 0,
        options: ExecuteOptions = {}
    ): void {
        this.assertAlive();
        this.validateBindings();

        if (indirectOffset % 4 !== 0)
            throw new Error(
                t("ComputePass.executeIndirect.error_1", { name: this.name, indirectOffset })
            );

        const wantTiming = options.timing ?? this.opts.timing;

        if (wantTiming)
            cc.beginTiming(encoder, this.name);

        const pass = encoder.beginComputePass({label: this.name});
        pass.setPipeline(this.pipeline);

        for (let i = 0; i < this.#bindGroups.length; i++)
            pass.setBindGroup(i, this.#bindGroups[i]!);

        pass.dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset);

        pass.end();

        if (wantTiming)
            cc.endTiming(encoder);

        this.#dispatchCount++;
    }

    /**
     * 从 ComputeContext.readTimings() 的结果中取本 pass 的耗时。
     *
     * readTimings 是异步的，且一帧可能有多个 ComputePass，
     * 何时读、读哪几段由调用方决定，本类不自动更新：
     *   const timings = await cc.readTimings();
     *   forcePass.updateTimingFrom(timings);
     */
    updateTimingFrom(timings: Record<string, number>): void {
        const ms: Optional<number> = timings[this.name];
        if (ms === undefined) return;

        this.#lastTimingMs = ms;
    }

    /**
     * 释放。幂等。
     *
     * 本类不拥有任何 GPU 资源（pipeline 归 PipelineManager，bindgroup 归调用方或
     * BindGroupCache），所以只清自己的引用，不销毁 GPU 对象。
     */
    dispose(): void {
        if (this.#disposed) return;

        this.#bindGroups = [];
        this.#disposed = true;
    }

    /**
     * 校验 bindgroup 槽位连续。
     *
     * WebGPU 要求按 pipeline layout 的顺序设置 group，这里只检查"已设置的索引是否连续"
     * （例如设了 0 和 2 却漏了 1 这种调用方逻辑 bug），
     * "到底应该有几个 group"取决于 pipeline layout，本类不持有 layout，无从判断，
     * 交给 WebGPU 运行时报告。
     */
    private validateBindings(): void {
        const n = this.#bindGroups.length;

        if (n === 0)
            throw new Error(t("ComputePass.validateBindings.error_1", { name: this.name }));

        for (let i = 0; i < n; i++)
            if (this.#bindGroups[i] === undefined)
                throw new Error(
                    t("ComputePass.validateBindings.error_2", {
                        name: this.name,
                        i,
                        lastSlot: n - 1
                    })
                );
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("ComputePass.assertAlive.error_1", { name: this.name }));
    }
}
