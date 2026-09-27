// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file SphereGeometry.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 球体几何：按经纬度细分生成顶点 / 法线 / 索引数据
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { Geometry } from "../Geometry";


/**
 * 经纬度细分的球体几何。
 *
 * 只负责生成数据：交错打包、包围盒、顶点布局、上传与销毁全部由 Geometry 基类完成。
 * 顶点数 = (widthSegments + 1) * (heightSegments + 1)，索引用 uint32。
 */
export class SphereGeometry extends Geometry {
    /**
     * @param radius 球半径，默认 1
     * @param widthSegments 经度方向细分数，默认 32
     * @param heightSegments 纬度方向细分数，默认 24
     */
    constructor(radius = 1, widthSegments = 32, heightSegments = 24) {
        const positions: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];

        for (let lat = 0; lat <= heightSegments; lat++) {
            const theta = (lat * Math.PI) / heightSegments;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= widthSegments; lon++) {
                const phi = (lon * 2 * Math.PI) / widthSegments;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);
                const x = radius * sinTheta * cosPhi;
                const y = radius * cosTheta;
                const z = radius * sinTheta * sinPhi;

                positions.push(x, y, z);
                normals.push(x / radius, y / radius, z / radius);
            }
        }

        for (let lat = 0; lat < heightSegments; lat++) {
            for (let lon = 0; lon < widthSegments; lon++) {
                const first = lat * (widthSegments + 1) + lon;
                const second = first + widthSegments + 1;

                // 绕序必须与"法线朝外"一致：按顶点顺序用右手定则算出的法线要指向球外。
                // 写反的后果：配合 cullMode:'back' 时朝向观察者的外表面被整片剔除，
                // 画面只剩背向观察者的内表面（其 dot(N, L) < 0，亮度≈环境光≈背景色 → 看起来就是一片黑）。
                indices.push(first, first + 1, second);
                indices.push(second, first + 1, second + 1);
            }
        }

        super(positions, normals, indices);
    }

}
