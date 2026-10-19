// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file bond-perception.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/29 16:10
 * @desc 键感知（covalent-radius bond perception）：为"文件里没有键信息"的格式推断化学键。
 *
 *       为什么必须有它：
 *         化学键有两种来源 —— ①文件里显式给出（SDF/MOL 的 bond block、PDB 的 CONECT）；
 *         ②按几何推断。**PDB 格式根本不存聚合物连通性**：规范只要求给 HETATM/配体/二硫键写
 *         CONECT，标准氨基酸主链与侧链的键是不写的（实测本仓库 7 个样例：1UBQ 有 660 个原子却
 *         **0 条 CONECT**，1CRN 有 327 个原子只有 6 条 CONECT = 3 对二硫键）。
 *         所以"只读 CONECT"的 PDB 必然出现大量孤岛原子 —— 这不是 bug 的副作用，而是格式本身如此。
 *         PyMOL / ChimeraX / VMD 同样都要做这一步推断。
 *
 *       算法：共价半径判据 + 空间网格 + 按距离贪心 + 价数上限
 *         1. 候选对：`d(i,j) ≤ (r_cov(i) + r_cov(j)) × tolerance`（默认 1.25）
 *            —— 判据是"两个原子的共价半径之和（含 25% 容差）"，不是固定截断（固定截断会把
 *            C–C(1.54) / C–H(1.09) / S–S(2.05) 这类差异极大的键长混为一谈）。
 *         2. 用均匀网格取邻居，复杂度 O(N) 量级（4HHB 4779 个原子只需几毫秒；
 *            O(N²) 在十万原子下不可接受）。
 *         3. 显式键（CONECT / bond block）优先占用价数，其余候选按距离从短到长贪心接受。
 *         4. 价数上限表兜底：避免金属/离子附近出现过-bond 的"蛛网"。
 *
 *       已知的取舍（写清楚而不是假装没有）：
 *         - 碱金属（Li/Na/K/Rb/Cs）在 PDB 里几乎总是离子，本模块**不给它们成键**（价数上限 0），
 *           它们会显示为孤立的球 —— 这是化学上诚实的表现，比画出一堆虚假配位键好。
 *         - 氢键（N···O ≈ 2.9 Å）、盐桥、π-π 这类**非共价**作用不会被画成键：判据只覆盖共价范围。
 *         - 缺氢的晶体结构里，水分子 O、金属离子等确实没有共价键，看起来"孤立"是正确的。
 *
 *       归属说明：按设计（docs/architecture/04 §5）这属于 `BondPerceptionPort` 的 TS 实现，
 *       最终应落在 `@wmv/molecule/src/adapters/ts`；该包目前只有设计文档，故先放在应用侧，
 *       逻辑保持纯函数、不依赖 Vue/GPU，可以整体搬走。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 感知所需的原子信息（只需要元素与坐标，不依赖领域模型） */
export interface PerceptionAtom {
    symbol: string;
    position: readonly [number, number, number];
}

export interface PerceiveBondsOptions {
    /**
     * 显式键（来自文件，如 CONECT 或 bond block），索引为原子数组下标。
     * 它们**优先占用价数**，且不会被重复添加。
     */
    explicit?: ReadonlyArray<readonly [number, number]>;

    /** 共价半径之和的容差系数，默认 1.25 */
    tolerance?: number;

    /** 单键长度的绝对上限（Å）。防止"两个未知元素半径都取默认值"时产生长键，默认 2.6 */
    maxBondLength?: number;
}

/** 共价半径（Å）。数据源：Cordero et al. 2008 的常用值取整到 0.01 */
const COVALENT_RADII: Record<string, number> = {
    H: 0.31, He: 0.28,
    Li: 1.28, Be: 0.96, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Ne: 0.58,
    Na: 1.66, Mg: 1.41, Al: 1.21, Si: 1.11, P: 1.07, S: 1.05, Cl: 1.02, Ar: 1.06,
    K: 2.03, Ca: 1.76, Sc: 1.70, Ti: 1.60, V: 1.53, Cr: 1.39, Mn: 1.39, Fe: 1.32,
    Co: 1.26, Ni: 1.24, Cu: 1.32, Zn: 1.22, Ga: 1.22, Ge: 1.20, As: 1.19, Se: 1.20,
    Br: 1.20, Kr: 1.16, Rb: 2.20, Sr: 1.95, Y: 1.90, Zr: 1.75, Nb: 1.64, Mo: 1.54,
    Tc: 1.47, Ru: 1.46, Rh: 1.42, Pd: 1.39, Ag: 1.45, Cd: 1.44, In: 1.42, Sn: 1.39,
    Sb: 1.39, Te: 1.38, I: 1.39, Xe: 1.40, Cs: 2.44, Ba: 2.15, La: 2.07, Ce: 2.04,
    W: 1.62, Pt: 1.36, Au: 1.36, Hg: 1.32, Pb: 1.46, Bi: 1.48,
};

/** 未收录元素的默认共价半径：取"有机物常见元素"的量级，宁可少键也不要乱键 */
const DEFAULT_COVALENT_RADIUS = 0.77;

/**
 * 价数上限：达到上限就不再接受新的键。
 * 主要作用是抑制金属/离子周围的过度成键。
 */
const MAX_VALENCE: Record<string, number> = {
    H: 1, D: 1, He: 0,
    Li: 0, Na: 0, K: 0, Rb: 0, Cs: 0, Fr: 0,     // 碱金属在 PDB 里几乎总是离子
    Be: 2, B: 3, C: 4, N: 4, O: 2, F: 1, Ne: 0,
    Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 1, Ar: 0,
    Ca: 2, Sc: 6, Ti: 6, V: 6, Cr: 6, Mn: 6, Fe: 6, Co: 6, Ni: 6, Cu: 6, Zn: 4,
    Ga: 3, Ge: 4, As: 5, Se: 2, Br: 1, Kr: 0,
    Sr: 2, Y: 6, Zr: 6, Mo: 6, Ru: 6, Rh: 6, Pd: 4, Ag: 2, Cd: 2, In: 3, Sn: 4,
    Sb: 3, Te: 2, I: 1, Xe: 0, Ba: 2, La: 6, W: 6, Pt: 4, Au: 3, Hg: 2, Pb: 4, Bi: 3,
};

/** 未收录元素的默认价数上限 */
const DEFAULT_MAX_VALENCE = 4;

/** 元素符号归一化：'FE' → 'Fe'，'cl' → 'Cl'；空/未知返回 'X' */
export function normalizeElementSymbol(symbol: string): string {
    const trimmed = symbol.trim();

    if (trimmed.length === 0) return 'X';
    if (trimmed.length === 1) return trimmed.toUpperCase();

    return trimmed[0]!.toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** 取共价半径（未知元素用默认值） */
export function covalentRadiusOf(symbol: string): number {
    return COVALENT_RADII[normalizeElementSymbol(symbol)] ?? DEFAULT_COVALENT_RADIUS;
}

/** 取价数上限（未知元素用默认值） */
export function maxValenceOf(symbol: string): number {
    return MAX_VALENCE[normalizeElementSymbol(symbol)] ?? DEFAULT_MAX_VALENCE;
}

/**
 * 推断化学键。
 *
 * @param atoms 原子（元素 + 坐标），索引即返回值里的键端点下标
 * @param options 显式键 / 容差 / 长度上限
 * @returns 键的索引对数组（`[i, j]`，i < j，无重复）
 */
export function perceiveBonds(
    atoms: ReadonlyArray<PerceptionAtom>,
    options: PerceiveBondsOptions = {}
): Array<[number, number]> {
    const tolerance = options.tolerance ?? 1.25;
    const maxBondLength = options.maxBondLength ?? 2.6;

    const count = atoms.length;
    const bonds: Array<[number, number]> = [];
    const seen = new Set<number>();                 // key = i * count + j（i < j）
    const usedValence = new Uint8Array(count);
    const valenceLimit = new Uint8Array(count);
    const radii = new Float32Array(count);

    const keyOf = (i: number, j: number): number => (i < j ? i * count + j : j * count + i);

    for (let i = 0; i < count; i++) {
        const atom = atoms[i]!;

        radii[i] = covalentRadiusOf(atom.symbol);
        valenceLimit[i] = maxValenceOf(atom.symbol);
    }

    // ---- 1. 显式键优先占用价数 ----
    for (const pair of options.explicit ?? []) {
        const [a, b] = pair;

        if (a === b || a < 0 || b < 0 || a >= count || b >= count) continue;

        const key = keyOf(a, b);
        if (seen.has(key)) continue;

        // 显式键不看价数上限（文件说了算），但仍要记账，避免后面继续加满
        seen.add(key);
        bonds.push(a < b ? [a, b] : [b, a]);
        usedValence[a] = usedValence[a]! + 1;
        usedValence[b] = usedValence[b]! + 1;
    }

    if (count === 0) return bonds;

    // ---- 2. 网格分桶 ----
    // 格边长取"最大可能的判据距离"，保证候选只可能落在相邻 27 格内
    const cellSize = Math.max(
        0.5,
        Math.min(maxBondLength, 2 * Math.max(...radii) * tolerance)
    );

    const buckets = new Map<string, number[]>();
    const cellOf = (value: number): number => Math.floor(value / cellSize);

    for (let i = 0; i < count; i++) {
        const position = atoms[i]!.position;
        const cellKey = `${cellOf(position[0])},${cellOf(position[1])},${cellOf(position[2])}`;
        const bucket = buckets.get(cellKey);

        if (bucket) bucket.push(i);
        else buckets.set(cellKey, [i]);
    }

    // ---- 3. 收集候选对（同格 + 相邻 27 格，i < j 去重） ----
    const candidates: Array<{i: number; j: number; distance: number}> = [];

    for (let i = 0; i < count; i++) {
        const position = atoms[i]!.position;
        const cx = cellOf(position[0]);
        const cy = cellOf(position[1]);
        const cz = cellOf(position[2]);

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const bucket = buckets.get(`${cx + dx},${cy + dy},${cz + dz}`);
                    if (!bucket) continue;

                    for (const j of bucket) {
                        if (j <= i) continue;

                        const other = atoms[j]!.position;
                        const ddx = position[0] - other[0];
                        const ddy = position[1] - other[1];
                        const ddz = position[2] - other[2];
                        const distance = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

                        const cutoff = Math.min(maxBondLength, (radii[i]! + radii[j]!) * tolerance);

                        if (distance <= cutoff && distance > 1e-3) {
                            candidates.push({i, j, distance});
                        }
                    }
                }
            }
        }
    }

    // ---- 4. 按距离从短到长贪心接受，受价数上限约束 ----
    candidates.sort((a, b) => a.distance - b.distance);

    for (const candidate of candidates) {
        const {i, j} = candidate;

        if (usedValence[i]! >= valenceLimit[i]! || usedValence[j]! >= valenceLimit[j]!) continue;

        const key = keyOf(i, j);
        if (seen.has(key)) continue;

        seen.add(key);
        bonds.push([i, j]);
        usedValence[i] = usedValence[i]! + 1;
        usedValence[j] = usedValence[j]! + 1;
    }

    return bonds;
}

/**
 * 把"显式键 + 感知键"整理成规范形式：端点升序、(i,j) 去重、丢弃自环与越界。
 * 供解析器在写入 store 之前统一调用。
 */
export function normalizeBonds(
    bonds: ReadonlyArray<readonly [number, number]>,
    atomCount: number
): Array<[number, number]> {
    const seen = new Set<number>();
    const out: Array<[number, number]> = [];

    for (const [a, b] of bonds) {
        if (a === b) continue;
        if (!Number.isInteger(a) || !Number.isInteger(b)) continue;
        if (a < 0 || b < 0 || a >= atomCount || b >= atomCount) continue;

        const i = Math.min(a, b);
        const j = Math.max(a, b);
        const key = i * atomCount + j;

        if (seen.has(key)) continue;

        seen.add(key);
        out.push([i, j]);
    }

    return out;
}
