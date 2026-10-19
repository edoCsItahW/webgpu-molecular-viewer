// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file integrator.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 积分器与统计：Velocity Verlet（辛积分）+ Langevin 温控，动能与瞬时温度。
 *
 * Velocity Verlet（一步）：
 *   v(t+½dt) = v(t) + ½·a(t)·dt
 *   x(t+dt)  = x(t) + v(t+½dt)·dt
 *   a(t+dt)  = F(t+dt)/m
 *   v(t+dt)  = v(t+½dt) + ½·a(t+dt)·dt
 *
 * Langevin 温控：
 *   v ← v·(1 − γ·dt) + √(2·γ·kB·T·dt/m)·ξ,  ξ ~ N(0,1)
 *
 * 单位：位置 Å，速度 Å/ps，质量 u，力 kJ/(mol·Å)，dt 以 fs 传入内部转 ps。
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import {BOLTZMANN_KJ_PER_MOL_K, FS_TO_PS} from "./constants";

/**
 * 确定性 PRNG（mulberry32）。
 * 同一种子产生完全相同的序列，保证可复现。
 *
 * @param seed 32 位无符号整数种子
 * @returns 返回 [0, 1) 均匀分布的函数
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Box-Muller 标准正态分布采样。
 *
 * @param rng 均匀随机源 [0,1)
 * @returns 标准正态分布样本 N(0,1)
 */
export function gaussian(rng: () => number): number {
    let u = 0, v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 计算动能。
 * KE = ½ Σ m_i · |v_i|²
 * 单位：u·(Å/ps)² = kJ/mol。
 *
 * @param velocities 速度，3N，Å/ps
 * @param masses 质量，N，u
 * @param atomCount N
 * @returns 动能，kJ/mol
 */
export function kineticEnergy(
    velocities: Float32Array,
    masses: Float32Array,
    atomCount: number,
): number {
    let ke = 0;
    for (let i = 0; i < atomCount; i++) {
        const vx = velocities[i * 3];
        const vy = velocities[i * 3 + 1];
        const vz = velocities[i * 3 + 2];
        ke += 0.5 * masses[i] * (vx * vx + vy * vy + vz * vz);
    }
    return ke;
}

/**
 * 由动能计算瞬时温度。
 * T = 2·KE / (dof · kB)，dof = 3N。
 *
 * @param kinetic 动能，kJ/mol
 * @param atomCount N
 * @returns 温度，K
 */
export function instantaneousTemperature(kinetic: number, atomCount: number): number {
    const dof = Math.max(1, 3 * atomCount);
    return (2 * kinetic) / (dof * BOLTZMANN_KJ_PER_MOL_K);
}

/**
 * 按 Maxwell-Boltzmann 分布初始化速度，并去除质心速度。
 * σ = √(kB·T / m)，单位 Å/ps。
 *
 * @param velocities 输出速度，3N，Å/ps
 * @param masses 质量，N，u
 * @param atomCount N
 * @param temperatureK 目标温度，K
 * @param rng 随机源
 */
export function initVelocitiesInto(
    velocities: Float32Array,
    masses: Float32Array,
    atomCount: number,
    temperatureK: number,
    rng: () => number,
): void {
    for (let i = 0; i < atomCount; i++) {
        const m = Math.max(masses[i], 1e-12);
        const sigma = Math.sqrt((BOLTZMANN_KJ_PER_MOL_K * temperatureK) / m);
        velocities[i * 3] = gaussian(rng) * sigma;
        velocities[i * 3 + 1] = gaussian(rng) * sigma;
        velocities[i * 3 + 2] = gaussian(rng) * sigma;
    }
    // 去除质心速度
    let mx = 0, my = 0, mz = 0, totalM = 0;
    for (let i = 0; i < atomCount; i++) {
        mx += masses[i] * velocities[i * 3];
        my += masses[i] * velocities[i * 3 + 1];
        mz += masses[i] * velocities[i * 3 + 2];
        totalM += masses[i];
    }
    if (totalM > 0) {
        mx /= totalM; my /= totalM; mz /= totalM;
        for (let i = 0; i < atomCount; i++) {
            velocities[i * 3] -= mx;
            velocities[i * 3 + 1] -= my;
            velocities[i * 3 + 2] -= mz;
        }
    }
}

/**
 * 执行一步 Velocity Verlet 积分 + Langevin 温控。
 *
 * 调用前：forces 必须是 t 时刻的力。
 * 调用后：positions/velocities 更新到 t+dt，forces 更新到 t+dt。
 *
 * @param positions 位置，3N，Å（in-place 更新）
 * @param velocities 速度，3N，Å/ps（in-place 更新）
 * @param forces 力，3N，kJ/(mol·Å)（in-place 更新为 t+dt 的力）
 * @param masses 质量，N，u
 * @param atomCount N
 * @param timestepFs 时间步长，fs
 * @param damping Langevin 阻尼系数，ps⁻¹
 * @param temperatureK 目标温度，K
 * @param rng 随机源（Langevin 噪声用）
 * @param recomputeForces 重新计算 t+dt 力的回调，返回势能
 * @returns t+dt 时刻的势能，kJ/mol
 */
export function velocityVerletStep(
    positions: Float32Array,
    velocities: Float32Array,
    forces: Float32Array,
    masses: Float32Array,
    atomCount: number,
    timestepFs: number,
    damping: number,
    temperatureK: number,
    rng: () => number,
    recomputeForces: () => number,
): number {
    const dt = timestepFs * FS_TO_PS;
    const halfDt = 0.5 * dt;
    const gammaDt = damping * dt;
    const decay = 1 - gammaDt;

    // 1. 半步速度 + 全步位置
    for (let i = 0; i < atomCount; i++) {
        const m = Math.max(masses[i], 1e-12);
        const ax = forces[i * 3] / m;
        const ay = forces[i * 3 + 1] / m;
        const az = forces[i * 3 + 2] / m;
        positions[i * 3] += velocities[i * 3] * dt + 0.5 * ax * dt * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt + 0.5 * ay * dt * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt + 0.5 * az * dt * dt;
        // 保存半步速度（直接写到 velocities，稍后补全）
        velocities[i * 3] += halfDt * ax;
        velocities[i * 3 + 1] += halfDt * ay;
        velocities[i * 3 + 2] += halfDt * az;
    }

    // 2. 重新计算 t+dt 的力
    const potential = recomputeForces();

    // 3. 补全速度 + Langevin
    for (let i = 0; i < atomCount; i++) {
        const m = Math.max(masses[i], 1e-12);
        const ax = forces[i * 3] / m;
        const ay = forces[i * 3 + 1] / m;
        const az = forces[i * 3 + 2] / m;
        velocities[i * 3] = (velocities[i * 3] + halfDt * ax) * decay
            + Math.sqrt((2 * damping * BOLTZMANN_KJ_PER_MOL_K * temperatureK * dt) / m) * gaussian(rng);
        velocities[i * 3 + 1] = (velocities[i * 3 + 1] + halfDt * ay) * decay
            + Math.sqrt((2 * damping * BOLTZMANN_KJ_PER_MOL_K * temperatureK * dt) / m) * gaussian(rng);
        velocities[i * 3 + 2] = (velocities[i * 3 + 2] + halfDt * az) * decay
            + Math.sqrt((2 * damping * BOLTZMANN_KJ_PER_MOL_K * temperatureK * dt) / m) * gaussian(rng);
    }

    return potential;
}
