// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PingPongBuffer.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 双缓冲容器：持有两个等大的 StorageBuffer 并维护读写指针，提供 swap / reset / 双侧上传语义
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { ResourceManager } from "../gpu/ResourceManager";
import { StorageBuffer } from "./StorageBuffer";


/**
 * 双缓冲构造选项。
 */
export interface PingPongBufferOptions {
    /** 元素数量，两侧 buffer 完全一致 */
    itemCount: number;

    /** 每个元素的字节数，必须是 4 的倍数 */
    stride: number;

    /** 额外的 usage 位，两侧 buffer 都应用（如 GPUBufferUsage.VERTEX） */
    extraUsage?: GPUBufferUsageFlags;

    /** 调试标签前缀，实际会拼成 `${label}:a` / `${label}:b` */
    label?: string;
}


const DEFAULT_PINGPONG_BUFFER_OPTIONS: Required<Pick<PingPongBufferOptions, "label" | "extraUsage">> = {
    label: "pingpong",
    extraUsage: 0
};


/**
 * 双缓冲容器（ping-pong）。
 *
 * 为什么需要 ping-pong：compute shader 在同一次 dispatch 里不能既读又写同一个 storage buffer ——
 * 并行执行不保证读写顺序，结果未定义。所以"积分一步"这类操作必须读一侧、写另一侧，
 * 下一次交换方向，交替进行。
 *
 * 它做的事：
 *   1. 一次性创建两个等大的 StorageBuffer（a / b）
 *   2. read / write 暴露"当前读写方向"
 *   3. swap() 交换方向，reset() 重置回初始方向
 *   4. uploadBoth / uploadToWrite / uploadToRead 提供三种上传意图
 *   5. dispose() 级联释放两侧 buffer
 *
 * 它不做的事：
 *   - 不创建 bindgroup：binding 数量与 layout 只有上层知道，上层缓存 AB / BA 两个绑定组，swap 时换引用
 *   - 不感知字段布局（那是 Simulation 层的活）
 *   - 不自动 swap（交换时机是语义相关的，由调用方在积分 pass 之后决定）
 *   - 不做 readback（回读请显式指定侧：pp.read.readback()）
 *
 * 不变量：
 *   - 任意时刻 read !== write
 *   - 两侧的 itemCount / stride / byteLength 完全一致
 *   - reset() 之后 read 总是 a，write 总是 b
 *
 * 用法：
 *   const pos = new PingPongBuffer(rm, { itemCount, stride: 16 });
 *   pos.uploadBoth(initialPositions);
 *   // 每帧：绑定 read / write、dispatch，然后 pos.swap()
 */
export class PingPongBuffer {
    /** a 侧缓冲，初始方向下即"读"侧 */
    readonly a: StorageBuffer;

    /** b 侧缓冲，初始方向下即"写"侧 */
    readonly b: StorageBuffer;

    /** 当前方向：0 → read = a / write = b，1 → read = b / write = a */
    #current: 0 | 1 = 0;

    /** swap 次数，reset() 时归零；满足 swapCount % 2 === current */
    #swapCount = 0;

    #disposed = false;

    constructor(rm: ResourceManager, options: PingPongBufferOptions) {
        // 两个 buffer 参数完全一致，保证不变量
        const label = options.label ?? DEFAULT_PINGPONG_BUFFER_OPTIONS.label;
        const extraUsage = options.extraUsage ?? DEFAULT_PINGPONG_BUFFER_OPTIONS.extraUsage;

        this.a = new StorageBuffer(rm, {
            itemCount: options.itemCount,
            stride: options.stride,
            extraUsage,
            label: `${label}:a`
        });

        this.b = new StorageBuffer(rm, {
            itemCount: options.itemCount,
            stride: options.stride,
            extraUsage,
            label: `${label}:b`
        });
    }

    /** 当前"读"缓冲：绑到 compute shader 的输入 binding */
    get read(): StorageBuffer {
        return this.#current === 0 ? this.a : this.b;
    }

    /** 当前"写"缓冲：绑到 compute shader 的输出 binding */
    get write(): StorageBuffer {
        return this.#current === 0 ? this.b : this.a;
    }

    /** 当前读写方向，0 = (read a, write b)，1 = (read b, write a) */
    get current(): 0 | 1 {
        return this.#current;
    }

    /** 已执行的 swap 次数，可用于调试日志 */
    get swapCount(): number {
        return this.#swapCount;
    }

    /** 元素数量（转发自 a，两侧一致） */
    get itemCount(): number {
        return this.a.itemCount;
    }

    /** 每个元素的字节数（转发自 a） */
    get stride(): number {
        return this.a.stride;
    }

    /** 单个 buffer 的总字节数（转发自 a） */
    get byteLength(): number {
        return this.a.byteLength;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /**
     * 交换读写方向：把上一帧写的 buffer 作为下一帧的读 buffer，反之亦然。
     *
     * 典型时机是积分 pass 的 pass.end() 之后；同帧有多个依赖的 compute pass 时每 pass 后调一次。
     * 不要在一次 pass 中途调用 —— swap 只切换绑定指针，不改变 GPU 状态。
     */
    swap(): void {
        this.assertAlive();

        this.#current = (1 - this.#current) as 0 | 1;
        this.#swapCount++;
    }

    /** 重置到初始方向（read = a，write = b）并让 swapCount 归零；用于场景重置 / 仿真重启 */
    reset(): void {
        this.assertAlive();

        this.#current = 0;
        this.#swapCount = 0;
    }

    /**
     * 向两侧上传同一份数据，用于初始化。
     *
     * 两个 buffer 刚创建时都未初始化：只填一侧的话，第一次 swap 后读另一侧会拿到垃圾数据，
     * 首帧就积出 NaN。所以初始化两侧都填同一份初始状态。
     * 场景中途修正请用 uploadToWrite / uploadToRead。
     */
    uploadBoth(data: ArrayBufferView): void {
        this.assertAlive();

        this.a.upload(data);
        this.b.upload(data);
    }

    /**
     * 向当前"写"一侧上传数据。
     *
     * 只改一侧是安全的：下一次 swap 后读到的是新数据，而写侧本来就会被 compute 覆盖。
     */
    uploadToWrite(data: ArrayBufferView): void {
        this.assertAlive();

        this.write.upload(data);
    }

    /**
     * 向当前"读"一侧上传数据。
     *
     * 用于"读取端也需要修正"的场景：例如仿真暂停时用户改了位置，恢复后首帧的力计算读的就是这一侧，
     * 只改写侧会让修正在下一帧被覆盖。
     */
    uploadToRead(data: ArrayBufferView): void {
        this.assertAlive();

        this.read.upload(data);
    }

    /** 级联释放两侧 buffer。幂等 */
    dispose(): void {
        if (this.#disposed) return;

        this.a.dispose();
        this.b.dispose();

        this.#disposed = true;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error("MsgId: PingPongBuffer 已经销毁，无法操作双缓冲");
    }
}
