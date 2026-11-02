// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ribbon.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 卡通 ribbon（带状）几何：CA trace 先做 Catmull-Rom 平滑，再沿平行传输的
 *       带宽方向生成三角带；每个二级结构 run 一个 part（同色）。
 *
 *       为什么不用 tube：tube 只有粗细，看不出 α/β 的"面"；
 *       为什么每个 run 一个 Mesh：复用 PBR mesh 管线，不新增 shader；
 *       >30k 原子的结构回退 tube，避免上千次 draw（见 useEngine）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { StructureData } from "@wmv/structure";
import type { ColorScheme } from "@/stores/molecule.store";
import type { CartoonFocus } from "@/utils/cartoon";


const FLAG_CA = 1 << 5;

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

/** 每段 CA 之间的细分段数 */
const SUBDIV = 3;


export interface RibbonPart {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    color: [number, number, number];
}


/** 与 useEngine/cartoon 相同的去饱和压暗规则 */
function dim(color: [number, number, number], level: 0 | 1 | 2): [number, number, number] {
    if (level === 0) return color;

    const mix = level === 1 ? 0.5 : 0.7;
    const scale = level === 1 ? 0.9 : 0.85;
    const grey = 0.42;

    return [
        (color[0] * (1 - mix) + grey * mix) * scale,
        (color[1] * (1 - mix) + grey * mix) * scale,
        (color[2] * (1 - mix) + grey * mix) * scale,
    ];
}

function fullWidth(structure: number): number {
    return structure === 1 ? 2.2 : structure === 2 ? 1.8 : 0.9;
}

function colorOf(structure: number, chain: number, scheme: ColorScheme): [number, number, number] {
    if (scheme === "chain") return CHAIN_PALETTE[chain % CHAIN_PALETTE.length] ?? HELIX_COLOR;

    return structure === 1 ? HELIX_COLOR : structure === 2 ? SHEET_COLOR : COIL_COLOR;
}

/** Catmull-Rom 单轴求值 */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
    const t2 = t * t;
    const t3 = t2 * t;

    return 0.5 * (
        2 * p1
        + (-p0 + p2) * t
        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
    );
}


/**
 * 构建 ribbon 网格：同链、同二级结构、相邻 CA 组成一个 run。
 */
export function buildRibbonParts(
    data: StructureData,
    scheme: ColorScheme,
    focus?: CartoonFocus
): RibbonPart[] {
    const n = data.meta.atomCount;
    const flags = data.atoms.flags;
    const positions = data.atoms.positions;
    const chainIndex = data.atoms.chainIndex;
    const residueIndex = data.atoms.residueIndex;
    const ss = data.ss;

    if (!flags) return [];

    const chains = new Map<number, number[]>();

    for (let i = 0; i < n; i++) {
        if ((flags[i]! & FLAG_CA) === 0) continue;

        const c = chainIndex?.[i] ?? 0;
        const list = chains.get(c);

        if (list) list.push(i);
        else chains.set(c, [i]);
    }

    const parts: RibbonPart[] = [];

    const ssAt = (atom: number): number => {
        const r = residueIndex?.[atom] ?? -1;

        return r >= 0 ? (ss?.[r] ?? 0) : 0;
    };

    // 每链一条连续 ribbon：只在链断裂处切分，二级结构只影响宽度
    for (const [chain, list] of chains) {
        const runs: number[][] = [];
        let run: number[] = [];

        for (let k = 0; k < list.length; k++) {
            const atom = list[k]!;

            if (run.length === 0) {
                run = [atom];
                continue;
            }

            const previous = run[run.length - 1]!;
            const distance = Math.hypot(
                positions[atom * 3]! - positions[previous * 3]!,
                positions[atom * 3 + 1]! - positions[previous * 3 + 1]!,
                positions[atom * 3 + 2]! - positions[previous * 3 + 2]!
            );

            if (distance >= 1.5 && distance <= 5.5) {
                run.push(atom);
            } else {
                if (run.length >= 2) runs.push(run);
                run = [atom];
            }
        }

        if (run.length >= 2) runs.push(run);

        for (const points of runs) {
            const part = buildRun(points, chain, scheme, focus, positions, residueIndex, ssAt);

            if (part) parts.push(part);
        }
    }

    return parts;
}

function buildRun(
    atoms: number[],
    chain: number,
    scheme: ColorScheme,
    focus: CartoonFocus | undefined,
    positions: Float32Array,
    residueIndex: Int32Array | undefined,
    ssAt: (atom: number) => number
): RibbonPart | null {
    const m = atoms.length;

    // ---- 1. Catmull-Rom 平滑 CA trace ----
    const center: number[] = [];
    const sampleSs: number[] = [];

    for (let i = 0; i < m - 1; i++) {
        const i0 = atoms[Math.max(0, i - 1)]!;
        const i1 = atoms[i]!;
        const i2 = atoms[i + 1]!;
        const i3 = atoms[Math.min(m - 1, i + 2)]!;

        for (let s = 0; s < SUBDIV; s++) {
            const t = s / SUBDIV;

            center.push(
                catmull(positions[i0 * 3]!, positions[i1 * 3]!, positions[i2 * 3]!, positions[i3 * 3]!, t),
                catmull(positions[i0 * 3 + 1]!, positions[i1 * 3 + 1]!, positions[i2 * 3 + 1]!, positions[i3 * 3 + 1]!, t),
                catmull(positions[i0 * 3 + 2]!, positions[i1 * 3 + 2]!, positions[i2 * 3 + 2]!, positions[i3 * 3 + 2]!, t)
            );
            sampleSs.push(ssAt(i1));
        }
    }

    const last = atoms[m - 1]!;
    center.push(positions[last * 3]!, positions[last * 3 + 1]!, positions[last * 3 + 2]!);
    sampleSs.push(ssAt(last));

    const count = center.length / 3;

    // ---- 2. 平行传输带宽方向 ----
    const pos = new Float32Array(count * 2 * 3);
    const nor = new Float32Array(count * 2 * 3);
    const idx = new Uint32Array((count - 1) * 6);

    let side: [number, number, number] = [1, 0, 0];

    for (let i = 0; i < count; i++) {
        const prev = Math.max(0, i - 1);
        const next = Math.min(count - 1, i + 1);
        const px = center[i * 3]!;
        const py = center[i * 3 + 1]!;
        const pz = center[i * 3 + 2]!;

        const tx = center[next * 3]! - center[prev * 3]!;
        const ty = center[next * 3 + 1]! - center[prev * 3 + 1]!;
        const tz = center[next * 3 + 2]! - center[prev * 3 + 2]!;
        const tl = Math.hypot(tx, ty, tz) || 1;
        const tangent: [number, number, number] = [tx / tl, ty / tl, tz / tl];

        if (i === 0) {
            let sx = -tangent[2];
            let sy = 0;
            let sz = tangent[0];
            let sl = Math.hypot(sx, sy, sz);

            if (sl < 1e-3) {
                sx = 0;
                sy = tangent[2];
                sz = -tangent[1];
                sl = Math.hypot(sx, sy, sz) || 1;
            }

            side = [sx / sl, sy / sl, sz / sl];
        } else {
            // 平行传输：带宽方向沿曲线连续，不随 CA 锯齿翻转
            const dot = side[0] * tangent[0] + side[1] * tangent[1] + side[2] * tangent[2];
            const sx = side[0] - tangent[0] * dot;
            const sy = side[1] - tangent[1] * dot;
            const sz = side[2] - tangent[2] * dot;
            const sl = Math.hypot(sx, sy, sz);

            if (sl > 1e-4) side = [sx / sl, sy / sl, sz / sl];
        }

        const nx = tangent[1] * side[2] - tangent[2] * side[1];
        const ny = tangent[2] * side[0] - tangent[0] * side[2];
        const nz = tangent[0] * side[1] - tangent[1] * side[0];

        const halfWidth = fullWidth(sampleSs[i] ?? 0) / 2;
        const base = i * 2;

        for (let k = 0; k < 2; k++) {
            const sign = k === 0 ? 1 : -1;
            const o = (base + k) * 3;

            pos[o] = px + side[0] * halfWidth * sign;
            pos[o + 1] = py + side[1] * halfWidth * sign;
            pos[o + 2] = pz + side[2] * halfWidth * sign;

            nor[o] = nx;
            nor[o + 1] = ny;
            nor[o + 2] = nz;
        }
    }

    for (let i = 0; i < count - 1; i++) {
        const a = i * 2;
        const b = (i + 1) * 2;
        const o = i * 6;

        idx[o] = a; idx[o + 1] = a + 1; idx[o + 2] = b;
        idx[o + 3] = a + 1; idx[o + 4] = b + 1; idx[o + 5] = b;
    }

    // ---- 3. 颜色：按 run 内占多数的二级结构着色（chain 方案用链色） ----
    const counts = [0, 0, 0, 0];

    for (const ss of sampleSs) counts[ss] = (counts[ss] ?? 0) + 1;

    let dominant = 0;

    for (let k = 1; k < counts.length; k++)
        if ((counts[k] ?? 0) > (counts[dominant] ?? 0)) dominant = k;

    let color = colorOf(dominant, chain, scheme);

    if (focus) {
        let level: 0 | 1 | 2 = 2;
        let minDistance = Infinity;

        for (const atom of atoms) {
            const r = residueIndex?.[atom] ?? -1;

            if (r >= 0 && focus.residues.has(r)) {
                level = 0;
                break;
            }

            minDistance = Math.min(minDistance, Math.hypot(
                positions[atom * 3]! - focus.center[0],
                positions[atom * 3 + 1]! - focus.center[1],
                positions[atom * 3 + 2]! - focus.center[2]
            ));
        }

        if (level !== 0) level = minDistance - focus.hull <= focus.radius ? 1 : 2;

        color = dim(color, level);
    }

    return {positions: pos, normals: nor, indices: idx, color};
}







