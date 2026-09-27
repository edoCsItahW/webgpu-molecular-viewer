// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file harmonic-bond.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 谐振键力：键长谐振势 V = ½ k (r − r₀)²，力 F = −k(r − r₀)·r̂。
 *
 * 单位：长度 Å，力常数 kJ/(mol·Å²)，能量 kJ/mol，力 kJ/(mol·Å)。
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/**
 * 计算单条键的谐振势能。
 *
 * @param r 当前键长，Å
 * @param r0 平衡键长，Å
 * @param k 力常数，kJ/(mol·Å²)
 * @returns 势能，kJ/mol
 */
export function harmonicBondPotential(r: number, r0: number, k: number): number {
    const dr = r - r0;
    return 0.5 * k * dr * dr;
}

/**
 * 将谐振键力累加到 forcesOut（调用方负责清零）。
 * 同时返回总键势能。
 *
 * @param positions 原子位置，3N，Å
 * @param bondA 键的第一个原子索引，B
 * @param bondB 键的第二个原子索引，B
 * @param bondR0 每条键的平衡长度，B，Å
 * @param k 力常数，kJ/(mol·Å²)
 * @param forcesOut 输出力，3N，kJ/(mol·Å)（累加，不覆盖）
 * @returns 总键势能，kJ/mol
 */
export function harmonicBondForcesInto(
    positions: Float32Array,
    bondA: Uint32Array,
    bondB: Uint32Array,
    bondR0: Float32Array,
    k: number,
    forcesOut: Float32Array,
): number {
    const bondCount = bondA.length;
    let potential = 0;

    for (let b = 0; b < bondCount; b++) {
        const i = bondA[b];
        const j = bondB[b];
        const dx = positions[i * 3] - positions[j * 3];
        const dy = positions[i * 3 + 1] - positions[j * 3 + 1];
        const dz = positions[i * 3 + 2] - positions[j * 3 + 2];
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12;
        const dr = r - bondR0[b];

        potential += 0.5 * k * dr * dr;

        // F = −k·dr·r̂；对 i 为 −k·dr·(dx/r)，对 j 为 +k·dr·(dx/r)
        const f = k * dr / r;
        forcesOut[i * 3] -= f * dx;
        forcesOut[i * 3 + 1] -= f * dy;
        forcesOut[i * 3 + 2] -= f * dz;
        forcesOut[j * 3] += f * dx;
        forcesOut[j * 3 + 1] += f * dy;
        forcesOut[j * 3 + 2] += f * dz;
    }

    return potential;
}
