// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file elements.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 元素数据：符号归一化、共价半径、价数上限。
 *
 *       与 `mol-vista/src/utils/bond-perception.ts` 的表格保持一致（Cordero 2008 常用值），
 *       但这里只保留"键感知需要的两列"，避免把颜色/显示半径带进解析层。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 共价半径（Å） */
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

/** 价数上限（抑制金属/离子附近的过度成键；碱金属视为离子，不参与成键） */
const MAX_VALENCE: Record<string, number> = {
    H: 1, D: 1, He: 0,
    Li: 0, Na: 0, K: 0, Rb: 0, Cs: 0, Fr: 0,
    Be: 2, B: 3, C: 4, N: 4, O: 2, F: 1, Ne: 0,
    Mg: 2, Al: 3, Si: 4, P: 5, S: 6, Cl: 1, Ar: 0,
    Ca: 2, Sc: 6, Ti: 6, V: 6, Cr: 6, Mn: 6, Fe: 6, Co: 6, Ni: 6, Cu: 6, Zn: 4,
    Ga: 3, Ge: 4, As: 5, Se: 2, Br: 1, Kr: 0,
    Sr: 2, Y: 6, Zr: 6, Mo: 6, Ru: 6, Rh: 6, Pd: 4, Ag: 2, Cd: 2, In: 3, Sn: 4,
    Sb: 3, Te: 2, I: 1, Xe: 0, Ba: 2, La: 6, W: 6, Pt: 4, Au: 3, Hg: 2, Pb: 4, Bi: 3,
};

/** 未收录元素的默认共价半径 */
export const DEFAULT_COVALENT_RADIUS = 0.77;

/** 未收录元素的默认价数 */
export const DEFAULT_MAX_VALENCE = 4;

/** 元素符号归一化：'FE' → 'Fe'，'cl' → 'Cl'；空/未知返回 'X' */
export function normalizeElementSymbol(symbol: string): string {
    const trimmed = symbol.trim();

    if (trimmed.length === 0) return "X";
    if (trimmed.length === 1) return trimmed.toUpperCase();

    return trimmed[0]!.toUpperCase() + trimmed.slice(1).toLowerCase();
}

/** 共价半径（Å） */
export function covalentRadiusOf(symbol: string): number {
    return COVALENT_RADII[normalizeElementSymbol(symbol)] ?? DEFAULT_COVALENT_RADIUS;
}

/** 价数上限 */
export function maxValenceOf(symbol: string): number {
    return MAX_VALENCE[normalizeElementSymbol(symbol)] ?? DEFAULT_MAX_VALENCE;
}

