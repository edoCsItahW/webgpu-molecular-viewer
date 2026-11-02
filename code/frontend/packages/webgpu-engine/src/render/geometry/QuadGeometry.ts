// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file QuadGeometry.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/28
 * @desc 单位 quad：XY 平面 [-1,1]²，供球/柱 impostor 使用（P2）。
 *
 *       为什么不是"平面"而是"代理几何"：
 *         impostor 只把 quad 当作覆盖屏幕投影的载体，真正的形状在片元里
 *         用射线求交恢复（球 / 带端盖的柱），因此 2 个三角形就能得到精确轮廓与深度。
 *       顶点仍按 Geometry 的统一交错布局（position + normal），
 *       这样可以直接复用现有 pipeline 的顶点布局，无需为 impostor 再定义一套。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { Geometry } from "../Geometry";


export class QuadGeometry extends Geometry {
    constructor() {
        // 逆时针（从 +Z 看）：两个三角形覆盖整个 [-1,1]²
        const positions = [
            -1, -1, 0,
            1, -1, 0,
            1, 1, 0,
            -1, 1, 0,
        ];

        const normals = [
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
            0, 0, 1,
        ];

        const indices = [0, 1, 2, 0, 2, 3];

        super(positions, normals, indices);
    }
}
