// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Light.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 光照基类与内置光源类型：纯数据对象，不感知 uniform 布局、Scene 与 GPU
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */


/** 三维向量（只读三元组），用于避免调用方误改内部状态 */
export type Vec3 = readonly [number, number, number];


/** 所有 Light 子类的公共字段 */
export interface LightBase {
    /** 光源颜色（0~1），默认 [1, 1, 1] */
    color: [number, number, number];

    /** 光源强度。颜色会乘以强度后传给 shader */
    intensity: number;

    /** 是否启用。Scene 打包时跳过 enabled = false 的光 */
    enabled: boolean;
}


export abstract class Light implements LightBase {
    /**
     * 类型标签，用于 Scene 打包时分派、序列化时区分。
     * 子类必须实现。
     */
    abstract readonly type: string;

    /** 光源颜色（0~1） */
    color: [number, number, number];

    /** 强度，默认 1。最终进 shader 的亮度是 color * intensity */
    intensity: number;

    /** 是否启用 */
    enabled: boolean;

    constructor(color: Vec3 = [1, 1, 1], intensity = 1) {
        this.color = [color[0], color[1], color[2]];
        this.intensity = intensity;
        this.enabled = true;
    }

    /**
     * 设置颜色（链式）。
     * 内部拷贝，避免外部引用污染。
     */
    setColor(color: Vec3): this {
        this.color[0] = color[0];
        this.color[1] = color[1];
        this.color[2] = color[2];

        return this;
    }

    /** 设置强度（链式） */
    setIntensity(intensity: number): this {
        this.intensity = intensity;

        return this;
    }

    /** 启用/禁用（链式） */
    setEnabled(enabled: boolean): this {
        this.enabled = enabled;

        return this;
    }

    /**
     * 释放。Light 只持有一组数字，没有 GPU 资源，基类默认不做任何事；
     * 子类若有需要释放的资源（如预计算的 IBL 纹理）可覆写。
     */
    dispose(): void {
        // no-op
    }
}


/**
 * 方向光（平行光）。
 *
 * 语义：光线沿 -direction 方向平行照射，仿佛来自无穷远处。不衰减、不需要位置。
 * 典型用途：分子可视化的主光源。
 */
export class DirectionalLight extends Light {
    readonly type = "directional" as const;

    /**
     * 从表面指向光源的方向（shader 里的 L 向量）。
     * 构造时与 setDirection 时都会自动归一化。
     */
    #direction: [number, number, number];

    constructor(
        direction: Vec3 = [0.5, 1.0, 0.7],
        color: Vec3 = [1.0, 0.98, 0.92],
        intensity = 1
    ) {
        super(color, intensity);

        const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;

        this.#direction = [
            direction[0] / len,
            direction[1] / len,
            direction[2] / len
        ];
    }

    /** 只读方向（用于读取而不修改） */
    get direction(): readonly [number, number, number] {
        return this.#direction;
    }

    /**
     * 设置方向。
     * 传入值会立即归一化，避免调用方忘记归一化导致 shader 里 dot(N, L) 失真。
     */
    setDirection(direction: Vec3): this {
        const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;

        this.#direction[0] = direction[0] / len;
        this.#direction[1] = direction[1] / len;
        this.#direction[2] = direction[2] / len;

        return this;
    }

    /**
     * 便捷方法：让主光「跟着相机」。
     *
     * 分子可视化里常见的需求：无论用户怎么旋转视角，主光总是从右上前方打来，
     * 这样任何角度看起来都有立体感。偏移量让光不是完全顺着相机方向（那是平光），
     * 而是斜射，从而保留明暗对比。
     */
    setDirectionFromCamera(
        cameraPos: Vec3,
        target: Vec3,
        offset: Vec3 = [0.3, 0.5, 0.2]
    ): this {
        const dx = cameraPos[0] - target[0] + offset[0];
        const dy = cameraPos[1] - target[1] + offset[1];
        const dz = cameraPos[2] - target[2] + offset[2];

        return this.setDirection([dx, dy, dz]);
    }
}


/**
 * 环境光。
 *
 * 语义：均匀照亮所有表面，无方向、无衰减。
 * 典型用途：保证分子背光面不是纯黑，营造「环境反射」的错觉。
 *
 * 亮度通常较低（0.05~0.2），否则会洗掉漫反射的立体感。
 */
export class AmbientLight extends Light {
    readonly type = "ambient" as const;

    constructor(color: Vec3 = [0.12, 0.12, 0.18], intensity = 1) {
        super(color, intensity);
    }
}


/**
 * 半球光（可选增强）。
 *
 * 语义：沿某个上方向，天空色从上、地面色从下渐变照亮物体，
 * 比纯 AmbientLight 更有方向感，又比第二盏方向光更柔和。
 *
 * 分子可视化未必需要，作为可选增强提供；不注册时 Scene 打包会忽略它。
 */
export class HemisphereLight extends Light {
    readonly type = "hemisphere" as const;

    /** 天空色（朝上部分） */
    skyColor: [number, number, number];

    /** 地面色（朝下部分） */
    groundColor: [number, number, number];

    /** 上方向，默认 [0, 1, 0] */
    up: [number, number, number];

    constructor(
        skyColor: Vec3 = [0.6, 0.7, 0.9],
        groundColor: Vec3 = [0.2, 0.15, 0.1],
        intensity = 1
    ) {
        // 基类 color 用于兼容需要单色的场景，这里填天空色
        super(skyColor, intensity);

        this.skyColor = [skyColor[0], skyColor[1], skyColor[2]];
        this.groundColor = [groundColor[0], groundColor[1], groundColor[2]];
        this.up = [0, 1, 0];
    }

    /** 设置天空色（链式） */
    setSkyColor(color: Vec3): this {
        this.skyColor[0] = color[0];
        this.skyColor[1] = color[1];
        this.skyColor[2] = color[2];

        return this;
    }

    /** 设置地面色（链式） */
    setGroundColor(color: Vec3): this {
        this.groundColor[0] = color[0];
        this.groundColor[1] = color[1];
        this.groundColor[2] = color[2];

        return this;
    }

    /** 设置上方向（链式）。传入值会立即归一化 */
    setUp(up: Vec3): this {
        const len = Math.hypot(up[0], up[1], up[2]) || 1;

        this.up[0] = up[0] / len;
        this.up[1] = up[1] / len;
        this.up[2] = up[2] / len;

        return this;
    }
}


/** 类型守卫：是否为方向光 */
export function isDirectionalLight(l: Light): l is DirectionalLight {
    return l.type === "directional";
}


/** 类型守卫：是否为环境光 */
export function isAmbientLight(l: Light): l is AmbientLight {
    return l.type === "ambient";
}


/** 类型守卫：是否为半球光 */
export function isHemisphereLight(l: Light): l is HemisphereLight {
    return l.type === "hemisphere";
}
