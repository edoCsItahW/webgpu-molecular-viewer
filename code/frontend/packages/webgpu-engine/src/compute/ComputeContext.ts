// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ComputeContext.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 计算调度辅助层：workgroup 数学、dispatch 封装、storage bindgroup 桥接与可选的 GPU 时间戳查询
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {GPUContext} from "../gpu/GPUContext";
import type {BindGroupCache} from "../gpu/BindGroupCache";
import { Console, type Nullable } from "@wmv/common";
import { t } from "../locales";


export interface ComputeContextOptions {
    /**
     * 默认 workgroup 大小。
     * dispatch 未显式指定时用它。默认 64，与多数 WGSL 的 @workgroup_size(64) 匹配。
     */
    defaultWorkgroupSize?: number;

    /**
     * 是否启用 GPU 时间戳查询。
     * 需要 device 启用了 'timestamp-query' feature。默认 false。
     * 即使开启，设备不支持时 timingSupported 仍为 false（静默降级）。
     */
    enableTiming?: boolean;

    /**
     * 最多同时记录多少个计时段。
     * 每个计时段占用 2 个时间戳槽位。默认 8。
     */
    maxTimings?: number;

    /**
     * 可选的 BindGroupCache。
     * 传入后 createStorageBindGroup 走缓存去重；不传则退化为直接 device.createBindGroup。
     */
    bindGroupCache?: BindGroupCache;
}


export interface DispatchOptions {
    /** workgroup 大小。不传则用 defaultWorkgroupSize */
    workgroupSize?: number;

    /** 调试用标签 */
    label?: string;
}


/** readTimings 的返回：label → 毫秒 */
export type TimingResult = Record<string, number>;


/**
 * 具备时间戳写入能力的命令编码器。
 *
 * @webgpu/types 0.1.72 已把 writeTimestamp 从 GPUCommandEncoder 上移除
 * （规范改为在 pass 描述符里用 timestampWrites），但浏览器实现仍普遍保留该方法。
 * 这里把它声明为可选方法：实现未提供时跳过计时，不影响其它功能。
 */
type TimestampWritableEncoder = GPUCommandEncoder & {
    writeTimestamp?(querySet: GPUQuerySet, queryIndex: number): void;
};


const DEFAULT_COMPUTE_CONTEXT_OPTIONS: Required<
    Pick<ComputeContextOptions, "defaultWorkgroupSize" | "enableTiming" | "maxTimings">
> = {
    defaultWorkgroupSize: 64,
    enableTiming: false,
    maxTimings: 8
};


/** 每个时间戳占 8 字节（u64） */
const TIMESTAMP_BYTES = 8;


/**
 * 计算管线的调度辅助层。
 *
 * 它做的：workgroup 尺寸数学（含 device 上限保护）、dispatch 的语义化封装、
 * 经 BindGroupCache 共享的 storage bindgroup、可选的 GPU 时间戳查询、dispatch 统计。
 *
 * 它不做的：不建 ComputePipeline（PipelineManager 的活）、不建 storage buffer（ResourceManager 的活）、
 * 不建 bindgroup layout（PipelineManager 的活）、不管 pass 顺序（PassManager 的活）、不 submit（Renderer 的活）。
 *
 * 时间戳依赖 device 的 'timestamp-query' feature：缺失或资源创建失败时 timingSupported 为 false，
 * 全部计时 API 静默 no-op，构造函数不抛错，计时失效不影响计算本身。
 */
export class ComputeContext {
    /** GPU 上下文 */
    readonly gpu: GPUContext;

    /** 默认 workgroup 大小 */
    defaultWorkgroupSize: number;

    /** 是否支持 GPU 时间戳。它反映"设备能力 + 构造选项"，生命周期内不变 */
    readonly timingSupported: boolean;

    #disposed = false;

    /** 时间戳 querySet，不支持时为 null */
    #timingQuerySet: Nullable<GPUQuerySet> = null;

    /** resolve 目标 buffer：querySet → buffer */
    #timingResolveBuffer: Nullable<GPUBuffer> = null;

    /** readback buffer：buffer → CPU */
    #timingReadbackBuffer: Nullable<GPUBuffer> = null;

    /** 本轮已占用的计时槽位数 */
    #timingSlot = 0;

    /** 各槽位的 label，下标即槽位号 */
    #timingLabels: string[] = [];

    /** 是否有正在进行的 mapAsync，用于防重入 */
    #timingReading = false;

    /** 是否已经提示过"编码器不支持 writeTimestamp"，避免每帧刷屏 */
    #warnedNoWriteTimestamp = false;

    /** 累计 dispatch 次数（自构造以来） */
    #dispatchCount = 0;

    /** 累计 workgroup 数量（自构造以来） */
    #totalWorkgroups = 0;

    /** 自上次 resetFrameStats 以来的 dispatch 次数 */
    #frameDispatchCount = 0;

    /** 最大计时段数 */
    private readonly maxTimings: number;

    /** bindgroup 缓存，为 null 时退化为直接创建 */
    private readonly bg: Nullable<BindGroupCache>;


    constructor(gpu: GPUContext, options: ComputeContextOptions = {}) {
        this.gpu = gpu;
        this.defaultWorkgroupSize = options.defaultWorkgroupSize ?? DEFAULT_COMPUTE_CONTEXT_OPTIONS.defaultWorkgroupSize;
        this.maxTimings = options.maxTimings ?? DEFAULT_COMPUTE_CONTEXT_OPTIONS.maxTimings;
        this.bg = options.bindGroupCache ?? null;

        const wantTiming = options.enableTiming ?? DEFAULT_COMPUTE_CONTEXT_OPTIONS.enableTiming;
        const hasFeature = gpu.device.features.has("timestamp-query");

        if (wantTiming && !hasFeature)
            Console.warning(t("ComputeContext.constructor.warning_1"));

        // 计时是诊断功能，不是核心功能：特性缺失或资源创建失败都只降级，不抛错
        let timingSupported = wantTiming && hasFeature;

        if (timingSupported)
            timingSupported = this.createTimingResources();

        this.timingSupported = timingSupported;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 自构造以来的累计 dispatch 次数 */
    get dispatchCount(): number {
        return this.#dispatchCount;
    }

    /** 自构造以来的累计 workgroup 数量 */
    get totalWorkgroups(): number {
        return this.#totalWorkgroups;
    }

    /** 自上次 resetFrameStats 以来的 dispatch 次数 */
    get frameDispatchCount(): number {
        return this.#frameDispatchCount;
    }

    /**
     * 根据 itemCount 和 workgroupSize 计算需要的 workgroup 数量。
     *
     * 相当于 ceil(itemCount / workgroupSize)，但：
     *   - itemCount <= 0 返回 0（"没有数据"是合法状态，不是错误）
     *   - 结果超过 device 上限时抛错（静默 clamp 会让计算静默出错）
     *
     * @param itemCount 要处理的数据元素数量
     * @param workgroupSize 每个 workgroup 处理的元素数量，不传用 defaultWorkgroupSize
     */
    workgroupCount(itemCount: number, workgroupSize?: number): number {
        const size = workgroupSize ?? this.defaultWorkgroupSize;

        if (size <= 0)
            throw new Error(t("ComputeContext.workgroupCount.error_1", { size }));

        if (itemCount <= 0) return 0;

        const count = Math.ceil(itemCount / size);
        const maxPerDim = this.gpu.device.limits.maxComputeWorkgroupsPerDimension;

        if (count > maxPerDim)
            throw new Error(t("ComputeContext.workgroupCount.error_2", {
                count,
                maxPerDim,
                itemCount,
                size
            }));

        return count;
    }

    /**
     * 在给定的 compute pass 上 dispatch。
     *
     * 自动按 itemCount 与 workgroupSize 计算 workgroup 数并累加统计；
     * itemCount 为 0 时静默跳过，调用方无需自己判空。
     *
     * @param pass 已开启的 compute pass encoder
     * @param itemCount 要处理的数据元素数量
     * @param options workgroup 大小与调试标签，也可直接传 workgroup 大小这个数字
     */
    dispatch(
        pass: GPUComputePassEncoder,
        itemCount: number,
        options: DispatchOptions | number = {}
    ): void {
        this.assertAlive();

        // 兼容 dispatch(pass, count, 64) 的简短写法
        const opts: DispatchOptions = typeof options === "number" ? {workgroupSize: options} : options;
        const count = this.workgroupCount(itemCount, opts.workgroupSize);

        if (count === 0) return;

        pass.dispatchWorkgroups(count);

        this.#dispatchCount++;
        this.#frameDispatchCount++;
        this.#totalWorkgroups += count;
    }

    /**
     * 多维 dispatch，用于 2D / 3D 网格的计算（例如按 (width/8, height/8) 派发的图像处理）。
     * 网格数因场景而异，没有统一的数学公式，调用方自己算（可复用 workgroupCount）。
     *
     * @param pass 已开启的 compute pass encoder
     * @param dims 三个维度的 workgroup 数量，任一维 <= 0 时静默跳过
     */
    dispatch3D(
        pass: GPUComputePassEncoder,
        dims: [number, number, number]
    ): void {
        this.assertAlive();

        const [x, y, z] = dims;

        if (x <= 0 || y <= 0 || z <= 0) return;

        const max = this.gpu.device.limits.maxComputeWorkgroupsPerDimension;

        if (x > max || y > max || z > max)
            throw new Error(t("ComputeContext.dispatch3D.error_1", { max, x, y, z }));

        pass.dispatchWorkgroups(x, y, z);

        this.#dispatchCount++;
        this.#frameDispatchCount++;
        this.#totalWorkgroups += x * y * z;
    }

    /**
     * 创建 storage buffer 的 bindgroup。
     *
     * 构造时传了 BindGroupCache 就走缓存（与渲染层共享去重），否则直接 device.createBindGroup。
     *
     * @param layout 由 PipelineManager 创建的 bindgroup layout
     * @param entries 绑定条目
     * @param label 调试标签
     */
    createStorageBindGroup(
        layout: GPUBindGroupLayout,
        entries: GPUBindGroupEntry[],
        label?: string
    ): GPUBindGroup {
        this.assertAlive();

        if (this.bg)
            return this.bg.getOrCreate(layout, entries, label);

        return this.gpu.device.createBindGroup({
            layout,
            entries,
            label: label ?? "compute:bindgroup"
        });
    }

    /**
     * 在编码器上写一个开始时间戳，必须与一次 endTiming 配对，且在提交前调用。
     *
     * ```ts
     * cc.beginTiming(encoder, "force");
     * // ... 记录 compute pass ...
     * cc.endTiming(encoder);
     * ```
     *
     * @param encoder 命令编码器
     * @param label 计时段名字，readTimings 用它做 key
     */
    beginTiming(encoder: GPUCommandEncoder, label: string): void {
        if (!this.timingSupported || !this.#timingQuerySet) return;

        if (this.#timingSlot >= this.maxTimings) {
            Console.warning(t("ComputeContext.beginTiming.warning_1", {
                maxTimings: this.maxTimings,
                label
            }));
            return;
        }

        const slot = this.#timingSlot;

        // 写不进去就不占槽位，endTiming 会同样跳过，避免污染已有计时段
        if (!this.writeTimestamp(encoder, slot * 2)) return;

        this.#timingLabels[slot] = label;
        this.#timingSlot = slot + 1;
    }

    /**
     * 写结束时间戳，与最近一次 beginTiming 配对。
     *
     * @param encoder 命令编码器
     */
    endTiming(encoder: GPUCommandEncoder): void {
        if (!this.timingSupported || !this.#timingQuerySet) return;

        if (this.#timingSlot === 0) {
            Console.warning(t("ComputeContext.endTiming.warning_1"));
            return;
        }

        this.writeTimestamp(encoder, (this.#timingSlot - 1) * 2 + 1);
    }

    /**
     * 把本轮记录的时间戳 resolve 到可读 buffer，必须在 queue.submit 之前调用。
     *
     * ```ts
     * cc.resolveTimings(encoder);
     * queue.submit([encoder.finish()]);
     * const timings = await cc.readTimings();
     * ```
     *
     * @param encoder 命令编码器
     */
    resolveTimings(encoder: GPUCommandEncoder): void {
        const querySet = this.#timingQuerySet;
        const resolveBuffer = this.#timingResolveBuffer;
        const readbackBuffer = this.#timingReadbackBuffer;

        if (!this.timingSupported || this.#timingSlot === 0) return;
        if (!querySet || !resolveBuffer || !readbackBuffer) return;

        const byteSize = this.#timingSlot * 2 * TIMESTAMP_BYTES;

        // querySet → resolve buffer
        encoder.resolveQuerySet(querySet, 0, this.#timingSlot * 2, resolveBuffer, 0);

        // resolve buffer → readback buffer：QUERY_RESOLVE 与 MAP_READ 不能是同一个 buffer
        encoder.copyBufferToBuffer(resolveBuffer, 0, readbackBuffer, 0, byteSize);
    }

    /**
     * 异步读取上次 resolve 的时间戳结果，返回 label → 毫秒。
     *
     * 必须在 queue.submit 之后调用（GPU 此时才会执行完），并在帧的边界 await，不要卡住渲染；
     * 内部会提前清空本轮槽位，下一帧可以重新记录。
     */
    async readTimings(): Promise<TimingResult> {
        const readbackBuffer = this.#timingReadbackBuffer;

        if (!this.timingSupported || !readbackBuffer || this.#timingSlot === 0) return {};

        if (this.#timingReading) {
            Console.warning(t("ComputeContext.readTimings.warning_1"));
            return {};
        }

        const slotCount = this.#timingSlot;
        const labels = this.#timingLabels.slice(0, slotCount);

        // 提前重置：即使调用方不 await，下一帧的 beginTiming 也从 slot 0 开始
        this.#timingSlot = 0;
        this.#timingLabels = [];

        this.#timingReading = true;

        try {
            if (readbackBuffer.mapState === "mapped") readbackBuffer.unmap();

            await readbackBuffer.mapAsync(GPUMapMode.READ);

            const data = new BigUint64Array(readbackBuffer.getMappedRange());
            const result: TimingResult = {};

            for (let i = 0; i < slotCount; i++)
                result[labels[i]] = Number(data[i * 2 + 1] - data[i * 2]) / 1e6;   // ns → ms

            readbackBuffer.unmap();
            this.#timingReading = false;

            return result;
        } catch (err) {
            Console.error(t("ComputeContext.readTimings.error_1"), err);
            this.#timingReading = false;

            return {};
        }
    }

    /** 重置帧统计。Renderer 在每帧开始时调用 */
    resetFrameStats(): void {
        this.#frameDispatchCount = 0;
    }

    /**
     * 释放本类独占创建的时间戳资源。
     * GPUContext / ResourceManager / BindGroupCache 的生命周期由 Renderer 管理，这里不动它们。
     */
    dispose(): void {
        if (this.#disposed) return;

        this.destroyTimingResources();

        this.#timingSlot = 0;
        this.#timingLabels = [];
        this.#timingReading = false;
        this.#disposed = true;
    }

    /**
     * 创建时间戳相关的 querySet 与两个 buffer。
     * 失败（特性缺失、资源超限等）时返回 false 并清理残余资源，由构造函数降级处理。
     */
    private createTimingResources(): boolean {
        const device = this.gpu.device;
        const queryCount = this.maxTimings * 2;
        const bufferSize = queryCount * TIMESTAMP_BYTES;

        try {
            this.#timingQuerySet = device.createQuerySet({
                type: "timestamp",
                count: queryCount,
                label: "compute:timing-query"
            });

            this.#timingResolveBuffer = device.createBuffer({
                size: bufferSize,
                usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
                label: "compute:timing-resolve"
            });

            this.#timingReadbackBuffer = device.createBuffer({
                size: bufferSize,
                usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
                label: "compute:timing-readback"
            });

            return true;
        } catch (err) {
            Console.warning(t("ComputeContext.createTimingResources.warning_1"), err);
            this.destroyTimingResources();

            return false;
        }
    }

    /** 销毁时间戳资源并把引用置空 */
    private destroyTimingResources(): void {
        this.#timingQuerySet?.destroy();
        this.#timingQuerySet = null;

        this.#timingResolveBuffer?.destroy();
        this.#timingResolveBuffer = null;

        this.#timingReadbackBuffer?.destroy();
        this.#timingReadbackBuffer = null;
    }

    /**
     * 往 querySet 的指定下标写时间戳。
     * 编码器没有 writeTimestamp（实现未提供该可选方法）时只提示一次并返回 false。
     */
    private writeTimestamp(encoder: GPUCommandEncoder, queryIndex: number): boolean {
        const querySet = this.#timingQuerySet;
        const tsEncoder = encoder as TimestampWritableEncoder;

        if (!querySet) return false;

        if (typeof tsEncoder.writeTimestamp !== "function") {
            if (!this.#warnedNoWriteTimestamp) {
                Console.warning(t("ComputeContext.writeTimestamp.warning_1"));
                this.#warnedNoWriteTimestamp = true;
            }

            return false;
        }

        tsEncoder.writeTimestamp?.(querySet, queryIndex);

        return true;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("ComputeContext.assertAlive.error_1"));
    }
}
