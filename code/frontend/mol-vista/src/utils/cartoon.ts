// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file cartoon.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 卡通模型（P0）：沿每个链的 CA 原子生成带端盖的圆柱段，按二级结构给半径与颜色。
 *
 *       为什么用 cylinder impostor 而不是 ribbon mesh：
 *         - 复用现有 Batch/剔除/indirect 管线，不新增 mesh 管线与顶点色；
 *         - 4HHB 约 800 段、5A9Z 约 1.1 万段，实例化开销可忽略；
 *         - 后续再做 ribbon 时，替换本文件的 builder 即可，引擎侧不变。
 *
 *       CA 通过 MDR flags 的 bit5 标记（parser 写入），不需要保留原子名字符串。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { StructureData } from "@wmv/structure";
import type { ColorScheme } from "@/stores/molecule.store";


/** MDR AtomFlag 扩展位：CA 原子（parser 写入） */
const FLAG_CA = 1 << 5;

/** 单个实例的 float 数（与 cylinder 批次一致：48 B） */
const STRIDE = 12;

/** 线性 RGB → RGBA8（与 webgpu-engine 的 packColor 同编码；此处避免把 WGSL 依赖带进单测） */
function packColor(color: readonly [number, number, number]): number {
    const r = Math.round(Math.min(1, Math.max(0, color[0])) * 255);
    const g = Math.round(Math.min(1, Math.max(0, color[1])) * 255);
    const b = Math.round(Math.min(1, Math.max(0, color[2])) * 255);
    return (r | (g << 8) | (b << 16) | (255 << 24)) >>> 0;
}

const HELIX_RADIUS = 0.9;
const SHEET_RADIUS = 0.7;
const COIL_RADIUS = 0.45;

const HELIX_COLOR: [number, number, number] = [0.95, 0.42, 0.36];
const SHEET_COLOR: [number, number, number] = [0.95, 0.76, 0.28];
const COIL_COLOR: [number, number, number] = [0.58, 0.64, 0.72];

const CHAIN_PALETTE: Array<[number, number, number]> = [
    [0.36, 0.61, 1.0],
    [0.25, 0.75, 0.56],
    [0.88, 0.64, 0.23],
    [0.88, 0.36, 0.56],
    [0.61, 0.36, 1.0],
    [0.36, 0.75, 0.88],
];


export interface CartoonBuffers {
    /** 48 B/实例的紧凑数据 */
    data: Float32Array;
    /** 段数 */
    count: number;
}

/** 口袋焦点（与 useEngine 共用同一几何定义） */
export interface CartoonFocus {
    residues: Set<number>;
    center: [number, number, number];
    hull: number;
    radius: number;
}

/** 焦点降噪（与 useEngine.dimColor 同规则） */
function dim(color: [number, number, number], level: 0 | 1 | 2): [number, number, number] {
    if (level === 0) return color;

    const mix = level === 1 ? 0.45 : 0.72;
    const scale = level === 1 ? 0.82 : 0.58;
    const grey = 0.42;

    return [
        (color[0] * (1 - mix) + grey * mix) * scale,
        (color[1] * (1 - mix) + grey * mix) * scale,
        (color[2] * (1 - mix) + grey * mix) * scale,
    ];
}


/**
 * 由 CA trace 生成卡通圆柱实例。
 *
 * - 只连接同一链内相邻 CA，距离异常的断点跳过（避免跨链长棍）；
 * - 半径/颜色按被连接的前一个残基的二级结构决定；
 * - `chain` 方案改用链色，其余方案用二级结构色。
 */
export function buildCartoonInstances(
    data: StructureData,
    scheme: ColorScheme,
    focus?: CartoonFocus
): CartoonBuffers {
    const n = data.meta.atomCount;
    const flags = data.atoms.flags;
    const positions = data.atoms.positions;
    const chainIndex = data.atoms.chainIndex;
    const residueIndex = data.atoms.residueIndex;
    const ss = data.ss;

    if (!flags) return {data: new Float32Array(0), count: 0};

    // 按链收集 CA（文件顺序 ≈ 残基顺序）
    const chains = new Map<number, number[]>();

    for (let i = 0; i < n; i++) {
        if ((flags[i]! & FLAG_CA) === 0) continue;

        const chain = chainIndex?.[i] ?? 0;
        const list = chains.get(chain);

        if (list) list.push(i);
        else chains.set(chain, [i]);
    }

    // Catmull-Rom 每段细分数（越大越平滑，段数线性增长）
    const SUBDIV = 3;

    let capacity = 0;
    for (const list of chains.values()) capacity += Math.max(0, list.length - 1) * SUBDIV;

    const buffer = new Float32Array(capacity * STRIDE);
    const u32 = new Uint32Array(buffer.buffer);
    let count = 0;

    const px = (i: number): number => positions[i * 3]!;
    const py = (i: number): number => positions[i * 3 + 1]!;
    const pz = (i: number): number => positions[i * 3 + 2]!;

    const ssOf = (i: number): number => {
        const r = residueIndex?.[i] ?? -1;
        return r >= 0 ? (ss?.[r] ?? 0) : 0;
    };

    const radiusOf = (structure: number): number =>
        structure === 1 ? HELIX_RADIUS : structure === 2 ? SHEET_RADIUS : COIL_RADIUS;

    const colorOf = (structure: number, chainColor: [number, number, number]): [number, number, number] =>
        scheme === "chain"
            ? chainColor
            : structure === 1 ? HELIX_COLOR : structure === 2 ? SHEET_COLOR : COIL_COLOR;

    // Catmull-Rom：p(t) = 0.5 * (2p1 + (-p0+p2)t + (2p0-5p1+4p2-p3)t² + (-p0+3p1-3p2+p3)t³)
    const catmull = (p0: number, p1: number, p2: number, p3: number, t: number): number => {
        const t2 = t * t;
        const t3 = t2 * t;

        return 0.5 * (
            2 * p1
            + (-p0 + p2) * t
            + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
            + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
        );
    };

    for (const [chain, list] of chains) {
        const chainColor = CHAIN_PALETTE[chain % CHAIN_PALETTE.length] ?? HELIX_COLOR;

        // 先把 CA 序列切成"连续 run"（链断裂/异常间距处断开）
        const runs: number[][] = [];
        let run: number[] = [];

        for (let k = 0; k < list.length; k++) {
            const current = list[k]!;

            if (run.length === 0) {
                run.push(current);
                continue;
            }

            const previous = run[run.length - 1]!;
            const distance = Math.hypot(
                px(current) - px(previous),
                py(current) - py(previous),
                pz(current) - pz(previous)
            );

            if (distance >= 1.5 && distance <= 5.5) {
                run.push(current);
            } else {
                if (run.length >= 2) runs.push(run);
                run = [current];
            }
        }

        if (run.length >= 2) runs.push(run);

        for (const points of runs) {
            const last = points.length - 1;

            for (let i = 0; i < last; i++) {
                const i0 = points[Math.max(0, i - 1)]!;
                const i1 = points[i]!;
                const i2 = points[i + 1]!;
                const i3 = points[Math.min(last, i + 2)]!;

                const structure = ssOf(i1);
                const radiusA = radiusOf(structure);
                const radiusB = radiusOf(ssOf(i2));
                const color = colorOf(structure, chainColor);

                let level: 0 | 1 | 2 = 0;

                if (focus) {
                    const r1 = residueIndex?.[i1] ?? -1;

                    if (r1 >= 0 && focus.residues.has(r1)) {
                        level = 0;
                    } else {
                        const d = Math.hypot(
                            px(i1) - focus.center[0],
                            py(i1) - focus.center[1],
                            pz(i1) - focus.center[2]
                        ) - focus.hull;

                        level = d <= focus.radius ? 1 : 2;
                    }
                }

                const baseColor = dim(color, level);

                for (let s = 0; s < SUBDIV; s++) {
                    const t0 = s / SUBDIV;
                    const t1 = (s + 1) / SUBDIV;

                    const ax = catmull(px(i0), px(i1), px(i2), px(i3), t0);
                    const ay = catmull(py(i0), py(i1), py(i2), py(i3), t0);
                    const az = catmull(pz(i0), pz(i1), pz(i2), pz(i3), t0);
                    const bx = catmull(px(i0), px(i1), px(i2), px(i3), t1);
                    const by = catmull(py(i0), py(i1), py(i2), py(i3), t1);
                    const bz = catmull(pz(i0), pz(i1), pz(i2), pz(i3), t1);

                    const radius = radiusA + (radiusB - radiusA) * t0;
                    const o = count * STRIDE;

                    buffer[o] = ax;
                    buffer[o + 1] = ay;
                    buffer[o + 2] = az;
                    buffer[o + 3] = radius;

                    buffer[o + 4] = bx;
                    buffer[o + 5] = by;
                    buffer[o + 6] = bz;
                    buffer[o + 7] = 0;

                    u32[o + 8] = packColor(baseColor);
                    u32[o + 9] = 0;

                    count++;
                }
            }
        }
    }

    return {data: buffer.slice(0, count * STRIDE), count};
}




