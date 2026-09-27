// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file StorageBuffer.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc GPU 存储缓冲的语义化封装：上传 / 局部上传 / 异步回读 / 生命周期
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Nullable } from "@wmv/common";
import type { ResourceManager } from "../gpu/ResourceManager";


/** 可缺省项的默认值 */
const DEFAULT_STORAGE_BUFFER_OPTIONS: Required<Pick<StorageBufferOptions, "extraUsage" | "label">> = {
    extraUsage: 0,
    label: "<storage>"
};


/** StorageBuffer 的构造选项 */
export interface StorageBufferOptions {
    /** 元素数量，可以为 0（此时 GPU 上是一个占位的 4 字节缓冲） */
    itemCount: number;

    /** 每个元素的字节数，必须是正的 4 的倍数 */
    stride: number;

    /**
     * 额外的 usage 位。STORAGE / COPY_DST / COPY_SRC 由本类自动加上，这里只填"额外"的位，
     * 例如 GPUBufferUsage.VERTEX（同一份数据既给 compute 写、又给渲染读）。
     */
    extraUsage?: GPUBufferUsageFlags;

    /** 调试标签 */
    label?: string;
}


/**
 * GPU 存储缓冲的语义化封装。它只认识"字节块"，不认识原子、力场这类业务概念。
 *
 * 它做的事：
 *   1. 创建 STORAGE | COPY_DST | COPY_SRC 的 GPUBuffer（可附加额外 usage 位）
 *   2. upload(data) 整块上传、uploadAt(data, offset) 按字节局部上传、uploadElement(index, data) 按元素上传
 *   3. readback() 异步回读，并在内部缓存回读缓冲（首次调用才创建，之后复用）
 *   4. dispose() 释放主缓冲与回读缓冲
 *
 * 它不做的事：
 *   - 不创建 bindgroup（由 ComputeContext 负责）
 *   - 不解析字段布局、不算 stride 的业务含义（由调用方决定 itemCount 与 stride）
 *   - 不处理 ping-pong（由 PingPongBuffer 负责）
 *
 * 数据布局：调用方负责给出 itemCount 与 stride，例如"原子位置 = vec3<f32> + pad"就是 stride 16；
 * 对应 WGSL 的 `struct Atom { pos: vec3<f32>, _pad: f32 }` + `var<storage, read_write> atoms: array<Atom>`。
 *
 * 回读约束：同一时刻只允许一个 readback 在进行（mapAsync 不能对同一 buffer 重入），
 * 并发调用会直接抛错，要求调用方自己 await 排队。
 */
export class StorageBuffer {
    #disposed = false;

    /** 是否有 readback 正在进行，用来拒绝并发的 mapAsync */
    #reading = false;

    /** 回读缓冲。首次 readback 时惰性创建，之后复用；由本类独占创建，也由本类销毁 */
    #readbackBuffer: Nullable<GPUBuffer> = null;

    /** 创建 / 销毁缓冲用的资源管理器 */
    private readonly rm: ResourceManager;

    /** 底层 GPUBuffer。绑定 bindgroup 时用这个 */
    readonly buffer: GPUBuffer;

    /** 元素数量 */
    readonly itemCount: number;

    /** 每个元素的字节数 */
    readonly stride: number;

    /** 数据字节数 = itemCount * stride。GPU 上实际分配的 size 会向上取整，可能略大于它 */
    readonly byteLength: number;

    /** 调试标签 */
    readonly label: string;

    /**
     * 创建底层缓冲。
     * itemCount / stride 的校验在这里完成，stride 不是 4 的倍数时立即抛错，
     * 避免 WGSL 里 `array<T>` 的寻址错位。
     */
    constructor(rm: ResourceManager, options: StorageBufferOptions) {
        const {itemCount, stride} = options;

        if (itemCount < 0)
            throw new Error(`MsgId: storage buffer 的 itemCount 必须 >= 0，实际为 ${itemCount}`);

        if (stride <= 0 || stride % 4 !== 0)
            throw new Error(`MsgId: storage buffer 的 stride 必须是正的 4 的倍数，实际为 ${stride}`);

        const extraUsage = options.extraUsage ?? DEFAULT_STORAGE_BUFFER_OPTIONS.extraUsage;
        const label = options.label ?? DEFAULT_STORAGE_BUFFER_OPTIONS.label;

        this.rm = rm;
        this.itemCount = itemCount;
        this.stride = stride;
        this.byteLength = itemCount * stride;
        this.label = label;

        // WebGPU 要求 size > 0，itemCount = 0 时用最小 4 字节占位
        const size = Math.max(4, this.byteLength);

        // ResourceManager 的 storage 通道能表达的附加位只有 VERTEX（COPY_SRC 回读必需，恒定打开）；
        // 含其它位（INDIRECT / UNIFORM 等）时改走通用 buffer 通道，usage 由本类组合，不静默丢弃。
        if (extraUsage === 0 || extraUsage === GPUBufferUsage.VERTEX)
            this.buffer = rm.create("storage-buffer", size, {
                vertex: extraUsage === GPUBufferUsage.VERTEX,
                copySrc: true,
                label: `storage:${label}`
            });
        else
            this.buffer = rm.create("buffer", {
                size,
                usage: GPUBufferUsage.STORAGE
                    | GPUBufferUsage.COPY_DST
                    | GPUBufferUsage.COPY_SRC
                    | extraUsage,
                label: `storage:${label}`
            });
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 是否有 readback 正在进行 */
    get isReading(): boolean {
        return this.#reading;
    }

    /**
     * 整块上传：从 offset 0 开始写入，覆盖缓冲前部。
     *
     * data 的字节数允许小于 byteLength（场景初始化时可以先只填一部分），
     * 但大于 byteLength 会抛错。
     */
    upload(data: ArrayBufferView): void {
        this.assertAlive();

        if (data.byteLength > this.byteLength)
            throw new Error(
                `MsgId: 上传数据过大：${data.byteLength} > ${this.byteLength}`
            );

        this.rm.writeBuffer(this.buffer, data);
    }

    /**
     * 局部上传：从字节偏移 offset 开始写入 data。
     * offset 必须是 4 的倍数，且 offset + data.byteLength 不得越界。
     */
    uploadAt(data: ArrayBufferView, offset: number): void {
        this.assertAlive();

        if (offset % 4 !== 0)
            throw new Error(`MsgId: offset 必须是 4 的倍数，实际为 ${offset}`);

        if (offset + data.byteLength > this.byteLength)
            throw new Error(
                `MsgId: 局部上传越界：${offset} + ${data.byteLength} > ${this.byteLength}`
            );

        this.rm.writeBuffer(this.buffer, data, offset);
    }

    /**
     * 按元素上传：替换第 index 个元素的全部数据。
     * data 的字节数必须恰好等于 stride —— 大小不符说明调用方对 stride 的理解有误，立即抛错。
     */
    uploadElement(index: number, data: ArrayBufferView): void {
        if (index < 0 || index >= this.itemCount)
            throw new Error(
                `MsgId: 元素索引越界：${index} 不在 [0, ${this.itemCount})`
            );

        if (data.byteLength !== this.stride)
            throw new Error(
                `MsgId: 元素大小不匹配：${data.byteLength} vs stride ${this.stride}`
            );

        this.uploadAt(data, index * this.stride);
    }

    /**
     * 异步回读整块数据，返回一份**拷贝**（mapAsync 的映射区在 unmap 后失效，不能让调用方持有引用）。
     *
     *   const bytes = await storageBuffer.readback();
     *   const floats = new Float32Array(bytes);
     *
     * 回读走独立的 buffer / encoder / submit，对调用方是"一步到位"的临时查看手段；
     * 需要每帧回读的生产代码应当自己管理 encoder 复用。
     */
    async readback(): Promise<ArrayBuffer> {
        this.assertAlive();

        if (this.#reading)
            throw new Error("MsgId: 上一次 readback 尚未完成，请 await 后再调用");

        // copyBufferToBuffer 不允许 size = 0，空缓冲直接返回空数据
        if (this.byteLength === 0)
            return new ArrayBuffer(0);

        // 取局部引用：dispose 会把 this.#readbackBuffer 置 null
        let readbackBuffer = this.#readbackBuffer;

        // 惰性创建回读缓冲，之后每次回读复用同一份，避免反复 create / destroy
        if (!readbackBuffer) {
            readbackBuffer = this.rm.create(
                "readback-buffer",
                this.byteLength,
                `storage-readback:${this.label}`
            );

            this.#readbackBuffer = readbackBuffer;
        }

        this.#reading = true;

        try {
            const encoder = this.rm.gpu.device.createCommandEncoder({
                label: `storage-readback:${this.label}`
            });

            encoder.copyBufferToBuffer(this.buffer, 0, readbackBuffer, 0, this.byteLength);

            this.rm.gpu.device.queue.submit([encoder.finish()]);

            await readbackBuffer.mapAsync(GPUMapMode.READ);

            const mapped = new Uint8Array(readbackBuffer.getMappedRange());
            const copy = new Uint8Array(mapped.byteLength);

            copy.set(mapped);

            readbackBuffer.unmap();

            return copy.buffer;
        } finally {
            this.#reading = false;
        }
    }

    /**
     * 释放主缓冲与回读缓冲。
     * 幂等；回读缓冲由本类创建，故也由本类销毁，不依赖 ResourceManager.disposeAll 的清理时机。
     */
    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;

        this.rm.destroy(this.buffer);

        if (this.#readbackBuffer) {
            this.rm.destroy(this.#readbackBuffer);
            this.#readbackBuffer = null;
        }
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(`MsgId: storage buffer "${this.label}" 已经销毁`);
    }

}
