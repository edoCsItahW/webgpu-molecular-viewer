// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ribbon-geometry.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 卡通 ribbon 的几何子类：只暴露 Geometry 的受保护构造器。
 *       顶点布局仍是 position(3) + normal(3)，因此直接复用 PBR mesh 管线。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { Geometry } from "@wmv/webgpu-engine";


export class RibbonGeometry extends Geometry {
    constructor(positions: Float32Array, normals: Float32Array, indices: Uint32Array) {
        super(positions, normals, indices);
    }
}
