// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Material.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 材质：描述几何体的外观参数（基础色 / 粗糙度 / 金属度）
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */


/** Material 的构造选项，未提供的字段取默认值 */
export interface MaterialOptions {
    /** 基础色（线性 RGB），默认白色 [1, 1, 1] */
    color?: [number, number, number];

    /** 粗糙度，0 为镜面、1 为全漫反射，默认 0.5 */
    roughness?: number;

    /** 金属度，0 为非金属、1 为纯金属，默认 0 */
    metallic?: number;
}


/**
 * 材质：只有外观参数，不持有任何 GPU 资源，因此无需 dispose。
 *
 * 参数由 Mesh 打包进对象 uniform，供 shader 做 PBR 着色。
 */
export class Material {
    /** 基础色（线性 RGB） */
    color: [number, number, number];

    /** 粗糙度 */
    roughness: number;

    /** 金属度 */
    metallic: number;

    constructor(opts: MaterialOptions = {}) {
        this.color = opts.color ?? [1, 1, 1];
        this.roughness = opts.roughness ?? 0.5;
        this.metallic = opts.metallic ?? 0;
    }

}
