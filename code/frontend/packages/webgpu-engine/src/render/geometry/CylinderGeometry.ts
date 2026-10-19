// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file CylinderGeometry.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/28 09:20
 * @desc 圆柱几何：轴向 +Y、几何中心在原点，用于化学键（球棍/线框模型的"棍"）
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {Geometry} from "../Geometry";


/**
 * 圆柱几何：轴向沿 **+Y**，几何中心在原点，长度 = `length`。
 *
 * 为什么轴向选 +Y、中心选原点：
 *   化学键由两个端点决定。把"单位形状"居中且轴向 +Y 后，摆放一根键只需要
 *   ① 平移到两端点中点；② 把 +Y 旋到键方向 —— 不需要非均匀缩放
 *   （`Mesh` 只支持均匀缩放，非均匀缩放会让法线矩阵 ≠ 模型矩阵，见 `Mesh.md`）。
 *
 * 绕序约定（与 `SphereGeometry` 一致，且必须与 primitive 的剔除方向匹配）：
 *   **按顶点顺序用右手定则算出的法线必须指向圆柱外侧**。
 *   本文件的两个三角形顺序是逐面推导过的：
 *     侧面：(bottom[i], top[i], bottom[i+1]) 与 (bottom[i+1], top[i], top[i+1])
 *     顶盖：(center, ring[i+1], ring[i])      —— 从 +Y 往下看是顺时针，外法线才朝 +Y
 *     底盖：(center, ring[i], ring[i+1])      —— 外法线朝 -Y
 *   写反的后果不是"看起来怪"，而是整个圆柱被剔除、画面里键直接消失（见 `issues.md` #34）。
 *
 * 不生成 UV：分子可视化不需要纹理，顶点仍按"每圈首尾各多一个重复顶点"生成，
 * 以便法线在接缝处连续（重复顶点的法线相同，接缝不会出现着色裂缝）。
 */
export class CylinderGeometry extends Geometry {
    /**
     * @param radius 半径，默认 1
     * @param length 长度（沿 Y 轴），默认 1
     * @param radialSegments 圆周细分，默认 16（键很细，16 段已经看不出多边形）
     */
    constructor(radius = 1, length = 1, radialSegments = 16) {
        if (radius <= 0)
            throw new Error("MsgId: CylinderGeometry 的 radius 必须大于 0");

        if (length <= 0)
            throw new Error("MsgId: CylinderGeometry 的 length 必须大于 0");

        const segments = Math.max(3, Math.floor(radialSegments));
        const half = length / 2;

        const positions: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        // ---- 侧面两圈顶点：第 0 圈在 -half，第 1 圈在 +half ----
        for (let ring = 0; ring <= 1; ring++) {
            const y = ring === 0 ? -half : half;

            for (let i = 0; i <= segments; i++) {
                const phi = (i / segments) * Math.PI * 2;
                const cos = Math.cos(phi);
                const sin = Math.sin(phi);

                positions.push(radius * cos, y, radius * sin);
                normals.push(cos, 0, sin);
            }
        }

        const ringStride = segments + 1;

        for (let i = 0; i < segments; i++) {
            const bottomA = i;
            const bottomB = i + 1;
            const topA = ringStride + i;
            const topB = ringStride + i + 1;

            indices.push(bottomA, topA, bottomB);
            indices.push(bottomB, topA, topB);
        }

        // ---- 两个端盖 ----
        // 端盖顶点单独一份：法线不同（±Y），不能和侧面共用
        const topCenter = CylinderGeometry.pushVertex(positions, normals, 0, half, 0, 0, 1, 0);
        const bottomCenter = CylinderGeometry.pushVertex(positions, normals, 0, -half, 0, 0, -1, 0);

        for (let i = 0; i < segments; i++) {
            const phi0 = (i / segments) * Math.PI * 2;
            const phi1 = ((i + 1) / segments) * Math.PI * 2;

            const top0 = CylinderGeometry.pushVertex(positions, normals,
                radius * Math.cos(phi0), half, radius * Math.sin(phi0), 0, 1, 0);
            const top1 = CylinderGeometry.pushVertex(positions, normals,
                radius * Math.cos(phi1), half, radius * Math.sin(phi1), 0, 1, 0);

            indices.push(topCenter, top1, top0);

            const bottom0 = CylinderGeometry.pushVertex(positions, normals,
                radius * Math.cos(phi0), -half, radius * Math.sin(phi0), 0, -1, 0);
            const bottom1 = CylinderGeometry.pushVertex(positions, normals,
                radius * Math.cos(phi1), -half, radius * Math.sin(phi1), 0, -1, 0);

            indices.push(bottomCenter, bottom0, bottom1);
        }

        super(positions, normals, indices);
    }

    /** 追加一个顶点，返回它的索引 */
    private static pushVertex(
        positions: number[],
        normals: number[],
        x: number, y: number, z: number,
        nx: number, ny: number, nz: number
    ): number {
        const index = positions.length / 3;

        positions.push(x, y, z);
        normals.push(nx, ny, nz);

        return index;
    }
}
