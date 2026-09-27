// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Residue.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 单个残基的数据对象：承载字段 + 原子访问 + 氨基酸语义，保证不可变。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {Atom} from "./Atom";

/** 氨基酸的化学分类 */
export type AminoAcidCategory =
    | "nonpolar"   // 疏水：A V L I M F W P G
    | "polar"      // 极性不带电：S T C Y N Q
    | "acidic"     // 酸性带负电：D E
    | "basic";     // 碱性带正电：K R H

/** 单个氨基酸的元信息 */
interface AminoAcidInfo {
    oneLetter: string;
    category: AminoAcidCategory;
    chineseName?: string;
}

/** 标准 20 种氨基酸的三字母码 → 元信息。数据来源：IUPAC 标准。 */
const AMINO_ACIDS: Readonly<Record<string, AminoAcidInfo>> = {
    ALA: { oneLetter: "A", category: "nonpolar", chineseName: "丙氨酸" },
    VAL: { oneLetter: "V", category: "nonpolar", chineseName: "缬氨酸" },
    LEU: { oneLetter: "L", category: "nonpolar", chineseName: "亮氨酸" },
    ILE: { oneLetter: "I", category: "nonpolar", chineseName: "异亮氨酸" },
    MET: { oneLetter: "M", category: "nonpolar", chineseName: "甲硫氨酸" },
    PHE: { oneLetter: "F", category: "nonpolar", chineseName: "苯丙氨酸" },
    TRP: { oneLetter: "W", category: "nonpolar", chineseName: "色氨酸" },
    PRO: { oneLetter: "P", category: "nonpolar", chineseName: "脯氨酸" },
    GLY: { oneLetter: "G", category: "nonpolar", chineseName: "甘氨酸" },

    SER: { oneLetter: "S", category: "polar", chineseName: "丝氨酸" },
    THR: { oneLetter: "T", category: "polar", chineseName: "苏氨酸" },
    CYS: { oneLetter: "C", category: "polar", chineseName: "半胱氨酸" },
    TYR: { oneLetter: "Y", category: "polar", chineseName: "酪氨酸" },
    ASN: { oneLetter: "N", category: "polar", chineseName: "天冬酰胺" },
    GLN: { oneLetter: "Q", category: "polar", chineseName: "谷氨酰胺" },

    ASP: { oneLetter: "D", category: "acidic", chineseName: "天冬氨酸" },
    GLU: { oneLetter: "E", category: "acidic", chineseName: "谷氨酸" },

    LYS: { oneLetter: "K", category: "basic", chineseName: "赖氨酸" },
    ARG: { oneLetter: "R", category: "basic", chineseName: "精氨酸" },
    HIS: { oneLetter: "H", category: "basic", chineseName: "组氨酸" },
};

/** 水分子的常见名称 */
const WATER_NAMES = new Set(["HOH", "WAT", "DOD", "H2O", "TIP", "SOL"]);

/** Residue 构造参数。 */
export interface ResidueOptions {
    /** 在 Molecule.residues 里的索引。构造时若未指定，由 Molecule 分配 */
    index?: number;
    /** 残基名，如 "ALA" / "HOH" / "DA" */
    name: string;
    /** 残基序号。来自 PDB 的 resSeq 字段 */
    seqNumber: number;
    /** 插入码。通常为空字符串 */
    insertionCode?: string;
    /** 所属链的索引。-1 表示无链 */
    chainIndex?: number;
    /** 属于这个残基的所有原子的索引。构造时会拷贝并冻结 */
    atomIndices?: readonly number[];
    /** 是否来自 HETATM 记录（非标准残基 / 配体 / 修饰氨基酸） */
    isHetero?: boolean;
}

/**
 * 单个残基。
 *
 * 残基是蛋白质 / 核酸的组成单位。
 * 它做的事：
 *   1. 承载 6 个字段 + atomIndices 数组
 *   2. 提供原子访问：contains / atomCount / firstAtomIndex
 *   3. 提供氨基酸语义：isWater / isAminoAcid / oneLetterCode / category
 *   4. 提供残基标识：fullId / matches
 *   5. 保证不可变：atomIndices 构造时 Object.freeze
 */
export class Residue {
    /** 在 Molecule.residues 里的索引 */
    readonly index: number;
    /** 残基名（PDB 里的 resName） */
    readonly name: string;
    /** 残基序号（PDB 里的 resSeq） */
    readonly seqNumber: number;
    /** 插入码（PDB 里的 iCode）。无插入码时为空字符串 */
    readonly insertionCode: string;
    /** 所属链索引。-1 表示无链 */
    readonly chainIndex: number;
    /** 属于这个残基的所有原子的索引。构造时冻结，运行时不可修改。 */
    readonly atomIndices: readonly number[];
    /** 是否来自 HETATM（非标准残基） */
    readonly isHetero: boolean;

    /** 内部缓存：atomIndices 的 Set 版本，用于 contains() 的 O(1) 查询。惰性创建。 */
    #atomIndexSet: Set<number> | null = null;

    constructor(options: ResidueOptions) {
        if (!options.name)
            throw new Error("MsgId: Residue.name 不能为空");
        if (!Number.isFinite(options.seqNumber))
            throw new Error(`MsgId: Residue.seqNumber 必须是有限数，实际为 ${options.seqNumber}`);

        this.index = options.index ?? -1;
        this.name = options.name;
        this.seqNumber = options.seqNumber;
        this.insertionCode = options.insertionCode ?? "";
        this.chainIndex = options.chainIndex ?? -1;
        this.isHetero = options.isHetero ?? false;

        // 拷贝 + 冻结，防止共享数组被外部修改
        const indices = options.atomIndices ? [...options.atomIndices] : [];
        this.atomIndices = Object.freeze(indices) as readonly number[];
    }

    /** 残基包含的原子数量 */
    get atomCount(): number {
        return this.atomIndices.length;
    }

    /** 是否包含某个原子。首次调用时建立 Set，之后 O(1)。 */
    contains(atomIndex: number): boolean {
        if (!this.#atomIndexSet)
            this.#atomIndexSet = new Set(this.atomIndices);
        return this.#atomIndexSet.has(atomIndex);
    }

    /** 第一个原子的索引。空残基返回 -1。 */
    get firstAtomIndex(): number {
        return this.atomIndices.length > 0 ? this.atomIndices[0] : -1;
    }

    /** 遍历残基里的所有原子。需要传入 atoms 数组（Residue 不持有 Atom 引用）。 */
    forEachAtom(
        atoms: readonly Atom[],
        fn: (atom: Atom, indexInResidue: number) => void,
    ): void {
        for (let i = 0; i < this.atomIndices.length; i++) {
            const atom = atoms[this.atomIndices[i]];
            if (atom) fn(atom, i);
        }
    }

    /** 映射残基里的所有原子到新数组。 */
    mapAtoms<T>(
        atoms: readonly Atom[],
        fn: (atom: Atom, indexInResidue: number) => T,
    ): T[] {
        const result: T[] = [];
        for (let i = 0; i < this.atomIndices.length; i++) {
            const atom = atoms[this.atomIndices[i]];
            if (atom) result.push(fn(atom, i));
        }
        return result;
    }

    /** 是否是水分子。HOH / WAT / DOD 等 */
    get isWater(): boolean {
        return WATER_NAMES.has(this.name);
    }

    /** 是否是标准氨基酸（20 种之一）。不含修饰氨基酸。 */
    get isStandardAminoAcid(): boolean {
        return this.name in AMINO_ACIDS;
    }

    /** 是否是氨基酸（含常见修饰氨基酸 MSE / SEP / TPO / PTR）。 */
    get isAminoAcid(): boolean {
        if (this.name in AMINO_ACIDS) return true;
        return (
            this.name === "MSE" ||
            this.name === "SEP" ||
            this.name === "TPO" ||
            this.name === "PTR"
        );
    }

    /** 是否是核苷酸残基（DNA / RNA）。 */
    get isNucleotide(): boolean {
        const n = this.name;
        return (
            n === "A" || n === "T" || n === "G" || n === "C" || n === "U" ||
            n === "DA" || n === "DT" || n === "DG" || n === "DC" || n === "DU"
        );
    }

    /** 是否是配体（非标准残基）。一般等价于 isHetero && !isWater。 */
    get isLigand(): boolean {
        return this.isHetero && !this.isWater;
    }

    /** 单字母码。非氨基酸返回 "X"。 */
    get oneLetterCode(): string {
        return AMINO_ACIDS[this.name]?.oneLetter ?? "X";
    }

    /** 氨基酸分类。非氨基酸返回 null。 */
    get category(): AminoAcidCategory | null {
        return AMINO_ACIDS[this.name]?.category ?? null;
    }

    /** 中文名。非标准氨基酸返回 name 本身。用于 UI 显示。 */
    get chineseName(): string {
        return AMINO_ACIDS[this.name]?.chineseName ?? this.name;
    }

    /**
     * 残基的完整标识，格式："<seqNumber><insertionCode>"。
     * 不包含链 ID（那是 Chain 的信息）。
     */
    get fullId(): string {
        return `${this.seqNumber}${this.insertionCode}`;
    }

    /**
     * 是否匹配给定的残基标识。
     * 传 undefined 表示不检查对应字段。
     */
    matches(
        name?: string,
        seqNumber?: number,
        insertionCode = "",
    ): boolean {
        if (name !== undefined && this.name !== name) return false;
        if (seqNumber !== undefined && this.seqNumber !== seqNumber) return false;
        if (this.insertionCode !== insertionCode) return false;
        return true;
    }

    /** 返回「部分字段不同，其余相同」的新 Residue。 */
    with(changes: Partial<ResidueOptions>): Residue {
        return new Residue({
            index: changes.index ?? this.index,
            name: changes.name ?? this.name,
            seqNumber: changes.seqNumber ?? this.seqNumber,
            insertionCode: changes.insertionCode ?? this.insertionCode,
            chainIndex: changes.chainIndex ?? this.chainIndex,
            atomIndices: changes.atomIndices ?? this.atomIndices,
            isHetero: changes.isHetero ?? this.isHetero,
        });
    }

    /** 添加一个原子到此残基。若已存在则返回 this。 */
    withAtom(atomIndex: number): Residue {
        if (this.contains(atomIndex)) return this;
        return this.with({ atomIndices: [...this.atomIndices, atomIndex] });
    }

    /** 移除此残基里的某个原子。不存在则返回 this。 */
    withoutAtom(atomIndex: number): Residue {
        const idx = this.atomIndices.indexOf(atomIndex);
        if (idx < 0) return this;
        const next = [...this.atomIndices];
        next.splice(idx, 1);
        return this.with({ atomIndices: next });
    }

    /** 深克隆 */
    clone(): Residue {
        return new Residue(this);
    }

    toJSON(): ResidueOptions {
        return {
            index: this.index,
            name: this.name,
            seqNumber: this.seqNumber,
            insertionCode: this.insertionCode,
            chainIndex: this.chainIndex,
            atomIndices: [...this.atomIndices],
            isHetero: this.isHetero,
        };
    }

    static fromJSON(json: ResidueOptions): Residue {
        return new Residue(json);
    }

    /** 简短描述，用于日志。例："ALA 42 @ chain 0, 8 atoms" */
    toString(): string {
        const hetero = this.isHetero ? " [hetero]" : "";
        const chain = this.chainIndex >= 0 ? ` @ chain ${this.chainIndex}` : "";
        const atoms = `, ${this.atomCount} atom${this.atomCount === 1 ? "" : "s"}`;
        return `${this.name} ${this.fullId}${chain}${atoms}${hetero}`;
    }
}

/**
 * 按残基名查询氨基酸信息。非氨基酸返回 null。
 * 供不需要构造 Residue 对象的场景使用。
 */
export function getAminoAcidInfo(name: string): Readonly<AminoAcidInfo> | null {
    return AMINO_ACIDS[name] ?? null;
}

/** 是否是标准氨基酸名。轻量版，不构造对象。 */
export function isStandardAminoAcidName(name: string): boolean {
    return name in AMINO_ACIDS;
}

/** 是否是水分子名。轻量版。 */
export function isWaterName(name: string): boolean {
    return WATER_NAMES.has(name);
}
