// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Mesh.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 承载可渲染实体的几何 / 材质 / 变换，管理对象级 uniform buffer，实现 Scene 的 Renderable 契约
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {Geometry} from "./Geometry";
import {Material} from "./Material";
import type {Renderable} from "./Scene";
import type {ResourceManager} from "../gpu/ResourceManager";
import { Console, type Nullable } from "@wmv/common";
import { t } from "../locales";
import {mat4TRS} from "@wmv/mathematical";


/**
 * 对象级 uniform 的 float 数量。
 * 必须与 WGSL 侧 ObjectUniforms 一致：
 *   model    : mat4x4<f32> (0 ~ 15)
 *   color    : vec3<f32>   (16 ~ 18)
 *   objectId : u32         (19)
 */
export const OBJECT_UNIFORM_FLOATS = 20;

export const OBJECT_UNIFORM_BYTES = OBJECT_UNIFORM_FLOATS * 4;

/** objectId 所在的槽位下标（WGSL 侧是 u32，必须用 Uint32Array 视图写，不能用 Float32Array） */
export const OBJECT_UNIFORM_ID_SLOT = 19;


export type Vec3 = [number, number, number];


export interface MeshOptions {
    /** 几何体 */
    geometry: Geometry;

    /** 材质。不传则用默认材质 */
    material?: Material;

    /** 世界位置，默认 [0, 0, 0] */
    position?: Vec3;

    /** 欧拉角（弧度，YXZ 顺序），默认 [0, 0, 0] */
    rotation?: Vec3;

    /** 缩放。可以是单个数（均匀缩放）或 [sx, sy, sz]，默认 1 */
    scale?: number | Vec3;

    /** 调试用名字 */
    name?: string;

    /** 是否可见，默认 true */
    visible?: boolean;

    /**
     * 拾取 ID，默认 0（= 没有 ID）。
     * ID 的含义由上层定义（分子层用「原子索引 + 1」），引擎只负责原样渲染与读回。
     */
    objectId?: number;

    /**
     * 可选的 ResourceManager。
     * 传入时自动创建对象级 uniform buffer；不传则 uniformBuffer 为 null。
     */
    rm?: ResourceManager;
}


/**
 * 变换与可见性的默认值。
 * geometry 是必填项，无法整体 `{...DEFAULT, ...options}` 合并，
 * 故这里只作为默认值的唯一来源，由构造器逐项 `??` 取用。
 */
const DEFAULT_MESH_OPTIONS: Required<Pick<MeshOptions, "position" | "rotation" | "scale" | "visible" | "objectId">> = {
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1,
    visible: true,
    objectId: 0
};


export class Mesh implements Renderable {
    /** 调试名。用于 scene.findByName / 日志 / 未来的序列化 */
    name?: string;

    /** 是否可见。pass 遍历时可跳过 visible = false 的对象 */
    visible: boolean;

    /**
     * 拾取 ID。0 表示"没有 ID"（与 pick 纹理的 clearValue 一致）。
     *
     * 引擎**不解释**这个数字的含义 —— ID 空间归上层所有（分子层用「原子索引 + 1」）。
     * 拾取 pass 把它渲染进 r32uint 纹理，点击时读回那一个像素，再由上层反解成原子/键。
     */
    objectId: number;

    /** 几何体。顶点/索引缓冲与它强绑定，换几何体等于新建 Mesh */
    readonly geometry: Geometry;

    /** 材质。可以整体替换（例如在"纯色"与"按元素着色"之间切换） */
    material: Material;

    /**
     * 对象级 uniform buffer。
     * 未传入 rm 时为 null，此时 packObjectUniform() 仍可工作
     * （纯 CPU 场景 / 单元测试）。写入前调用方需检查这个字段。
     */
    readonly uniformBuffer: Nullable<GPUBuffer>;

    /** 世界位置。数组本身可原地修改，引用不变 */
    readonly position: Vec3;

    /** 欧拉角（弧度，YXZ 顺序）。数组本身可原地修改，引用不变 */
    readonly rotation: Vec3;

    /** 均匀缩放的后备字段。非均匀缩放会让法线矩阵不等于模型矩阵，故只支持单值 */
    #scale: number;

    /** 模型矩阵缓存。变换变化时置 null，下次读取时重算 */
    #modelMatrix: Nullable<Float32Array> = null;

    /** uniform 打包缓存，复用同一块内存，避免每帧产生 GC 压力 */
    #uniformData: Float32Array;

    /**
     * #uniformData 的 u32 视图，用于写 objectId 槽。
     * WGSL 侧该槽声明为 u32，用 Float32Array 写会把 1 写成 1065353216（bit pattern 不同）。
     */
    #uniformU32: Uint32Array;

    #disposed = false;

    /** 创建 uniform buffer 的 ResourceManager，dispose 时用它释放 */
    private readonly rm: Nullable<ResourceManager>;

    constructor(options: MeshOptions) {
        this.geometry = options.geometry;
        this.material = options.material ?? new Material();
        this.name = options.name;
        this.visible = options.visible ?? DEFAULT_MESH_OPTIONS.visible;
        this.objectId = options.objectId ?? DEFAULT_MESH_OPTIONS.objectId;

        this.position = copyVec3(options.position ?? DEFAULT_MESH_OPTIONS.position);
        this.rotation = copyVec3(options.rotation ?? DEFAULT_MESH_OPTIONS.rotation);
        this.#scale = normalizeScale(options.scale ?? DEFAULT_MESH_OPTIONS.scale);

        this.#uniformData = new Float32Array(OBJECT_UNIFORM_FLOATS);
        this.#uniformU32 = new Uint32Array(this.#uniformData.buffer);
        this.rm = options.rm ?? null;

        this.uniformBuffer = this.rm
            ? this.rm.create(
                "uniform-buffer",
                OBJECT_UNIFORM_BYTES,
                `mesh:${this.name ?? "unnamed"}:uniforms`
            )
            : null;
    }

    /**
     * 均匀缩放。
     *
     * 读写都走访问器：模型矩阵是带脏标记缓存的，直接给字段赋值会让缓存失效不掉
     * （`mesh.scale = 2` 是文档允许的用法，必须让缓存失效）。
     */
    get scale(): number {
        return this.#scale;
    }

    set scale(scale: number) {
        this.#scale = scale;
        this.invalidateModel();
    }

    /**
     * 模型矩阵。变换未变化时返回缓存，变化时重算。
     * 列主序 Float32Array(16)。
     */
    get modelMatrix(): Float32Array {
        if (this.#modelMatrix) return this.#modelMatrix;

        this.#modelMatrix = mat4TRS(
            this.position,
            this.rotation,
            [this.scale, this.scale, this.scale]
        );

        return this.#modelMatrix;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 设置世界位置（链式调用） */
    setPosition(x: number, y: number, z: number): this {
        this.assertAlive();

        this.position[0] = x;
        this.position[1] = y;
        this.position[2] = z;
        this.invalidateModel();

        return this;
    }

    /** 设置欧拉角（弧度，YXZ 顺序，链式调用） */
    setRotation(x: number, y: number, z: number): this {
        this.assertAlive();

        this.rotation[0] = x;
        this.rotation[1] = y;
        this.rotation[2] = z;
        this.invalidateModel();

        return this;
    }

    /** 设置均匀缩放（链式调用） */
    setScale(s: number): this {
        this.assertAlive();

        // 访问器内部会失效模型矩阵缓存
        this.scale = s;

        return this;
    }

    /** 沿某个方向增量平移（链式调用） */
    translate(dx: number, dy: number, dz: number): this {
        this.assertAlive();

        this.position[0] += dx;
        this.position[1] += dy;
        this.position[2] += dz;
        this.invalidateModel();

        return this;
    }

    /**
     * 绕 Y 轴增量自转（链式调用）。
     * 分子可视化里最常用：让分子缓慢旋转。
     */
    rotateY(delta: number): this {
        this.assertAlive();

        this.rotation[1] += delta;
        this.invalidateModel();

        return this;
    }

    /**
     * 打包对象级 uniform。
     *
     * 布局：
     *   0  ~ 15 : model
     *   16 ~ 18 : color.rgb
     *   19      : objectId（u32，拾取用；PBR 忽略它的值）
     *
     * 返回的是内部复用数组，每帧覆盖。调用方（Renderer）拿到后应立即 writeBuffer，
     * 不要长期持有。
     */
    packObjectUniform(): Nullable<Float32Array> {
        this.assertAlive();

        const d = this.#uniformData;

        d.set(this.modelMatrix, 0);

        const c = this.material.color;
        d[16] = c[0];
        d[17] = c[1];
        d[18] = c[2];

        // 必须走 u32 视图：该槽在 WGSL 侧是 u32（写入非 0 值时用 Float32Array 会写错 bit pattern）
        this.#uniformU32[OBJECT_UNIFORM_ID_SLOT] = this.objectId >>> 0;

        return d;
    }

    /**
     * 释放资源：先销毁 uniform buffer，再销毁几何体的顶点/索引缓冲。
     *
     * 若多个 Mesh 共享同一个 Geometry，不应在这里销毁它 ——
     * 共享场景请由共享的管理者负责，或覆写本方法做引用计数。
     */
    dispose(): void {
        if (this.#disposed) return;

        if (this.uniformBuffer && this.rm)
            this.rm.destroy(this.uniformBuffer);

        this.geometry.dispose();

        this.#disposed = true;
    }

    private invalidateModel(): void {
        this.#modelMatrix = null;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("Mesh.assertAlive.error_1"));
    }
}


/** 复制 Vec3，避免 Mesh 的变换被调用方持有的数组间接改写 */
function copyVec3(v: Vec3): Vec3 {
    return [v[0], v[1], v[2]];
}


/**
 * 归一化缩放：单值直接使用，三元组取均值。
 * 不支持非均匀缩放，取均值是最接近语义的降级。
 */
function normalizeScale(scale: number | Vec3): number {
    return typeof scale === "number" ? scale : (scale[0] + scale[1] + scale[2]) / 3;
}
