// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file mat4.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 4x4 矩阵运算工具函数（列主序，右手坐标系，WebGPU NDC Z∈[0,1]）
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/**
 * 透视投影矩阵。
 *
 * 约定：
 *   - 右手坐标系，列主序
 *   - WebGPU NDC：Z∈[0,1]（与 OpenGL 的 [-1,1] 不同）
 *   - fov 为垂直视场角（弧度）
 *
 * @param fov 垂直视场角（弧度）
 * @param aspect 宽高比
 * @param near 近裁剪面
 * @param far 远裁剪面
 * @returns 列主序的 4x4 投影矩阵（Float32Array(16)）
 */
export function mat4Perspective(
    fov: number,
    aspect: number,
    near: number,
    far: number,
): Float32Array {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, far * nf, -1,
        0, 0, far * near * nf, 0,
    ]);
}

/**
 * 正交投影矩阵。
 *
 * 约定：右手坐标系，列主序，WebGPU NDC Z∈[0,1]。
 *
 * @param left 左裁剪面
 * @param right 右裁剪面
 * @param bottom 下裁剪面
 * @param top 上裁剪面
 * @param near 近裁剪面
 * @param far 远裁剪面
 * @returns 列主序的 4x4 正交投影矩阵
 */
export function mat4Orthographic(
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
): Float32Array {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return new Float32Array([
        -2 * lr, 0, 0, 0,
        0, -2 * bt, 0, 0,
        0, 0, nf, 0,
        (left + right) * lr, (top + bottom) * bt, near * nf, 1,
    ]);
}

/**
 * 视图矩阵（lookAt）。
 *
 * 计算从 eye 看向 target 的视图矩阵，up 为上方向。
 * 约定：右手坐标系，列主序。
 *
 * @param eye 相机位置
 * @param target 看向的目标点
 * @param up 上方向（通常 [0, 1, 0]）
 * @returns 列主序的 4x4 视图矩阵
 */
export function mat4LookAt(
    eye: readonly [number, number, number],
    target: readonly [number, number, number],
    up: readonly [number, number, number],
): Float32Array {
    // forward = normalize(eye - target)  —— 相机看向 -z 方向
    let fx = eye[0] - target[0];
    let fy = eye[1] - target[1];
    let fz = eye[2] - target[2];
    let fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;

    // right = normalize(cross(up, forward))
    let rx = up[1] * fz - up[2] * fy;
    let ry = up[2] * fx - up[0] * fz;
    let rz = up[0] * fy - up[1] * fx;
    let rl = Math.hypot(rx, ry, rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;

    // trueUp = cross(forward, right)
    const ux = fy * rz - fz * ry;
    const uy = fz * rx - fx * rz;
    const uz = fx * ry - fy * rx;

    // 列主序：
    //   [ rx  ry  rz  0 ]   <- 第 0 列
    //   [ ux  uy  uz  0 ]   <- 第 1 列
    //   [ fx  fy  fz  0 ]   <- 第 2 列
    //   [ tx  ty  tz  1 ]   <- 第 3 列，t = -R * eye
    const tx = -(rx * eye[0] + ry * eye[1] + rz * eye[2]);
    const ty = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
    const tz = -(fx * eye[0] + fy * eye[1] + fz * eye[2]);

    return new Float32Array([
        rx, ux, fx, 0,
        ry, uy, fy, 0,
        rz, uz, fz, 0,
        tx, ty, tz, 1,
    ]);
}

/**
 * 矩阵乘法：result = a * b。
 *
 * 列主序 4x4 矩阵相乘。
 *
 * @param a 左矩阵
 * @param b 右矩阵
 * @returns a * b 的结果矩阵
 */
export function mat4Multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);

    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[k * 4 + row] * b[col * 4 + k];
            }
            out[col * 4 + row] = sum;
        }
    }

    return out;
}

/**
 * 4x4 矩阵求逆。
 *
 * 标准伴随矩阵法求逆。若矩阵不可逆，返回单位矩阵。
 *
 * @param m 列主序的 4x4 矩阵
 * @returns 逆矩阵
 */
export function mat4Invert(m: Float32Array): Float32Array {
    const out = new Float32Array(16);

    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
    const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
    const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (det === 0) {
        // 不可逆，返回单位矩阵
        out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
        return out;
    }

    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
}

/**
 * 合成平移、旋转（欧拉角，YXZ 顺序）、缩放矩阵。
 *
 * 列主序，右手坐标系。
 * 顺序：T * Ry * Rx * Rz * S
 *   先应用缩放 S，再应用 Z 轴旋转、X 轴旋转、Y 轴旋转，最后平移 T。
 *   这是图形学里最常用的顺序（与 three.js 的默认欧拉顺序一致）。
 *
 * @param t 平移向量
 * @param r 欧拉角（弧度），YXZ 顺序 [rx, ry, rz]
 * @param s 缩放向量 [sx, sy, sz]
 * @returns 列主序的 4x4 变换矩阵
 */
export function mat4TRS(
    t: readonly [number, number, number],
    r: readonly [number, number, number],
    s: readonly [number, number, number],
): Float32Array {
    const [rx, ry, rz] = r;
    const [sx, sy, sz] = s;

    const ca = Math.cos(ry), sa = Math.sin(ry);
    const cb = Math.cos(rx), sb = Math.sin(rx);
    const cc = Math.cos(rz), sc = Math.sin(rz);

    // 旋转矩阵 R = Ry * Rx * Rz（行主序推导，最后按列主序填入）
    const m00 = ca * cc + sa * sb * sc;
    const m01 = -ca * sc + sa * sb * cc;
    const m02 = sa * cb;
    const m10 = cb * sc;
    const m11 = cb * cc;
    const m12 = -sb;
    const m20 = -sa * cc + ca * sb * sc;
    const m21 = sa * sc + ca * sb * cc;
    const m22 = ca * cb;

    // T * R * S，列主序
    return new Float32Array([
        m00 * sx, m10 * sx, m20 * sx, 0,
        m01 * sy, m11 * sy, m21 * sy, 0,
        m02 * sz, m12 * sz, m22 * sz, 0,
        t[0], t[1], t[2], 1,
    ]);
}
