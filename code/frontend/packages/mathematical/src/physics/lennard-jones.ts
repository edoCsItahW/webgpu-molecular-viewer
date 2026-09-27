// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file lennard-jones.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc Lennard-Jones 势：力与势能计算，Lorentz-Berthelot 混合规则，截断处能量平移。
 *
 * 公式：
 *   U(r) = 4ε[(σ/r)¹² − (σ/r)⁶]        r < cutoff
 *   U(r) = 0                            r ≥ cutoff（shift=true 时整体减去 U(cutoff)）
 *   F(r) = 24ε/r · [2(σ/r)¹² − (σ/r)⁶]  （沿连线方向）
 *
 * 混合规则（Lorentz-Berthelot，教学用途的常见近似）：
 *   σij = (σi + σj) / 2
 *   εij = √(εi · εj)
 *
 * 单位：长度 Å，能量 kJ/mol，力 kJ/(mol·Å)。
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {NeighborList} from "./neighbor-list";

/**
 * Lorentz-Berthelot 混合规则：σij = (σi + σj) / 2。
 *
 * @param sigma_i 原子 i 的 σ，Å
 * @param sigma_j 原子 j 的 σ，Å
 * @returns 混合 σ，Å
 */
export function mixSigma(sigma_i: number, sigma_j: number): number {
    return (sigma_i + sigma_j) * 0.5;
}

/**
 * Lorentz-Berthelot 混合规则：εij = √(εi · εj)。
 *
 * @param epsilon_i 原子 i 的 ε，kJ/mol
 * @param epsilon_j 原子 j 的 ε，kJ/mol
 * @returns 混合 ε，kJ/mol
 */
export function mixEpsilon(epsilon_i: number, epsilon_j: number): number {
    return Math.sqrt(epsilon_i * epsilon_j);
}

/**
 * 计算单对 LJ 势能。
 *
 * @param r 距离，Å
 * @param sigma 混合 σ，Å
 * @param epsilon 混合 ε，kJ/mol
 * @param cutoff 截断半径，Å
 * @param shift 是否做能量平移
 * @returns 势能，kJ/mol
 */
export function ljPotential(
    r: number,
    sigma: number,
    epsilon: number,
    cutoff: number,
    shift: boolean,
): number {
    if (r >= cutoff || r === 0) {
        if (shift) return 0;
        return 0;
    }
    const sr = sigma / r;
    const sr6 = sr * sr * sr * sr * sr * sr;
    const sr12 = sr6 * sr6;
    let u = 4 * epsilon * (sr12 - sr6);
    if (shift) {
        const src = sigma / cutoff;
        const src6 = src * src * src * src * src * src;
        const src12 = src6 * src6;
        u -= 4 * epsilon * (src12 - src6);
    }
    return u;
}

/**
 * 将 LJ 力累加到 forcesOut（调用方负责清零）。
 * 同时返回总 LJ 势能。
 *
 * 遍历顺序固定（i 递增、邻居按下标递增），保证可复现与可对拍。
 *
 * @param positions 原子位置，3N，Å
 * @param sigma 每原子 σ，N，Å
 * @param epsilon 每原子 ε，N，kJ/mol
 * @param neighbors 邻居表
 * @param cutoff 截断半径，Å
 * @param shift 是否做能量平移
 * @param forcesOut 输出力，3N，kJ/(mol·Å)（累加，不覆盖）
 * @returns 总 LJ 势能，kJ/mol
 */
export function ljForcesInto(
    positions: Float32Array,
    sigma: Float32Array,
    epsilon: Float32Array,
    neighbors: NeighborList,
    cutoff: number,
    shift: boolean,
    forcesOut: Float32Array,
): number {
    const cutoffSq = cutoff * cutoff;
    const start = neighbors.start;
    const list = neighbors.list;
    let potential = 0;

    const n = sigma.length;
    for (let i = 0; i < n; i++) {
        const xi = positions[i * 3], yi = positions[i * 3 + 1], zi = positions[i * 3 + 2];
        const sStart = start[i];
        const sEnd = start[i + 1];
        const si = sigma[i];
        const ei = epsilon[i];

        for (let p = sStart; p < sEnd; p++) {
            const j = list[p];
            if (j <= i) continue; // 每对只算一次
            const dx = xi - positions[j * 3];
            const dy = yi - positions[j * 3 + 1];
            const dz = zi - positions[j * 3 + 2];
            const r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > cutoffSq || r2 === 0) continue;

            const sig = mixSigma(si, sigma[j]);
            const eps = mixEpsilon(ei, epsilon[j]);
            const r = Math.sqrt(r2);
            const sr = sig / r;
            const sr6 = sr * sr * sr * sr * sr * sr;
            const sr12 = sr6 * sr6;

            // 势能（含平移）
            let u = 4 * eps * (sr12 - sr6);
            if (shift) {
                const src = sig / cutoff;
                const src6 = src * src * src * src * src * src;
                u -= 4 * eps * (src6 * src6 - src6);
            }
            potential += u;

            // 力的大小系数：F = 24ε(2sr12 - sr6)/r² · r⃗
            const fMag = 24 * eps * (2 * sr12 - sr6) / r2;
            const fx = fMag * dx;
            const fy = fMag * dy;
            const fz = fMag * dz;

            forcesOut[i * 3] += fx;
            forcesOut[i * 3 + 1] += fy;
            forcesOut[i * 3 + 2] += fz;
            forcesOut[j * 3] -= fx;
            forcesOut[j * 3 + 1] -= fy;
            forcesOut[j * 3 + 2] -= fz;
        }
    }

    return potential;
}
