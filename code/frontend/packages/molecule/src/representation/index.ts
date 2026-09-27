// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 表示层：把 (Molecule, Representation) 编译成 GPU 就绪的纯数据批次 + 变更分级结论。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {Molecule, Atom} from "../model";
import type {StructureData} from "@wmv/structure";
import {elementByZ, symbolToZ} from "@wmv/structure";

// ---------------------------------------------------------------------------
// 表示描述
// ---------------------------------------------------------------------------

export type DisplayMode = "ball-stick" | "space-fill" | "line" | "cartoon" | "surface";
export type ColorSchemeId = "element" | "chain" | "residue" | "charge" | "bFactor" | "ss" | "custom";

export interface StructureFilter {
    chains?: string[];
    water: boolean;
    hetero: boolean;
    hydrogens: boolean;
    custom?: (atomIndex: number, mol: Molecule) => boolean;
}

export interface HighlightStyle {
    selectionColor: string;
    neighborColor: string;
    outline: boolean;
    dimOthers: number;
}

export interface RepresentationQuality {
    ssDetail: number;
    surfaceProbe: number;
    flatShading: boolean;
}

export interface Representation {
    mode: DisplayMode;
    colorScheme: ColorSchemeId;
    radiusScale: number;
    bondRadius: number;
    filter: StructureFilter;
    highlight: HighlightStyle;
    quality: RepresentationQuality;
}

/** 默认表示。 */
export const DEFAULT_REPRESENTATION: Representation = {
    mode: "ball-stick",
    colorScheme: "element",
    radiusScale: 1,
    bondRadius: 0.15,
    filter: { water: false, hetero: true, hydrogens: false },
    highlight: { selectionColor: "#ffeb3b", neighborColor: "#81d4fa", outline: true, dimOthers: 0.4 },
    quality: { ssDetail: 1, surfaceProbe: 1.4, flatShading: false },
};

// ---------------------------------------------------------------------------
// 批次与实例数据
// ---------------------------------------------------------------------------

export const enum BatchTag { Atom = 0, Bond = 1, Cartoon = 2, Surface = 3 }

export interface AtomInstanceBlock {
    radius: Float32Array;
    color: Uint8Array;       // unorm8x4, 线性空间
    pickId: Uint32Array;
    flags: Uint8Array;       // bit0 选中, bit1 悬停, bit2 邻接, bit3 淡化
}

export interface BondInstanceBlock {
    atomA: Uint32Array;
    atomB: Uint32Array;
    radius: Float32Array;
    color: Uint8Array;
    pickId: Uint32Array;
    flags: Uint8Array;
}

export interface RenderBatch {
    tag: BatchTag;
    geometry: "sphere" | "cylinder" | "line" | "ribbon" | "mesh";
    count: number;
    instance: AtomInstanceBlock | BondInstanceBlock;
    positionSource: "rest" | "store";
    material: { baseColor: number[]; roughness: number; metallic: number; opacity: number };
    pickable: boolean;
}

export interface RepresentationBuild {
    batches: RenderBatch[];
    visibleMask: Uint8Array;
    legend: Array<{ label: string; colorSRGB: string; count: number }>;
    stats: { visibleAtoms: number; visibleBonds: number; instanceBytes: number };
}

// ---------------------------------------------------------------------------
// 颜色工具
// ---------------------------------------------------------------------------

/** sRGB 8 位 → 线性 float 的查找表（256 项）。 */
const SRGB_TO_LINEAR = (() => {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        const c = i / 255;
        t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }
    return t;
})();

/** 解析 sRGB hex（#rrggbb）为线性 RGBA(0..1)。 */
export function srgbHexToLinear(hex: string): [number, number, number, number] {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return [SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b], 1];
}

/** 线性 RGBA → unorm8x4（Uint8Array 的 4 字节）。 */
export function linearToUnorm8(rgba: [number, number, number, number]): [number, number, number, number] {
    return [
        Math.round(clamp01(rgba[0]) * 255),
        Math.round(clamp01(rgba[1]) * 255),
        Math.round(clamp01(rgba[2]) * 255),
        Math.round(clamp01(rgba[3]) * 255),
    ];
}

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

// ---------------------------------------------------------------------------
// 色板
// ---------------------------------------------------------------------------

/** CPK 元素色（sRGB hex）。常见元素，未知灰色。 */
const CPK_COLORS: Record<string, string> = {
    H: "#ffffff", C: "#909090", N: "#3050f8", O: "#ff0d0d", F: "#90e050",
    P: "#ff8000", S: "#ffff30", Cl: "#1ff01f", Br: "#a62929", I: "#940094",
    He: "#d9ffff", Ne: "#b3e3f5", Ar: "#80d1e3", Kr: "#5cb8d1", Xe: "#429eb0",
    Na: "#ab5cf2", Mg: "#8aff00", Al: "#bfa6a6", Si: "#f0c8a0", K: "#8f40d4",
    Ca: "#3dff00", Mn: "#9c7ac7", Fe: "#e06633", Cu: "#c88033", Zn: "#7d80b0",
};

/** 链色板：12 色，色盲友好优先。 */
const CHAIN_PALETTE = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4", "#42d4f4",
    "#f032e6", "#bfef45", "#fabed4", "#469990", "#dcbeff", "#9a6324",
];

/** 残基分类色（sRGB）。 */
const RESIDUE_CLASS_COLORS: Record<string, string> = {
    hydrophobic: "#f0c8a0",
    polar: "#5cb8d1",
    acidic: "#e6194b",
    basic: "#3cb44b",
    aromatic: "#911eb4",
    unknown: "#909090",
};

/** 残基名 → 分类。 */
function residueClass(name: string): string {
    const n = name.toUpperCase();
    if (["ALA", "VAL", "LEU", "ILE", "PRO", "PHE", "MET", "TRP"].includes(n)) return "hydrophobic";
    if (["SER", "THR", "CYS", "TYR", "ASN", "GLN"].includes(n)) return "polar";
    if (["ASP", "GLU"].includes(n)) return "acidic";
    if (["LYS", "ARG", "HIS"].includes(n)) return "basic";
    if (["PHE", "TYR", "TRP"].includes(n)) return "aromatic";
    return "unknown";
}

/** viridis 近似（5 段）用于 bFactor。 */
function viridis(t: number): [number, number, number] {
    const clampT = clamp01(t);
    const stops: Array<[number, [number, number, number]]> = [
        [0.0, [68, 1, 84]],
        [0.25, [59, 82, 139]],
        [0.5, [33, 145, 140]],
        [0.75, [94, 201, 98]],
        [1.0, [253, 231, 37]],
    ];
    for (let i = 0; i < stops.length - 1; i++) {
        const [t0, c0] = stops[i];
        const [t1, c1] = stops[i + 1];
        if (clampT <= t1) {
            const f = (clampT - t0) / (t1 - t0);
            return [
                c0[0] + (c1[0] - c0[0]) * f,
                c0[1] + (c1[1] - c0[1]) * f,
                c0[2] + (c1[2] - c0[2]) * f,
            ];
        }
    }
    return stops[stops.length - 1][1];
}

/** 发散色板（蓝-白-红）用于 charge。 */
function diverging(t: number): [number, number, number] {
    // t in [-1, 1] → [0, 1]
    const x = clamp01((t + 1) / 2);
    // 蓝 (#3050f8) → 白 → 红 (#ff0d0d)
    if (x < 0.5) {
        const f = x / 0.5;
        return [48 + (255 - 48) * f, 80 + (255 - 80) * f, 248 + (255 - 248) * f];
    } else {
        const f = (x - 0.5) / 0.5;
        return [255 + (255 - 255) * f, 255 + (13 - 255) * f, 255 + (13 - 255) * f];
    }
}

// ---------------------------------------------------------------------------
// 着色方案
// ---------------------------------------------------------------------------

export interface ColorScheme {
    readonly id: ColorSchemeId;
    colorOfAtom(atomIndex: number, mol: Molecule, data?: StructureData): [number, number, number, number];
    legend(mol: Molecule, data?: StructureData): Array<{ label: string; colorSRGB: string; count: number }>;
    requires: ReadonlyArray<"charge" | "bFactor" | "ss" | "residues" | "chains">;
}

/** 元素（CPK）方案。 */
class ElementScheme implements ColorScheme {
    readonly id = "element" as const;
    readonly requires = [];
    colorOfAtom(i: number, mol: Molecule): [number, number, number, number] {
        const sym = mol.atoms[i].element;
        const hex = CPK_COLORS[sym] ?? "#909090";
        return srgbHexToLinear(hex);
    }
    legend(mol: Molecule): Array<{ label: string; colorSRGB: string; count: number }> {
        const counts = new Map<string, number>();
        for (const a of mol.atoms) counts.set(a.element, (counts.get(a.element) ?? 0) + 1);
        return [...counts.entries()].map(([label, count]) => ({
            label, colorSRGB: CPK_COLORS[label] ?? "#909090", count,
        }));
    }
}

/** 链方案。 */
class ChainScheme implements ColorScheme {
    readonly id = "chain" as const;
    readonly requires = ["chains"] as const;
    colorOfAtom(i: number, mol: Molecule): [number, number, number, number] {
        const ci = mol.atoms[i].chainIndex;
        if (ci < 0) return srgbHexToLinear("#909090");
        const hex = CHAIN_PALETTE[ci % CHAIN_PALETTE.length];
        return srgbHexToLinear(hex);
    }
    legend(mol: Molecule): Array<{ label: string; colorSRGB: string; count: number }> {
        return mol.chains.map((c, i) => ({
            label: c.id,
            colorSRGB: CHAIN_PALETTE[i % CHAIN_PALETTE.length],
            count: mol.atoms.filter((a) => a.chainIndex === c.index).length,
        }));
    }
}

/** 残基分类方案。 */
class ResidueScheme implements ColorScheme {
    readonly id = "residue" as const;
    readonly requires = ["residues"] as const;
    colorOfAtom(i: number, mol: Molecule): [number, number, number, number] {
        const r = mol.getResidueOfAtom(i);
        if (!r) return srgbHexToLinear("#909090");
        return srgbHexToLinear(RESIDUE_CLASS_COLORS[residueClass(r.name)] ?? "#909090");
    }
    legend(mol: Molecule): Array<{ label: string; colorSRGB: string; count: number }> {
        const counts = new Map<string, number>();
        for (const r of mol.residues) {
            const cls = residueClass(r.name);
            counts.set(cls, (counts.get(cls) ?? 0) + r.atomIndices.length);
        }
        return [...counts.entries()].map(([label, count]) => ({
            label, colorSRGB: RESIDUE_CLASS_COLORS[label] ?? "#909090", count,
        }));
    }
}

/** 电荷方案（蓝-白-红发散）。 */
class ChargeScheme implements ColorScheme {
    readonly id = "charge" as const;
    readonly requires = ["charge"] as const;
    colorOfAtom(i: number, mol: Molecule, data?: StructureData): [number, number, number, number] {
        const q = data?.atoms.charge?.[i] ?? mol.atoms[i].charge;
        const [r, g, b] = diverging(clamp11(q));
        return [r / 255, g / 255, b / 255, 1];
    }
    legend(): Array<{ label: string; colorSRGB: string; count: number }> {
        return [
            { label: "+1 e", colorSRGB: "#ff0d0d", count: 0 },
            { label: "0", colorSRGB: "#ffffff", count: 0 },
            { label: "-1 e", colorSRGB: "#3050f8", count: 0 },
        ];
    }
}

/** bFactor 方案（viridis）。 */
class BFactorScheme implements ColorScheme {
    readonly id = "bFactor" as const;
    readonly requires = ["bFactor"] as const;
    #min = 0; #max = 1;
    colorOfAtom(i: number, mol: Molecule, data?: StructureData): [number, number, number, number] {
        const bf = data?.atoms.bFactor?.[i] ?? mol.atoms[i].bFactor;
        const t = (bf - this.#min) / Math.max(1e-6, this.#max - this.#min);
        const [r, g, b] = viridis(t);
        return [r / 255, g / 255, b / 255, 1];
    }
    legend(): Array<{ label: string; colorSRGB: string; count: number }> {
        return [
            { label: "low", colorSRGB: "#440154", count: 0 },
            { label: "high", colorSRGB: "#fde725", count: 0 },
        ];
    }
    setRange(min: number, max: number) { this.#min = min; this.#max = max; }
}

/** 二级结构方案。 */
class SSScheme implements ColorScheme {
    readonly id = "ss" as const;
    readonly requires = ["ss"] as const;
    colorOfAtom(): [number, number, number, number] {
        return srgbHexToLinear("#909090"); // 缺 ss 列时回退灰
    }
    legend(): Array<{ label: string; colorSRGB: string; count: number }> {
        return [
            { label: "helix", colorSRGB: "#e6194b", count: 0 },
            { label: "sheet", colorSRGB: "#f58231", count: 0 },
            { label: "loop", colorSRGB: "#3cb44b", count: 0 },
        ];
    }
}

/** 自定义方案（调用方提供映射）。 */
export class CustomScheme implements ColorScheme {
    readonly id = "custom" as const;
    readonly requires = [];
    constructor(private readonly colorFn: (atomIndex: number, mol: Molecule) => [number, number, number, number]) {}
    colorOfAtom(i: number, mol: Molecule): [number, number, number, number] {
        return this.colorFn(i, mol);
    }
    legend(): Array<{ label: string; colorSRGB: string; count: number }> {
        return [];
    }
}

function clamp11(x: number): number {
    return x < -1 ? -1 : x > 1 ? 1 : x;
}

/** 取色方案实例。 */
export function getColorScheme(id: ColorSchemeId): ColorScheme {
    switch (id) {
        case "element": return new ElementScheme();
        case "chain": return new ChainScheme();
        case "residue": return new ResidueScheme();
        case "charge": return new ChargeScheme();
        case "bFactor": return new BFactorScheme();
        case "ss": return new SSScheme();
        case "custom": return new CustomScheme(() => [0.5, 0.5, 0.5, 1]);
    }
}

// ---------------------------------------------------------------------------
// 半径策略
// ---------------------------------------------------------------------------

/** 模式半径系数 K。 */
const MODE_RADIUS_K: Record<DisplayMode, number> = {
    "ball-stick": 0.25,
    "space-fill": 1.0,
    line: 0,
    cartoon: 0,
    surface: 0,
};

/** 原子半径（Å）。 */
export function radiusOfAtom(z: number, mode: DisplayMode, radiusScale: number): number {
    const info = elementByZ(z);
    return info.vdwRadius * MODE_RADIUS_K[mode] * radiusScale;
}

/** 键半径（Å）。 */
export function radiusOfBond(mode: DisplayMode, bondRadius: number, _order: number): number {
    if (mode === "line") return bondRadius * 0.1;
    return bondRadius;
}

// ---------------------------------------------------------------------------
// 变更分级与差分
// ---------------------------------------------------------------------------

export type BuildTier =
    | { tier: "A"; uniforms: Partial<Representation> }
    | { tier: "B"; rewrite: Array<"color" | "flags" | "radius"> }
    | { tier: "C"; reason: "mode" | "filter" | "structure" | "clip" };

/** 比较两个表示，返回最高级别的变更。无变化返回 undefined。 */
export function diffRepresentation(prev: Representation, next: Representation): BuildTier | undefined {
    if (prev === next) return undefined;

    let tier: "A" | "B" | "C" | undefined;
    let reason: "mode" | "filter" | "structure" | "clip" = "structure";
    const rewrite: Array<"color" | "flags" | "radius"> = [];

    // Tier C 字段
    if (prev.mode !== next.mode) { tier = "C"; reason = "mode"; }
    if (prev.filter.chains?.join(",") !== next.filter.chains?.join(",")) {
        if (!tier || tier < "C") { tier = "C"; reason = "filter"; }
    }
    if (prev.filter.water !== next.filter.water ||
        prev.filter.hetero !== next.filter.hetero ||
        prev.filter.hydrogens !== next.filter.hydrogens) {
        // filter 可见性 → 压缩重建 = C
        if (!tier || tier < "C") { tier = "C"; reason = "filter"; }
    }
    if (prev.quality.ssDetail !== next.quality.ssDetail ||
        prev.quality.surfaceProbe !== next.quality.surfaceProbe) {
        if (!tier) { tier = "C"; reason = "mode"; }
    }

    // Tier B 字段
    if (prev.colorScheme !== next.colorScheme) {
        if (tier !== "C") { tier = "B"; rewrite.push("color"); }
    }
    if (prev.highlight.selectionColor !== next.highlight.selectionColor ||
        prev.highlight.neighborColor !== next.highlight.neighborColor ||
        prev.highlight.dimOthers !== next.highlight.dimOthers ||
        prev.highlight.outline !== next.highlight.outline) {
        if (tier !== "C") { tier = "B"; rewrite.push("color", "flags"); }
    }

    // Tier A 字段
    if (prev.radiusScale !== next.radiusScale) {
        if (!tier) tier = "A";
    }
    if (prev.bondRadius !== next.bondRadius) {
        if (!tier) tier = "A";
    }
    if (prev.quality.flatShading !== next.quality.flatShading) {
        if (!tier) tier = "A";
    }

    if (!tier) return undefined;
    if (tier === "C") return { tier: "C", reason };
    if (tier === "B") return { tier: "B", rewrite: [...new Set(rewrite)] as Array<"color" | "flags" | "radius"> };
    return { tier: "A", uniforms: {} };
}

// ---------------------------------------------------------------------------
// 构建
// ---------------------------------------------------------------------------

/** 构建批次。data 为可选 MDR（用于取 charge/bFactor 列）。 */
export function buildRepresentation(
    mol: Molecule,
    rep: Representation,
    data?: StructureData,
): RepresentationBuild {
    const n = mol.atomCount;
    const visibleMask = new Uint8Array(n);

    // ① 可见性掩码
    const chainSet = rep.filter.chains?.length ? new Set(rep.filter.chains) : null;
    for (let i = 0; i < n; i++) {
        const a = mol.atoms[i];
        if (chainSet) {
            const chain = mol.getChainOfAtom(i);
            if (!chain || !chainSet.has(chain.id)) { visibleMask[i] = 0; continue; }
        }
        if (!rep.filter.hydrogens && a.element === "H") { visibleMask[i] = 0; continue; }
        const res = mol.getResidueOfAtom(i);
        if (!rep.filter.water && res?.name?.toUpperCase() === "HOH") { visibleMask[i] = 0; continue; }
        if (!rep.filter.hetero && res?.isHetero) { visibleMask[i] = 0; continue; }
        if (rep.filter.custom && !rep.filter.custom(i, mol)) { visibleMask[i] = 0; continue; }
        visibleMask[i] = 1;
    }

    // ② 统计可见数量
    let visibleAtomCount = 0;
    for (let i = 0; i < n; i++) visibleAtomCount += visibleMask[i];

    const scheme = getColorScheme(rep.colorScheme);

    // bFactor 范围
    if (scheme instanceof BFactorScheme && data?.atoms.bFactor) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < n; i++) {
            const v = data.atoms.bFactor[i];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        scheme.setRange(lo, hi);
    }

    // ③ 原子实例数据
    const atomRadius = new Float32Array(visibleAtomCount);
    const atomColor = new Uint8Array(visibleAtomCount * 4);
    const atomPickId = new Uint32Array(visibleAtomCount);
    const atomFlags = new Uint8Array(visibleAtomCount);

    let visibleBondCount = 0;
    if (rep.mode === "ball-stick" || rep.mode === "line") {
        for (const b of mol.bonds) {
            if (visibleMask[b.atomA] && visibleMask[b.atomB]) visibleBondCount++;
        }
    }

    let ai = 0;
    const indexMap = new Int32Array(n).fill(-1); // 原索引 → 可见批次中的位置
    for (let i = 0; i < n; i++) {
        if (!visibleMask[i]) continue;
        const z = symbolToZ(mol.atoms[i].element);
        atomRadius[ai] = radiusOfAtom(z, rep.mode, rep.radiusScale);
        const [r, g, b, a] = scheme.colorOfAtom(i, mol, data);
        const [cr, cg, cb, ca] = linearToUnorm8([r, g, b, a]);
        atomColor[ai * 4] = cr;
        atomColor[ai * 4 + 1] = cg;
        atomColor[ai * 4 + 2] = cb;
        atomColor[ai * 4 + 3] = ca;
        atomPickId[ai] = (BatchTag.Atom << 28) | (ai & 0x0fffffff);
        atomFlags[ai] = 0;
        indexMap[i] = ai;
        ai++;
    }

    const batches: RenderBatch[] = [];

    // 原子批次（ball-stick / space-fill）
    if (rep.mode === "ball-stick" || rep.mode === "space-fill") {
        const instance: AtomInstanceBlock = {
            radius: atomRadius, color: atomColor, pickId: atomPickId, flags: atomFlags,
        };
        batches.push({
            tag: BatchTag.Atom,
            geometry: "sphere",
            count: visibleAtomCount,
            instance,
            positionSource: "rest",
            material: { baseColor: [1, 1, 1, 1], roughness: 0.4, metallic: 0, opacity: 1 },
            pickable: true,
        });
    }

    // 键批次
    if (rep.mode === "ball-stick" || rep.mode === "line") {
        const bondA = new Uint32Array(visibleBondCount);
        const bondB = new Uint32Array(visibleBondCount);
        const bondRadius = new Float32Array(visibleBondCount);
        const bondColor = new Uint8Array(visibleBondCount * 4);
        const bondPickId = new Uint32Array(visibleBondCount);
        const bondFlags = new Uint8Array(visibleBondCount);

        let bi = 0;
        for (const b of mol.bonds) {
            if (!visibleMask[b.atomA] || !visibleMask[b.atomB]) continue;
            bondA[bi] = b.atomA;
            bondB[bi] = b.atomB;
            bondRadius[bi] = radiusOfBond(rep.mode, rep.bondRadius, b.order);
            // 键颜色取两端平均
            const ca = scheme.colorOfAtom(b.atomA, mol, data);
            const cb = scheme.colorOfAtom(b.atomB, mol, data);
            const [r, g, b2, a] = linearToUnorm8([
                (ca[0] + cb[0]) / 2, (ca[1] + cb[1]) / 2, (ca[2] + cb[2]) / 2, 1,
            ]);
            bondColor[bi * 4] = r; bondColor[bi * 4 + 1] = g;
            bondColor[bi * 4 + 2] = b2; bondColor[bi * 4 + 3] = a;
            bondPickId[bi] = (BatchTag.Bond << 28) | (bi & 0x0fffffff);
            bondFlags[bi] = 0;
            bi++;
        }

        const instance: BondInstanceBlock = {
            atomA: bondA, atomB: bondB, radius: bondRadius,
            color: bondColor, pickId: bondPickId, flags: bondFlags,
        };
        batches.push({
            tag: BatchTag.Bond,
            geometry: rep.mode === "line" ? "line" : "cylinder",
            count: visibleBondCount,
            instance,
            positionSource: "rest",
            material: { baseColor: [1, 1, 1, 1], roughness: 0.5, metallic: 0, opacity: 1 },
            pickable: true,
        });
    }

    // 图例
    const legend = scheme.legend(mol, data);

    // 统计
    const instanceBytes = visibleAtomCount * 16 + visibleBondCount * 24;

    return {
        batches,
        visibleMask,
        legend,
        stats: { visibleAtoms: visibleAtomCount, visibleBonds: visibleBondCount, instanceBytes },
    };
}
