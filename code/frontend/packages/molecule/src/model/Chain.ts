// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Chain.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 单个链的数据对象：承载字段 + 残基访问 + 序列提取 + 分类判断，保证不可变。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {Residue} from "./Residue";

/** Chain 构造参数。 */
export interface ChainOptions {
    /** 在 Molecule.chains 里的索引。构造时若未指定，由 Molecule 分配 */
    index?: number;
    /** 链 ID。单字符（PDB）或多字符（mmCIF），空字符串表示无 ID */
    id: string;
    /** 属于这条链的所有残基的索引。构造时会拷贝并冻结 */
    residueIndices?: readonly number[];
}

/**
 * 单个链。
 *
 * 链是 PDB 里的顶层分组单位。
 * 它做的事：
 *   1. 承载 3 个字段：index / id / residueIndices
 *   2. 提供残基访问：containsResidue / residueCount / firstResidueIndex
 *   3. 提供序列提取：getAminoAcidSequence / getNucleotideSequence
 *   4. 提供分类判断：isProtein / isNucleicAcid / isMixed
 *   5. 提供标识：displayId / matches
 *   6. 保证不可变：residueIndices 数组被冻结
 */
export class Chain {
    /** 在 Molecule.chains 里的索引 */
    readonly index: number;
    /** 链 ID。空字符串表示无 ID */
    readonly id: string;
    /** 属于这条链的所有残基的索引。构造时冻结。 */
    readonly residueIndices: readonly number[];

    /** 内部缓存：residueIndices 的 Set 版本，用于 containsResidue() 的 O(1) 查询。惰性创建。 */
    #residueIndexSet: Set<number> | null = null;

    constructor(options: ChainOptions) {
        this.index = options.index ?? -1;
        this.id = options.id ?? "";

        const indices = options.residueIndices ? [...options.residueIndices] : [];
        this.residueIndices = Object.freeze(indices) as readonly number[];
    }

    /** 链包含的残基数量 */
    get residueCount(): number {
        return this.residueIndices.length;
    }

    /** 是否包含某个残基。首次调用时建立 Set，之后 O(1)。 */
    containsResidue(residueIndex: number): boolean {
        if (!this.#residueIndexSet)
            this.#residueIndexSet = new Set(this.residueIndices);
        return this.#residueIndexSet.has(residueIndex);
    }

    /** 第一个残基的索引。空链返回 -1。 */
    get firstResidueIndex(): number {
        return this.residueIndices.length > 0 ? this.residueIndices[0] : -1;
    }

    /** 最后一个残基的索引。空链返回 -1。用于定位链的 C 端 / 3' 端。 */
    get lastResidueIndex(): number {
        return this.residueIndices.length > 0
            ? this.residueIndices[this.residueIndices.length - 1]
            : -1;
    }

    /** 遍历链里的所有残基。 */
    forEachResidue(
        residues: readonly Residue[],
        fn: (residue: Residue, indexInChain: number) => void,
    ): void {
        for (let i = 0; i < this.residueIndices.length; i++) {
            const residue = residues[this.residueIndices[i]];
            if (residue) fn(residue, i);
        }
    }

    /** 映射链里的所有残基到新数组。 */
    mapResidues<T>(
        residues: readonly Residue[],
        fn: (residue: Residue, indexInChain: number) => T,
    ): T[] {
        const result: T[] = [];
        for (let i = 0; i < this.residueIndices.length; i++) {
            const residue = residues[this.residueIndices[i]];
            if (residue) result.push(fn(residue, i));
        }
        return result;
    }

    /** 筛选链里的残基。 */
    filterResidues(
        residues: readonly Residue[],
        predicate: (residue: Residue, indexInChain: number) => boolean,
    ): Residue[] {
        const result: Residue[] = [];
        for (let i = 0; i < this.residueIndices.length; i++) {
            const residue = residues[this.residueIndices[i]];
            if (residue && predicate(residue, i)) result.push(residue);
        }
        return result;
    }

    /** 统计链里的原子总数。需要 residues 数组。 */
    countAtoms(residues: readonly Residue[]): number {
        let total = 0;
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (r) total += r.atomCount;
        }
        return total;
    }

    /**
     * 提取氨基酸单字母序列。
     * 规则：标准 20 种氨基酸 → 单字母；修饰氨基酸 → "X" 占位；非氨基酸跳过。
     */
    getAminoAcidSequence(residues: readonly Residue[]): string {
        const chars: string[] = [];
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (!r) continue;
            if (r.isStandardAminoAcid) chars.push(r.oneLetterCode);
            else if (r.isAminoAcid) chars.push("X");
        }
        return chars.join("");
    }

    /** 提取「严格」氨基酸序列。只包含标准 20 种，修饰氨基酸也跳过。 */
    getStandardAminoAcidSequence(residues: readonly Residue[]): string {
        const chars: string[] = [];
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (r?.isStandardAminoAcid) chars.push(r.oneLetterCode);
        }
        return chars.join("");
    }

    /**
     * 提取核苷酸单字母序列。
     * DNA 的 DA/DT/DG/DC → A/T/G/C；RNA 的 A/U/G/C 直接用。
     */
    getNucleotideSequence(residues: readonly Residue[]): string {
        const chars: string[] = [];
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (!r) continue;
            const n = r.name;
            if (n === "DA") chars.push("A");
            else if (n === "DT") chars.push("T");
            else if (n === "DG") chars.push("G");
            else if (n === "DC") chars.push("C");
            else if (n === "DU") chars.push("U");
            else if (n === "A") chars.push("A");
            else if (n === "U") chars.push("U");
            else if (n === "G") chars.push("G");
            else if (n === "C") chars.push("C");
        }
        return chars.join("");
    }

    /**
     * 是否是蛋白质链。
     * 判定：标准氨基酸残基占多数（> 50%），排除水。
     */
    isProtein(residues: readonly Residue[]): boolean {
        let aaCount = 0;
        let total = 0;
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (!r || r.isWater) continue;
            total++;
            if (r.isStandardAminoAcid) aaCount++;
        }
        return total > 0 && aaCount / total > 0.5;
    }

    /** 是否是核酸链。判定：核苷酸残基占多数。 */
    isNucleicAcid(residues: readonly Residue[]): boolean {
        let ntCount = 0;
        let total = 0;
        for (const ri of this.residueIndices) {
            const r = residues[ri];
            if (!r || r.isWater) continue;
            total++;
            if (r.isNucleotide) ntCount++;
        }
        return total > 0 && ntCount / total > 0.5;
    }

    /** 是否是混合链（既不是明显蛋白也不是明显核酸）。 */
    isMixed(residues: readonly Residue[]): boolean {
        return !this.isProtein(residues) && !this.isNucleicAcid(residues);
    }

    /** 链的主要类型。用于 UI 显示或着色方案选择。 */
    getChainType(
        residues: readonly Residue[],
    ): "protein" | "nucleic" | "mixed" | "empty" {
        if (this.residueIndices.length === 0) return "empty";
        if (this.isProtein(residues)) return "protein";
        if (this.isNucleicAcid(residues)) return "nucleic";
        return "mixed";
    }

    /** 用于显示的 ID。空 ID 时返回 "-"。 */
    get displayId(): string {
        return this.id || "-";
    }

    /** 是否匹配给定的 ID。传入 undefined 表示不检查。 */
    matches(id?: string): boolean {
        if (id === undefined) return true;
        return this.id === id;
    }

    /** 返回「部分字段不同，其余相同」的新 Chain。 */
    with(changes: Partial<ChainOptions>): Chain {
        return new Chain({
            index: changes.index ?? this.index,
            id: changes.id ?? this.id,
            residueIndices: changes.residueIndices ?? this.residueIndices,
        });
    }

    /** 添加一个残基到此链。若已存在则返回 this。 */
    withResidue(residueIndex: number): Chain {
        if (this.containsResidue(residueIndex)) return this;
        return this.with({ residueIndices: [...this.residueIndices, residueIndex] });
    }

    /** 移除此链里的某个残基。不存在则返回 this。 */
    withoutResidue(residueIndex: number): Chain {
        const idx = this.residueIndices.indexOf(residueIndex);
        if (idx < 0) return this;
        const next = [...this.residueIndices];
        next.splice(idx, 1);
        return this.with({ residueIndices: next });
    }

    /** 深克隆 */
    clone(): Chain {
        return new Chain(this);
    }

    toJSON(): ChainOptions {
        return {
            index: this.index,
            id: this.id,
            residueIndices: [...this.residueIndices],
        };
    }

    static fromJSON(json: ChainOptions): Chain {
        return new Chain(json);
    }

    /** 简短描述，用于日志。例："Chain A, 42 residues" */
    toString(): string {
        return `Chain ${this.displayId}, ${this.residueCount} residue${
            this.residueCount === 1 ? "" : "s"
        }`;
    }
}
