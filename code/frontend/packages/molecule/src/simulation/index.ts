// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.2
 * @date 2026/09/27 00:00
 * @desc 模拟模型：力场规格、系统状态、从 MDR 构建状态。
 *       纯物理计算（力/邻居表/积分器）委托给 @wmv/mathematical。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {StructureData} from "@wmv/structure";
import {elementByZ} from "@wmv/structure";
import {
    // 邻居表
    buildNeighborList,
    needsRebuild,
    DEFAULT_NEIGHBOR_OPTIONS,
    type NeighborList,
    type NeighborListOptions,
    // 力
    ljForcesInto,
    harmonicBondForcesInto,
    coulombForcesInto,
    // 积分器与统计
    mulberry32,
    gaussian,
    initVelocitiesInto,
    velocityVerletStep as velocityVerletStepFromMath,
    kineticEnergy,
    instantaneousTemperature,
    // 常数（再导出方便使用方）
    BOLTZMANN_KJ_PER_MOL_K,
    COULOMB_KJ_A_PER_MOL_E2,
} from "@wmv/mathematical";

// ---------------------------------------------------------------------------
// 物理常数再导出（保持向后兼容）
// ---------------------------------------------------------------------------

/** @deprecated 请使用 BOLTZMANN_KJ_PER_MOL_K */
export const KB = BOLTZMANN_KJ_PER_MOL_K;
/** @deprecated 请使用 COULOMB_KJ_A_PER_MOL_E2 */
export const COULOMB_K = COULOMB_KJ_A_PER_MOL_E2;
export {BOLTZMANN_KJ_PER_MOL_K, COULOMB_KJ_A_PER_MOL_E2};

// ---------------------------------------------------------------------------
// 规格
// ---------------------------------------------------------------------------

/** 力场规格。 */
export interface ForceFieldSpec {
    lennardJones: boolean;
    harmonicBonds: boolean;
    coulomb: boolean;
    /** 截断半径，Å，默认 10 */
    cutoff: number;
    /** 键力常数 kJ/(mol·Å²)，默认 300000 */
    bondK: number;
    /** 相对介电常数，默认 1.0 */
    dielectric: number;
    /** LJ 能量平移，默认 true */
    energyShift: boolean;
}

/** 积分器规格。 */
export interface IntegratorSpec {
    kind: "velocity-verlet";
    timestepFs: number;
    /** 阻尼系数 ps⁻¹ */
    damping: number;
    temperatureK: number;
    seed: number;
    substepsPerFrame: number;
    /** 邻居表重建周期（步），默认 20 */
    rebuildNeighborsEvery: number;
}

/** 默认力场规格。 */
export const DEFAULT_FORCE_FIELD: ForceFieldSpec = {
    lennardJones: true,
    harmonicBonds: true,
    coulomb: true,
    cutoff: 10,
    bondK: 300000,
    dielectric: 1.0,
    energyShift: true,
};

/** 默认积分器规格。 */
export const DEFAULT_INTEGRATOR: IntegratorSpec = {
    kind: "velocity-verlet",
    timestepFs: 1,
    damping: 1.0,
    temperatureK: 300,
    seed: 42,
    substepsPerFrame: 4,
    rebuildNeighborsEvery: 20,
};

// ---------------------------------------------------------------------------
// 系统状态
// ---------------------------------------------------------------------------

/**
 * 系统状态：SoA 布局。
 * 位置/速度/力用 3N 紧凑存储（CPU 侧）；GPU 侧上传时再做 4N 补齐。
 */
export interface SystemState {
    atomCount: number;
    positions: Float32Array;   // 3N, Å
    velocities: Float32Array;  // 3N, Å/ps
    forces: Float32Array;      // 3N, kJ/(mol·Å)
    masses: Float32Array;      // N, u
    charges: Float32Array;     // N, e
    /** 邻居表（来自 @wmv/mathematical） */
    neighbors: NeighborList;
    /** 建表时的位置快照，用于 skin 触发重建判定 */
    referencePositions: Float32Array; // 3N, Å
    sigma: Float32Array;       // N, Å
    epsilon: Float32Array;     // N, kJ/mol
    /** 键列表（a, b, r0），扁平存储 */
    bondA: Uint32Array;
    bondB: Uint32Array;
    bondR0: Float32Array;
}

/** 能量样本。 */
export interface EnergySample {
    step: number;
    timePs: number;
    potential: number;
    kinetic: number;
    total: number;
    temperatureK: number;
}

// ---------------------------------------------------------------------------
// 邻居表（委托 @wmv/mathematical）
// ---------------------------------------------------------------------------

export {buildNeighborList, needsRebuild, DEFAULT_NEIGHBOR_OPTIONS};
export type {NeighborList, NeighborListOptions};

/** 构建系统的邻居表并保存参考位置。 */
export function buildSystemNeighbors(
    state: SystemState,
    options: NeighborListOptions,
    builtAtStep: number,
): void {
    state.neighbors = buildNeighborList(state.positions, state.atomCount, options, builtAtStep);
    state.referencePositions = new Float32Array(state.positions);
}

// ---------------------------------------------------------------------------
// 力计算（组合 @wmv/mathematical 的各力分量）
// ---------------------------------------------------------------------------

/**
 * 计算全部力（LJ + 库仑 + 键谐振）。
 * 结果写回 state.forces，并返回势能。
 * 单位：力 kJ/(mol·Å)，能量 kJ/mol。
 */
export function computeForces(state: SystemState, spec: ForceFieldSpec): number {
    const forces = state.forces;
    forces.fill(0);
    let potential = 0;

    const neighbors = state.neighbors;

    if (spec.lennardJones) {
        potential += ljForcesInto(
            state.positions, state.sigma, state.epsilon,
            neighbors, spec.cutoff, spec.energyShift, forces,
        );
    }

    if (spec.coulomb) {
        potential += coulombForcesInto(
            state.positions, state.charges,
            neighbors, spec.cutoff, spec.dielectric, forces,
        );
    }

    if (spec.harmonicBonds) {
        potential += harmonicBondForcesInto(
            state.positions, state.bondA, state.bondB, state.bondR0,
            spec.bondK, forces,
        );
    }

    return potential;
}

/** 计算动能（kJ/mol）和温度（K）。 */
export function computeKinetic(state: SystemState): { kinetic: number; temperatureK: number } {
    const kinetic = kineticEnergy(state.velocities, state.masses, state.atomCount);
    const temperatureK = instantaneousTemperature(kinetic, state.atomCount);
    return { kinetic, temperatureK };
}

// ---------------------------------------------------------------------------
// 积分器（委托 @wmv/mathematical）
// ---------------------------------------------------------------------------

export {mulberry32, gaussian};

/** 按 Maxwell-Boltzmann 分布初始化速度。 */
export function initVelocities(state: SystemState, temperatureK: number, seed: number): void {
    const rng = mulberry32(seed);
    initVelocitiesInto(state.velocities, state.masses, state.atomCount, temperatureK, rng);
}

/**
 * 执行一步 Velocity Verlet + Langevin 热浴。
 * 返回本步的势能（kJ/mol）。
 */
export function velocityVerletStep(
    state: SystemState,
    spec: ForceFieldSpec,
    integrator: IntegratorSpec,
    rng: () => number,
): number {
    return velocityVerletStepFromMath(
        state.positions,
        state.velocities,
        state.forces,
        state.masses,
        state.atomCount,
        integrator.timestepFs,
        integrator.damping,
        integrator.temperatureK,
        rng,
        () => computeForces(state, spec),
    );
}

// ---------------------------------------------------------------------------
// 从 StructureData 构建 SystemState
// ---------------------------------------------------------------------------

/** 从 MDR 构建初始 SystemState。 */
export function systemStateFromStructure(data: StructureData): SystemState {
    const n = data.meta.atomCount;
    const elements = data.atoms.element;
    const pos = data.atoms.positions;

    const masses = new Float32Array(n);
    const charges = new Float32Array(n);
    const sigma = new Float32Array(n);
    const epsilon = new Float32Array(n);
    const positions = new Float32Array(pos);
    const velocities = new Float32Array(n * 3);
    const forces = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
        const info = elementByZ(elements[i]);
        masses[i] = info.mass;
        charges[i] = data.atoms.charge?.[i] ?? 0;
        // LJ 参数：σ = vdW / 2^(1/6)，ε 按元素给默认（教学用）
        sigma[i] = info.vdwRadius / 1.122462048309373;
        epsilon[i] = 0.1; // kJ/mol，教学默认值
    }

    // 键列表：r0 取初始键长
    let bondA: Uint32Array, bondB: Uint32Array, bondR0: Float32Array;
    if (data.bonds) {
        const m = data.bonds.a.length;
        bondA = new Uint32Array(m);
        bondB = new Uint32Array(m);
        bondR0 = new Float32Array(m);
        for (let i = 0; i < m; i++) {
            const a = data.bonds.a[i], b = data.bonds.b[i];
            bondA[i] = a;
            bondB[i] = b;
            const dx = pos[a * 3] - pos[b * 3];
            const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
            const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
            bondR0[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
    } else {
        bondA = new Uint32Array(0);
        bondB = new Uint32Array(0);
        bondR0 = new Float32Array(0);
    }

    // 初始邻居表
    const neighbors = buildNeighborList(positions, n, DEFAULT_NEIGHBOR_OPTIONS, 0);

    const state: SystemState = {
        atomCount: n,
        positions,
        velocities,
        forces,
        masses,
        charges,
        neighbors,
        referencePositions: new Float32Array(positions),
        sigma,
        epsilon,
        bondA,
        bondB,
        bondR0,
    };

    return state;
}
