// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file StructureData.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc MDR 契约：外来世界与领域之间的唯一合法接口（SOA + 扁平列）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** MDR 主版本。消费方必须拒绝不认识的 major。 */
export const MDR_MAJOR = 1 as const;
export const MDR_MINOR = 0 as const;

/** 无归属的索引哨兵。语义唯一：不存在。 */
export const NULL_INDEX = -1;

/** 支持的结构格式。 */
export type StructureFormat =
    | "pdb" | "sdf" | "mol" | "mol2" | "cif" | "xyz" | "baked" | "unknown";

/** 结构元信息。 */
export interface StructureMeta {
    mdrVersion: typeof MDR_MAJOR;
    name: string;
    sourceFormat: StructureFormat;
    units: { length: "angstrom" };
    atomCount: number;
    modelCount: number;
    producer: { kind: "ts" | "http" | "wasm" | "fixture"; name: string; version: string };
    timing?: { parseMs: number };
    provenance?: {
        title?: string;
        header?: string;
        depositedId?: string;
        experimentalMethod?: string;
        resolution?: number;
        contentHash?: string;
    };
    warnings?: string[];
}

/** 原子级位标记。bit 语义固定，新增只能往后加。 */
export const enum AtomFlag {
    Hetero = 1 << 0,
    Water = 1 << 1,
    Hydrogen = 1 << 2,
    AltLocPrimary = 1 << 3,
    Backbone = 1 << 4,
}

/** 原子列（SOA）。positions 为 3N 交错 float，其余可选列长度均为 N。 */
export interface AtomColumns {
    /** 原子序数 1..118；0 = 未知。用序数而非符号：省内存、可查表、可直接进 GPU。 */
    element: Uint8Array;
    /** 3N 个 float，xyz 交错，单位 Å。 */
    positions: Float32Array;
    name?: string[];
    residueIndex?: Int32Array;
    chainIndex?: Int32Array;
    charge?: Float32Array;
    occupancy?: Float32Array;
    bFactor?: Float32Array;
    altLoc?: string[];
    modelIndex?: Uint16Array;
    serial?: Int32Array;
    flags?: Uint8Array;
}

/**
 * 键列。
 * order 编码：2=单、4=双、6=三、3=芳香(1.5)、1=未知。
 */
export interface BondColumns {
    a: Uint32Array;
    b: Uint32Array;
    order: Uint8Array;
    /** true = 由感知算法推断（不是文件里写的）。 */
    inferred: boolean;
}

/** 残基列（CSR：start[i]..start[i]+count[i] 是第 i 个残基的原子范围）。 */
export interface ResidueColumns {
    name: string[];
    seqNumber: Int32Array;
    insertionCode: string[];
    chainIndex: Int32Array;
    start: Int32Array;
    count: Int32Array;
    flags?: Uint8Array;
}

/** 链列（CSR，指向 residues）。 */
export interface ChainColumns {
    id: string[];
    start: Int32Array;
    count: Int32Array;
}

/** 解析中发现的问题。 */
export interface Problem {
    severity: "info" | "warning" | "error";
    code: ProblemCode;
    record?: string;
    line?: number;
    detail?: string;
    count: number;
}

/** 问题码。 */
export type ProblemCode =
    | "unknown-record" | "malformed-number" | "missing-element" | "non-finite-coordinate"
    | "bond-out-of-range" | "bond-self-loop" | "duplicate-atom" | "truncated-file"
    | "unknown-bond-order" | "altloc-collapsed" | "sequence-gap" | "no-atoms";

/** MDR 主结构。 */
export interface StructureData {
    meta: StructureMeta;
    atoms: AtomColumns;
    bonds?: BondColumns;
    residues?: ResidueColumns;
    chains?: ChainColumns;
    /** 每个残基的二级结构：0=coil, 1=helix, 2=sheet, 3=turn */
    ss?: Uint8Array;
    problems: Problem[];
}

/** 由内容推导出的能力（不由生产者声明）。 */
export interface Capabilities {
    hasBonds: boolean;
    hasResidues: boolean;
    hasChains: boolean;
    hasNames: boolean;
    hasCharges: boolean;
    hasOccupancy: boolean;
    hasBFactors: boolean;
    hasAltLoc: boolean;
    hasModels: boolean;
    hasSecondaryStructure: boolean;
    hasHydrogens: boolean;
    hasWater: boolean;
    hasHetero: boolean;
    bondsInferred: boolean;
}

/**
 * 由内容推导能力。有列即有能力，不做"声明式能力 + 空列"的组合。
 * 纯函数，结果不缓存进 StructureData。
 */
export function deriveCapabilities(data: StructureData): Capabilities {
    const atoms = data.atoms;
    const n = data.meta.atomCount;

    let hasHydrogens = false;
    let hasHetero = false;
    for (let i = 0; i < n; i++) {
        if (atoms.element[i] === 1) { hasHydrogens = true; }
        if (atoms.flags && (atoms.flags[i] & AtomFlag.Hetero)) { hasHetero = true; }
        if (hasHydrogens && hasHetero) break;
    }

    let hasWater = false;
    if (data.residues) {
        for (const name of data.residues.name) {
            if (name === "HOH" || name === "WAT" || name === "DOD") {
                hasWater = true;
                break;
            }
        }
    }

    return {
        hasBonds: data.bonds !== undefined,
        hasResidues: data.residues !== undefined,
        hasChains: data.chains !== undefined,
        hasNames: atoms.name !== undefined,
        hasCharges: atoms.charge !== undefined,
        hasOccupancy: atoms.occupancy !== undefined,
        hasBFactors: atoms.bFactor !== undefined,
        hasAltLoc: atoms.altLoc !== undefined,
        hasModels: data.meta.modelCount > 1,
        hasSecondaryStructure: data.ss !== undefined,
        hasHydrogens,
        hasWater,
        hasHetero,
        bondsInferred: data.bonds?.inferred ?? false,
    };
}

/** 校验问题项。 */
export interface ValidationIssue {
    code: string;
    detail: string;
    fatal: boolean;
}

/**
 * 校验 MDR 结构。
 * 致命项：结构性错误（数组长度、索引范围）—— 生产者 bug。
 * 警告项：内容可疑（坐标 NaN、残基顺序）—— 数据问题。
 */
export function validate(data: StructureData): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const n = data.meta.atomCount;
    const atoms = data.atoms;

    if (n === 0) {
        issues.push({ code: "no-atoms", detail: "atomCount 为 0", fatal: true });
        return issues;
    }

    // units
    if (data.meta.units.length !== "angstrom")
        issues.push({ code: "units", detail: `units.length 必须为 angstrom，实际为 ${data.meta.units.length}`, fatal: true });

    // positions
    if (atoms.positions.length !== 3 * n)
        issues.push({ code: "positions-length", detail: `positions.length=${atoms.positions.length} != 3*atomCount=${3 * n}`, fatal: true });

    // element
    if (atoms.element.length !== n)
        issues.push({ code: "element-length", detail: `element.length=${atoms.element.length} != atomCount=${n}`, fatal: true });
    for (let i = 0; i < n; i++) {
        if (atoms.element[i] > 118) {
            issues.push({ code: "element-range", detail: `atom[${i}].element=${atoms.element[i]} 超出 [0,118]`, fatal: true });
            break;
        }
    }

    // 可选列长度
    const checkLen = (col: ArrayLike<unknown> | undefined, name: string) => {
        if (col && col.length !== n)
            issues.push({ code: `${name}-length`, detail: `${name}.length=${col.length} != atomCount=${n}`, fatal: true });
    };
    checkLen(atoms.name, "name");
    checkLen(atoms.residueIndex, "residueIndex");
    checkLen(atoms.chainIndex, "chainIndex");
    checkLen(atoms.charge, "charge");
    checkLen(atoms.occupancy, "occupancy");
    checkLen(atoms.bFactor, "bFactor");
    checkLen(atoms.altLoc, "altLoc");
    checkLen(atoms.modelIndex, "modelIndex");
    checkLen(atoms.serial, "serial");
    checkLen(atoms.flags, "flags");

    // residueIndex / chainIndex 范围
    const rCount = data.residues ? data.residues.name.length : 0;
    const cCount = data.chains ? data.chains.id.length : 0;
    if (atoms.residueIndex) {
        for (let i = 0; i < n; i++) {
            const ri = atoms.residueIndex[i];
            if (ri < -1 || ri >= rCount) {
                issues.push({ code: "residueIndex-range", detail: `atom[${i}].residueIndex=${ri} 超出 [-1, ${rCount})`, fatal: true });
                break;
            }
        }
    }
    if (atoms.chainIndex) {
        for (let i = 0; i < n; i++) {
            const ci = atoms.chainIndex[i];
            if (ci < -1 || ci >= cCount) {
                issues.push({ code: "chainIndex-range", detail: `atom[${i}].chainIndex=${ci} 超出 [-1, ${cCount})`, fatal: true });
                break;
            }
        }
    }

    // bonds
    if (data.bonds) {
        const b = data.bonds;
        if (b.a.length !== b.b.length || b.a.length !== b.order.length)
            issues.push({ code: "bonds-length", detail: "bonds 的 a/b/order 长度不一致", fatal: true });
        for (let i = 0; i < b.a.length; i++) {
            if (b.a[i] >= n || b.b[i] >= n) {
                issues.push({ code: "bond-out-of-range", detail: `bond[${i}] 索引超出 atomCount`, fatal: true });
                break;
            }
            if (b.a[i] === b.b[i]) {
                issues.push({ code: "bond-self-loop", detail: `bond[${i}] 自环`, fatal: true });
                break;
            }
            const o = b.order[i];
            if (o !== 1 && o !== 2 && o !== 3 && o !== 4 && o !== 6) {
                issues.push({ code: "unknown-bond-order", detail: `bond[${i}].order=${o} 不在 {1,2,3,4,6}`, fatal: true });
                break;
            }
        }
    }

    // residues CSR
    if (data.residues) {
        const r = data.residues;
        if (r.start.length !== rCount || r.count.length !== rCount)
            issues.push({ code: "residues-csr-length", detail: "residues.start/count 长度与残基数不一致", fatal: true });
        let sum = 0;
        let mono = true;
        for (let i = 0; i < rCount; i++) {
            if (r.start[i] < sum) mono = false;
            sum += r.count[i];
        }
        if (sum !== n)
            issues.push({ code: "residues-csr-sum", detail: `residues Σcount=${sum} != atomCount=${n}`, fatal: true });
        if (!mono)
            issues.push({ code: "residues-not-monotonic", detail: "residues.start 非单调不减", fatal: false });
    }

    // chains CSR
    if (data.chains) {
        const c = data.chains;
        if (c.start.length !== cCount || c.count.length !== cCount)
            issues.push({ code: "chains-csr-length", detail: "chains.start/count 长度与链数不一致", fatal: true });
        let sum = 0;
        for (let i = 0; i < cCount; i++) sum += c.count[i];
        if (sum !== rCount)
            issues.push({ code: "chains-csr-sum", detail: `chains Σcount=${sum} != residueCount=${rCount}`, fatal: true });
    }

    return issues;
}

/** 有 fatal 项则抛错，否则返回。 */
export function assertValid(data: StructureData): void {
    const issues = validate(data);
    const fatal = issues.filter((i) => i.fatal);
    if (fatal.length > 0)
        throw new Error(`MsgId: MDR 未通过自检：${fatal.map((i) => `${i.code}: ${i.detail}`).join("; ")}`);
}
