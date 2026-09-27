// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Bond.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 单个化学键的数据对象：承载 4 个字段 + 便捷方法，保证不可变。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {Atom} from "./Atom";

/** Bond 构造参数。 */
export interface BondOptions {
    /** 在 Molecule.bonds 里的索引。构造时若未指定，由 Molecule 分配 */
    index?: number;
    /** 第一个原子的索引 */
    atomA: number;
    /** 第二个原子的索引 */
    atomB: number;
    /** 键级。默认 1（单键） */
    order?: number;
}

/**
 * 单个化学键。
 *
 * 它做的事：
 *   1. 承载 4 个字段：index / atomA / atomB / order
 *   2. 提供高频便捷方法：involves / other / involvesAny
 *   3. 提供几何计算：length / lengthSquared / midpoint（需要 Atom 参数）
 *   4. 提供键级判断：isSingle / isDouble / isTriple / isAromatic
 *   5. 保证不可变
 *
 * 设计取舍：
 *   - 用「索引对」而不是「Atom 引用」：序列化安全、clone 简单、位置变化不影响 Bond。
 *   - 不缓存键长：仿真时原子位置每帧变化，缓存立即失效；O(1) 计算不值得缓存。
 *   - 键级用 number：兼容 1 / 2 / 3 / 1.5（芳香）/ 4（离域）。
 */
export class Bond {
    /** 在 Molecule.bonds 里的索引 */
    readonly index: number;
    /** 第一个原子的索引 */
    readonly atomA: number;
    /** 第二个原子的索引 */
    readonly atomB: number;
    /** 键级 */
    readonly order: number;

    constructor(options: BondOptions) {
        if (!Number.isInteger(options.atomA) || options.atomA < 0)
            throw new Error(`MsgId: Bond.atomA 必须是非负整数，实际为 ${options.atomA}`);
        if (!Number.isInteger(options.atomB) || options.atomB < 0)
            throw new Error(`MsgId: Bond.atomB 必须是非负整数，实际为 ${options.atomB}`);
        if (options.atomA === options.atomB)
            throw new Error(`MsgId: Bond 不能自环（atomA === atomB = ${options.atomA}）`);

        const order = options.order ?? 1;
        if (!(order > 0))
            throw new Error(`MsgId: Bond.order 必须为正数，实际为 ${order}`);

        this.index = options.index ?? -1;
        this.atomA = options.atomA;
        this.atomB = options.atomB;
        this.order = order;
    }

    /** 是否是单键 */
    get isSingle(): boolean {
        return this.order === 1;
    }

    /** 是否是双键 */
    get isDouble(): boolean {
        return this.order === 2;
    }

    /** 是否是三键 */
    get isTriple(): boolean {
        return this.order === 3;
    }

    /** 是否是芳香键。化学上芳香键级常记作 1.5；有些格式用 4 表示离域。 */
    get isAromatic(): boolean {
        return this.order === 1.5 || this.order === 4;
    }

    /** 是否是多键（双键 / 三键 / 芳香） */
    get isMultiple(): boolean {
        return this.order > 1;
    }

    /** 这条键是否涉及某个原子。 */
    involves(atomIndex: number): boolean {
        return this.atomA === atomIndex || this.atomB === atomIndex;
    }

    /**
     * 给定键的一端，返回另一端的索引。
     * 若 atomIndex 不在这条键里，返回 -1。
     */
    other(atomIndex: number): number {
        if (atomIndex === this.atomA) return this.atomB;
        if (atomIndex === this.atomB) return this.atomA;
        return -1;
    }

    /** 这条键是否涉及给定的多个原子中的任意一个。 */
    involvesAny(atomIndices: readonly number[]): boolean {
        for (const i of atomIndices)
            if (this.atomA === i || this.atomB === i) return true;
        return false;
    }

    /** 这条键是否连接给定的两个原子。顺序无关。 */
    connects(a: number, b: number): boolean {
        return (
            (this.atomA === a && this.atomB === b) ||
            (this.atomA === b && this.atomB === a)
        );
    }

    /** 键长，单位 Å。传入两端的 Atom。 */
    length(atomA: Atom, atomB: Atom): number {
        return Math.sqrt(this.lengthSquared(atomA, atomB));
    }

    /** 键长的平方。用于范围判断时省一次 sqrt。 */
    lengthSquared(atomA: Atom, atomB: Atom): number {
        const dx = atomA.x - atomB.x;
        const dy = atomA.y - atomB.y;
        const dz = atomA.z - atomB.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /** 中点位置，单位 Å。返回新数组。 */
    midpoint(atomA: Atom, atomB: Atom): [number, number, number] {
        return [
            (atomA.x + atomB.x) / 2,
            (atomA.y + atomB.y) / 2,
            (atomA.z + atomB.z) / 2,
        ];
    }

    /** 方向单位向量，从 atomA 指向 atomB。 */
    direction(atomA: Atom, atomB: Atom): [number, number, number] {
        const dx = atomB.x - atomA.x;
        const dy = atomB.y - atomA.y;
        const dz = atomB.z - atomA.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        return [dx / len, dy / len, dz / len];
    }

    /** 返回「部分字段不同，其余相同」的新 Bond。 */
    with(changes: Partial<BondOptions>): Bond {
        return new Bond({
            index: changes.index ?? this.index,
            atomA: changes.atomA ?? this.atomA,
            atomB: changes.atomB ?? this.atomB,
            order: changes.order ?? this.order,
        });
    }

    /** 反转键的方向。返回新 Bond，atomA / atomB 交换。 */
    reversed(): Bond {
        return this.with({ atomA: this.atomB, atomB: this.atomA });
    }

    /** 若 atomA > atomB 则反转，否则返回 this。用于规范化。 */
    normalized(): Bond {
        return this.atomA < this.atomB ? this : this.reversed();
    }

    /** 深克隆。 */
    clone(): Bond {
        return new Bond(this);
    }

    /** 输出为普通对象，与 BondOptions 兼容。 */
    toJSON(): BondOptions {
        return {
            index: this.index,
            atomA: this.atomA,
            atomB: this.atomB,
            order: this.order,
        };
    }

    /** 从 toJSON 的结果恢复。 */
    static fromJSON(json: BondOptions): Bond {
        return new Bond(json);
    }

    /** 简短描述，用于日志。例："#42 0-5 single (1)" */
    toString(): string {
        const orderLabel = this.#orderLabel();
        return `#${this.index} ${this.atomA}-${this.atomB} ${orderLabel} (${this.order})`;
    }

    #orderLabel(): string {
        if (this.isSingle) return "single";
        if (this.isDouble) return "double";
        if (this.isTriple) return "triple";
        if (this.isAromatic) return "aromatic";
        return "unknown";
    }
}
