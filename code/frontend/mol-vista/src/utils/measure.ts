// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file measure.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 几何测量纯函数：三点夹角（第二点为顶点）。
 *       与 store/overlay 解耦，便于白盒测试边界（共线/重合/反向）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

export type Vec3 = readonly [number, number, number];

/**
 * 计算 ∠ABC（B 为顶点），返回 0–180 度；任一边长度接近 0 时返回 null。
 */
export function angleDegrees(a: Vec3, b: Vec3, c: Vec3): number | null {
    const ax = a[0] - b[0];
    const ay = a[1] - b[1];
    const az = a[2] - b[2];
    const cx = c[0] - b[0];
    const cy = c[1] - b[1];
    const cz = c[2] - b[2];

    const la = Math.hypot(ax, ay, az);
    const lc = Math.hypot(cx, cy, cz);

    if (la < 1e-6 || lc < 1e-6) return null;

    const cosine = (ax * cx + ay * cy + az * cz) / (la * lc);
    const clamped = Math.min(1, Math.max(-1, cosine));

    return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * 计算二面角 A-B-C-D（绕 B–C 轴），返回 -180–180 度。
 * 任一边或 B–C 轴退化为 0 长度时返回 null。
 */
export function dihedralDegrees(a: Vec3, b: Vec3, c: Vec3, d: Vec3): number | null {
    const b1x = b[0] - a[0], b1y = b[1] - a[1], b1z = b[2] - a[2];
    const b2x = c[0] - b[0], b2y = c[1] - b[1], b2z = c[2] - b[2];
    const b3x = d[0] - c[0], b3y = d[1] - c[1], b3z = d[2] - c[2];

    const l1 = Math.hypot(b1x, b1y, b1z);
    const l2 = Math.hypot(b2x, b2y, b2z);
    const l3 = Math.hypot(b3x, b3y, b3z);

    if (l1 < 1e-6 || l2 < 1e-6 || l3 < 1e-6) return null;

    // 两个平面的法线
    const n1x = b1y * b2z - b1z * b2y;
    const n1y = b1z * b2x - b1x * b2z;
    const n1z = b1x * b2y - b1y * b2x;
    const n2x = b2y * b3z - b2z * b3y;
    const n2y = b2z * b3x - b2x * b3z;
    const n2z = b2x * b3y - b2y * b3x;

    // 以 b2 为轴构造 m = n1 × b2，用 atan2 得到带符号角
    const ux = b2x / l2, uy = b2y / l2, uz = b2z / l2;
    const mx = n1y * uz - n1z * uy;
    const my = n1z * ux - n1x * uz;
    const mz = n1x * uy - n1y * ux;

    const x = n1x * n2x + n1y * n2y + n1z * n2z;
    const y = mx * n2x + my * n2y + mz * n2z;

    return (Math.atan2(y, x) * 180) / Math.PI;
}
