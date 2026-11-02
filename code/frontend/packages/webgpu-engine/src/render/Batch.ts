// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Batch.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/10/28
 * @desc 实例化批次：一个几何体 + 一段实例数据，一次 draw 画完。
 *
 *       P1：96 B/实例（mat4 + color + id），用 vertex buffer + 实例属性。
 *       P3：球 / 柱改成紧凑 storage buffer（32 B / 48 B），配合 compute 剔除与
 *           indirect draw；渲染与拾取都直接读同一份 storage，不再走实例属性。
 *
 *       三种实例布局：
 *         mesh     96 B：[model mat4][color vec4][id u32][pad]
 *         sphere   32 B：[center.xyz + radius][color u32][id u32][pad]
 *         cylinder 48 B：[a.xyz + radius][b.xyz][color u32][id u32][pad]
 *
 *       缓存友好性（文档 08 §3）：
 *         - 100k 球 = 3.2 MB，100k 柱 = 4.8 MB，整批连续，draw 顺序即内存顺序；
 *         - 不再有 9362 个小 uniform buffer / bind group；
 *         - 剔除后的可见索引也是连续 u32 数组，顶点阶段顺序读取。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Geometry } from "./Geometry";
import type { ResourceManager } from "../gpu/ResourceManager";
import { Console, type Nullable } from "@wmv/common";


/** mesh 批次：单个实例的 float 数量（24 × 4 = 96 B） */
export const BATCH_INSTANCE_FLOATS = 24;

/** mesh 批次：单个实例的字节数 */
export const BATCH_INSTANCE_BYTES = BATCH_INSTANCE_FLOATS * 4;

/** 球实例字节数：center(vec4) + color(u32) + id(u32) + pad(8) */
export const SPHERE_INSTANCE_BYTES = 32;

/** 柱实例字节数：a(vec4) + b(vec4) + color(u32) + id(u32) + pad(8) */
export const CYLINDER_INSTANCE_BYTES = 48;

/** 实例数据里 model 矩阵的 float 偏移（mesh） */
export const BATCH_MODEL_OFFSET = 0;

/** 实例数据里颜色的 float 偏移（mesh） */
export const BATCH_COLOR_OFFSET = 16;

/** 实例数据里 objectId 的 float 偏移（mesh） */
export const BATCH_ID_OFFSET = 20;

/** 紧凑布局里 color / id 的字节偏移 */
export const SPHERE_COLOR_OFFSET = 16;
export const SPHERE_ID_OFFSET = 20;
export const CYLINDER_COLOR_OFFSET = 32;
export const CYLINDER_ID_OFFSET = 36;

/** 索引数量（quad = 6）由几何体决定；indirect args 里其余字段固定 */
const INDIRECT_ARGS_FLOATS = 5;

/** 实例属性的 shader location（仅 mesh 批次使用） */
export const BATCH_ATTRIB_MODEL = 2;
export const BATCH_ATTRIB_COLOR = 6;
export const BATCH_ATTRIB_ID = 7;


/** 批次的绘制类型：网格 / 球 impostor / 柱 impostor */
export type BatchKind = "mesh" | "sphere" | "cylinder";


export interface BatchOptions {
    /** 几何体。批次内所有实例共享它（必须是"单位形状"，尺寸由实例矩阵/参数决定） */
    geometry: Geometry;

    /**
     * 绘制类型。
     *   - 'sphere' / 'cylinder'：几何体是单位 quad，storage buffer + 解析求交（P2/P3）
     *   - 'mesh'：传统网格 + 实例属性（兼容路径）
     */
    kind?: BatchKind;

    /**
     * 拾取用的几何体。仅 mesh 批次需要（impostor 用 compute 拾取）。
     * 保留字段是为了回退路径。
     */
    pickGeometry?: Geometry;

    /**
     * 实例数据，按 kind 对应的 stride 为一组。
     * 不传时为空批次，之后用 setInstances() 填充。
     */
    instances?: Float32Array;

    /** 实例数量。默认由 instances.length / stride 推导 */
    count?: number;

    /** 调试名 */
    name?: string;

    /** 是否可见，默认 true */
    visible?: boolean;

    /** 可选的 ResourceManager。传入时创建 GPU 缓冲 */
    rm?: ResourceManager;
}


/**
 * 实例化批次。
 *
 * 生命周期与 Mesh 类似（scene 持有、表示变化时重建数据），但**不拥有几何体**：
 * 单位 quad 由引擎侧共享，批次销毁只释放自己的实例/可见性/indirect 缓冲。
 */
export class Batch {
    /** 调试名 */
    name?: string;

    /** 是否可见。pass 遍历时跳过 false 的批次 */
    visible: boolean;

    /** 实例位置是否被 GPU 模拟改写（true 时 CPU 拾取数据已过期，需走 compute 拾取） */
    dynamic = false;

    /** 共享的单位几何体 */
    readonly geometry: Geometry;

    /** 绘制类型（mesh / sphere / cylinder） */
    readonly kind: BatchKind;

    /** 拾取几何体（仅 mesh 回退路径使用） */
    readonly pickGeometry: Nullable<Geometry>;

    /**
     * mesh 批次的实例顶点缓冲（P1 路径）。
     * GPU 批次（sphere/cylinder）为 null，改用 storageBuffer。
     */
    instanceBuffer: Nullable<GPUBuffer> = null;

    /** 紧凑实例 storage buffer（P3：sphere/cylinder） */
    storageBuffer: Nullable<GPUBuffer> = null;

    /** 剔除后的可见实例索引（u32），GPU 批次专用 */
    visibleBuffer: Nullable<GPUBuffer> = null;

    /** drawIndexedIndirect 的参数：[indexCount, instanceCount, firstIndex, baseVertex, firstInstance] */
    argsBuffer: Nullable<GPUBuffer> = null;

    /** 当前实例数 */
    #count = 0;

    /** 实例数据（容量可能大于 count） */
    #data: Float32Array;

    /** 已分配的实例缓冲字节数 */
    #bufferBytes = 0;

    #disposed = false;

    private readonly rm: Nullable<ResourceManager>;

    constructor(options: BatchOptions) {
        this.geometry = options.geometry;
        this.kind = options.kind ?? "mesh";
        this.pickGeometry = options.pickGeometry ?? null;
        this.name = options.name;
        this.visible = options.visible ?? true;
        this.rm = options.rm ?? null;

        const data = options.instances ?? new Float32Array(0);
        this.#data = data;
        this.#count = options.count ?? Math.floor(data.length / this.strideFloats);

        if (this.rm && this.#count > 0)
            this.recreateBuffer(this.#count);
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 当前实例数 */
    get count(): number {
        return this.#count;
    }

    /** 实例数据（只读访问，供调试 / 测试） */
    get data(): Float32Array {
        return this.#data;
    }

    /** 单个实例的 float 数 */
    get strideFloats(): number {
        return this.kind === "mesh"
            ? BATCH_INSTANCE_FLOATS
            : this.kind === "sphere"
                ? SPHERE_INSTANCE_BYTES / 4
                : CYLINDER_INSTANCE_BYTES / 4;
    }

    /** 单个实例的字节数 */
    get strideBytes(): number {
        return this.strideFloats * 4;
    }

    /** 是否走 storage buffer + compute 剔除 / indirect 的 GPU 路径 */
    get gpuDriven(): boolean {
        return this.kind !== "mesh";
    }

    /**
     * 替换整个批次的实例数据。
     *
     * - 数据量变大时重建缓冲；否则原地 writeBuffer（避免滑块拖动时反复分配显存）。
     * - count 可以为 0（例如空间填充模式下的键批次），此时 draw 会被 pass 跳过。
     */
    setInstances(data: Float32Array, count: number): void {
        this.assertAlive();

        this.#data = data;
        this.#count = count;
        this.dynamic = false;

        if (!this.rm) return;

        const bytes = count * this.strideBytes;
        if (bytes > this.#bufferBytes) {
            this.recreateBuffer(count);
            return;
        }

        if (bytes <= 0) return;

        if (this.gpuDriven) {
            if (this.storageBuffer)
                this.rm.writeBuffer(this.storageBuffer, data.subarray(0, count * this.strideFloats));
        } else if (this.instanceBuffer) {
            this.rm.writeBuffer(this.instanceBuffer, data.subarray(0, count * this.strideFloats));
        }
    }

    /**
     * 只改某个实例的颜色（选中高亮用，不重建整个批次）。
     * @param index 实例下标
     * @param color 线性 RGB
     */
    setInstanceColor(index: number, color: readonly [number, number, number]): void {
        this.assertAlive();

        if (!this.rm) return;
        if (index < 0 || index >= this.#count) return;

        if (this.gpuDriven) {
            if (!this.storageBuffer) return;

            const offset = index * this.strideBytes
                + (this.kind === "sphere" ? SPHERE_COLOR_OFFSET : CYLINDER_COLOR_OFFSET);

            this.rm.writeBuffer(this.storageBuffer, new Uint32Array([packColor(color)]), offset);
            return;
        }

        if (!this.instanceBuffer) return;

        const offset = index * BATCH_INSTANCE_BYTES + BATCH_COLOR_OFFSET * 4;
        this.rm.writeBuffer(
            this.instanceBuffer,
            new Float32Array([color[0], color[1], color[2], 1]),
            offset
        );
    }

    /** 释放 GPU 缓冲。几何体是共享的，不在这里销毁 */
    dispose(): void {
        if (this.#disposed) return;

        this.destroyBuffers();

        this.#count = 0;
        this.#bufferBytes = 0;
        this.#disposed = true;
    }

    private recreateBuffer(count: number): void {
        if (!this.rm) return;

        this.destroyBuffers();

        if (this.gpuDriven) {
            // 实例 storage
            this.storageBuffer = this.rm.create(
                "storage-buffer",
                count * this.strideBytes,
                {label: `batch:${this.name ?? "unnamed"}:instances`}
            );
            this.rm.writeBuffer(this.storageBuffer, this.#data.subarray(0, count * this.strideFloats));

            // 可见性索引（cull 写入，draw 读取）
            this.visibleBuffer = this.rm.create(
                "storage-buffer",
                count * 4,
                {label: `batch:${this.name ?? "unnamed"}:visible`}
            );

            // indirect args：indexCount 由几何体决定，instanceCount 由 cull 写
            const args = new Uint32Array(INDIRECT_ARGS_FLOATS);
            args[0] = this.geometry.indexCount;
            args[1] = 0;

            this.argsBuffer = this.rm.create("buffer", {
                size: INDIRECT_ARGS_FLOATS * 4,
                usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                label: `batch:${this.name ?? "unnamed"}:args`,
            });
            this.rm.writeBuffer(this.argsBuffer, args);
        } else {
            this.instanceBuffer = this.rm.create(
                "vertex-buffer",
                this.#data.subarray(0, count * BATCH_INSTANCE_FLOATS),
                `batch:${this.name ?? "unnamed"}:instances`
            );
        }

        this.#bufferBytes = count * this.strideBytes;
    }

    private destroyBuffers(): void {
        if (!this.rm) return;

        if (this.instanceBuffer) {
            this.rm.destroy(this.instanceBuffer);
            this.instanceBuffer = null;
        }

        if (this.storageBuffer) {
            this.rm.destroy(this.storageBuffer);
            this.storageBuffer = null;
        }

        if (this.visibleBuffer) {
            this.rm.destroy(this.visibleBuffer);
            this.visibleBuffer = null;
        }

        if (this.argsBuffer) {
            this.rm.destroy(this.argsBuffer);
            this.argsBuffer = null;
        }

        this.#bufferBytes = 0;
    }

    private assertAlive(): void {
        if (this.#disposed) {
            Console.error("MsgId: Batch 已销毁，不能再设置实例数据");

            throw new Error("Batch is disposed");
        }
    }
}


/** 线性 RGB → RGBA8 打包（低 8 位 R，其次 G、B，最高 8 位 A=255） */
export function packColor(color: readonly [number, number, number]): number {
    const r = Math.round(Math.min(1, Math.max(0, color[0])) * 255);
    const g = Math.round(Math.min(1, Math.max(0, color[1])) * 255);
    const b = Math.round(Math.min(1, Math.max(0, color[2])) * 255);

    return (r | (g << 8) | (b << 16) | (255 << 24)) >>> 0;
}

