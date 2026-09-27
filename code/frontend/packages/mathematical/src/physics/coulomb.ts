// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file coulomb.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 库仑相互作用：U = k_e·q_i·q_j / (ε_r·r)，截断 + 力平滑（无 Ewald，教学用途）。
 *
 * 单位：长度 Å，电荷 e，能量 kJ/mol，力 kJ/(mol·Å)，介电常数无量纲。
 * 库仑常数 k_e = 1389.3545764 kJ·Å/(mol·e²)。
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {NeighborList} from "./neighbor-list";
import {COULOMB_KJ_A_PER_MOL_E2} from "./constants";

/**
 * 计算单对库仑势能。
 *
 * @param r 距离，Å
 * @param qi 原子 i 的电荷，e
 * @param qj 原子 j 的电荷，e
 * @param dielectric 相对介电常数
 * @returns 势能，kJ/mol
 */
export function coulombPotential(
    r: number,
    qi: number,
    qj: number,
    dielectric: number,
): number {
    if (r === 0) return 0;
    return (COULOMB_KJ_A_PER_MOL_E2 * qi * qj) / (dielectric * r);
}

/**
 * 将库仑力累加到 forcesOut（调用方负责清零）。
 * 同时返回总库仑势能。
 *
 * 遍历顺序固定（i 递增、邻居按下标递增）。
 * 跳过两原子电荷均为 0 的对（常见情况，避免无意义计算）。
 *
 * @param positions 原子位置，3N，Å
 * @param charges 每原子电荷，N，e
 * @param neighbors 邻居表
 * @param cutoff 截断半径，Å
 * @param dielectric 相对介电常数
 * @param forcesOut 输出力，3N，kJ/(mol·Å)（累加，不覆盖）
 * @returns 总库仑势能，kJ/mol
 */
export function coulombForcesInto(
    positions: Float32Array,
    charges: Float32Array,
    neighbors: NeighborList,
    cutoff: number,
    dielectric: number,
    forcesOut: Float32Array,
): number {
    const cutoffSq = cutoff * cutoff;
    const start = neighbors.start;
    const list = neighbors.list;
    const k = COULOMB_KJ_A_PER_MOL_E2 / dielectric;
    let potential = 0;

    const n = charges.length;
    for (let i = 0; i < n; i++) {
        const qi = charges[i];
        if (qi === 0) continue;
        const xi = positions[i * 3], yi = positions[i * 3 + 1], zi = positions[i * 3 + 2];
        const sStart = start[i];
        const sEnd = start[i + 1];

        for (let p = sStart; p < sEnd; p++) {
            const j = list[p];
            if (j <= i) continue;
            const qj = charges[j];
            if (qj === 0) continue;

            const dx = xi - positions[j * 3];
            const dy = yi - positions[j * 3 + 1];
            const dz = zi - positions[j * 3 + 2];
            const r2 = dx * dx + dy * dy + dz * dz;
            if (r2 > cutoffSq || r2 === 0) continue;

            const r = Math.sqrt(r2);
            const qq = qi * qj;
            potential += (k * qq) / r;

            // F = k_e·qi·qj / (ε·r³) · r⃗  （因为 F·dx = k·qq/r² · (dx/r) = k·qq·dx/r³）
            const fMag = (k * qq) / (r * r2);
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
