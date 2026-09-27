// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Geometry.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 几何体基类：持有顶点数据、顶点布局与 GPU 缓冲生命周期
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Nullable } from "@wmv/common";
import type { ResourceManager } from "../gpu/ResourceManager";


/** 交错格式下单个顶点的浮点数个数：position(3) + normal(3) */
export const INTERLEAVED_FLOATS_PER_VERTEX = 6;

/** 交错格式下单个顶点的字节数 */
export const INTERLEAVED_BYTES_PER_VERTEX = INTERLEAVED_FLOATS_PER_VERTEX * 4;

/** 顶点属性 location 常量，shader 与 pipeline 共用 */
export const ATTRIB_POSITION = 0;

/** 法线属性的 location */
export const ATTRIB_NORMAL = 1;


/** 包围盒 + 包围球，构造时算一次后不再变化 */
export interface Bounds {
    /** 各轴最小坐标 */
    min: [number, number, number];

    /** 各轴最大坐标 */
    max: [number, number, number];

    /** 盒子中心，同时作为包围球球心 */
    center: [number, number, number];

    /** 包围球半径：球心到最远顶点的距离 */
    radius: number;
}


function toFloat32(src: Float32Array | number[]): Float32Array {
    return src instanceof Float32Array ? src : new Float32Array(src);
}

function toUint32(src: Uint32Array | number[]): Uint32Array {
    return src instanceof Uint32Array ? src : new Uint32Array(src);
}

/**
 * 计算顶点位置的包围盒与包围球。
 * 空顶点返回零包围盒。
 */
function computeBounds(positions: Float32Array): Bounds {
    if (positions.length === 0)
        return {
            min: [0, 0, 0],
            max: [0, 0, 0],
            center: [0, 0, 0],
            radius: 0
        };

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i], y = positions[i + 1], z = positions[i + 2];

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    let maxDistSq = 0;

    for (let i = 0; i < positions.length; i += 3) {
        const dx = positions[i] - cx;
        const dy = positions[i + 1] - cy;
        const dz = positions[i + 2] - cz;
        const d2 = dx * dx + dy * dy + dz * dz;

        if (d2 > maxDistSq) maxDistSq = d2;
    }

    return {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        center: [cx, cy, cz],
        radius: Math.sqrt(maxDistSq)
    };
}


/**
 * 几何体基类。
 *
 * 它做的事：
 *   1. 接收 positions / normals / indices，打包成交错顶点数据
 *   2. 定义 vertexLayout（arrayStride + attributes）
 *   3. 按需上传到 GPU（由调用方提供 ResourceManager）
 *   4. 保留 CPU 侧数据，供 CPU 拾取 / 包围盒 / 导出使用
 *   5. dispose 时释放 GPU 缓冲
 *
 * 它不做的事：创建 pipeline、管变换（那是 Mesh 的活）、管材质（那是 Material 的活）、自动上传。
 *
 * 交错布局：[ px, py, pz, nx, ny, nz, ... ]，arrayStride = 24 字节；
 * location 0 = position(vec3) @ offset 0，location 1 = normal(vec3) @ offset 12。
 * 索引统一 uint32，draw 时无需判断类型。
 */
export abstract class Geometry {
    #disposed = false;

    /** 上传时使用的 ResourceManager，dispose 时用它销毁缓冲 */
    private rm: Nullable<ResourceManager> = null;

    /** 顶点位置，长度 = vertexCount * 3 */
    readonly positions: Float32Array;

    /** 顶点法线，长度 = vertexCount * 3 */
    readonly normals: Float32Array;

    /** 三角形索引，长度 = indexCount */
    readonly indices: Uint32Array;

    /** 交错顶点数据，长度 = vertexCount * INTERLEAVED_FLOATS_PER_VERTEX */
    readonly interleaved: Float32Array;

    /** 顶点数量 */
    readonly vertexCount: number;

    /** 索引数量，即 drawIndexed 的第一个参数 */
    readonly indexCount: number;

    /** 包围盒，构造时计算一次 */
    readonly bounds: Bounds;

    /** 顶点缓冲布局，由基类提供默认实现（position + normal），子类可覆写 */
    readonly vertexLayout: GPUVertexBufferLayout;

    /** 顶点缓冲，未上传时为 null */
    vertexBuffer: Nullable<GPUBuffer> = null;

    /** 索引缓冲，未上传时为 null */
    indexBuffer: Nullable<GPUBuffer> = null;

    /**
     * 子类通过 super(...) 提供数据。
     * positions / normals 长度必须是 vertexCount * 3 且两者相等，indices 长度即 indexCount。
     */
    protected constructor(
        positions: Float32Array | number[],
        normals: Float32Array | number[],
        indices: Uint32Array | number[]
    ) {
        this.positions = toFloat32(positions);
        this.normals = toFloat32(normals);
        this.indices = toUint32(indices);

        if (this.normals.length !== this.positions.length)
            throw new Error(
                `MsgId: positions 与 normals 数量不匹配: ${this.positions.length} vs ${this.normals.length}`
            );

        this.vertexCount = this.positions.length / 3;
        this.indexCount = this.indices.length;

        this.interleaved = this.buildInterleaved();
        this.bounds = computeBounds(this.positions);

        this.vertexLayout = {
            arrayStride: INTERLEAVED_BYTES_PER_VERTEX,
            attributes: [
                {shaderLocation: ATTRIB_POSITION, offset: 0, format: "float32x3"},
                {shaderLocation: ATTRIB_NORMAL, offset: 12, format: "float32x3"}
            ]
        };
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 是否已上传到 GPU，未上传的几何不应参与 draw */
    get uploaded(): boolean {
        return this.vertexBuffer !== null && this.indexBuffer !== null;
    }

    /**
     * 上传到 GPU：创建顶点 / 索引缓冲并写入数据。
     *
     * 幂等：已上传时直接返回。第一次调用会记录 rm，供 dispose 销毁缓冲。
     */
    upload(rm: ResourceManager): void {
        this.assertAlive();

        if (this.vertexBuffer) return;

        this.rm = rm;

        const name = this.constructor.name;

        this.vertexBuffer = rm.create("vertex-buffer", this.interleaved, `geometry:${name}:vertex`);
        this.indexBuffer = rm.create("index-buffer", this.indices, `geometry:${name}:index`);
    }

    /**
     * 释放 GPU 缓冲。
     *
     * CPU 数据（positions / normals / indices / interleaved / bounds）保留不清空，
     * 它们由 GC 回收，调用方销毁后仍可读取。
     */
    dispose(): void {
        if (this.#disposed) return;

        const rm = this.rm;

        if (rm) {
            if (this.vertexBuffer) {
                rm.destroy(this.vertexBuffer);
                this.vertexBuffer = null;
            }

            if (this.indexBuffer) {
                rm.destroy(this.indexBuffer);
                this.indexBuffer = null;
            }

            this.rm = null;
        }

        this.#disposed = true;
    }

    /**
     * 将 positions / normals 打包成交错格式，默认布局 [px, py, pz, nx, ny, nz, ...]。
     * 子类需要额外属性（uv / color）时可覆写。
     */
    protected buildInterleaved(): Float32Array {
        const n = this.vertexCount;
        const out = new Float32Array(n * INTERLEAVED_FLOATS_PER_VERTEX);

        for (let i = 0; i < n; i++) {
            const src = i * 3;
            const dst = i * INTERLEAVED_FLOATS_PER_VERTEX;

            out[dst] = this.positions[src];
            out[dst + 1] = this.positions[src + 1];
            out[dst + 2] = this.positions[src + 2];
            out[dst + 3] = this.normals[src];
            out[dst + 4] = this.normals[src + 1];
            out[dst + 5] = this.normals[src + 2];
        }

        return out;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error("MsgId: 几何体已经销毁，无法上传");
    }

}
