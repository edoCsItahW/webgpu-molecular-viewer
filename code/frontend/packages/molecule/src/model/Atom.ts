// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Atom.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 单个原子的数据对象：承载 11 个字段 + 高频便捷方法，保证不可变。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/**
 * Atom 构造参数。
 * 有合理默认值的字段可选，无默认值的必填。
 */
export interface AtomOptions {
    /** 在 Molecule.atoms 里的索引。构造时若未指定，由 Molecule 分配 */
    index?: number;
    /** 元素符号，如 "C" / "N" / "O" / "H"。大小写敏感 */
    element: string;
    /** 原子名，如 "CA" / "N" / "O1"。默认用 element */
    name?: string;
    /** 三维坐标，单位 Å */
    x: number;
    y: number;
    z: number;
    /** 形式电荷。默认 0 */
    charge?: number;
    /** 所属残基索引。-1 表示非蛋白质 */
    residueIndex?: number;
    /** 所属链索引。-1 表示无链 */
    chainIndex?: number;
    /** 占用率 [0, 1]。默认 1 */
    occupancy?: number;
    /** B-factor。默认 0 */
    bFactor?: number;
}

/**
 * 单个原子。
 *
 * 它做的事：
 *   1. 承载 11 个字段：index / element / name / x,y,z / charge
 *      / residueIndex / chainIndex / occupancy / bFactor
 *   2. 提供高频便捷方法：distanceTo / with / clone
 *   3. 提供高频便捷 getter：position / isHydrogen / isHeavy / isBackbone
 *   4. 保证不可变：所有字段 readonly，所有修改操作返回新实例
 *
 * 它不做的事：
 *   - 不知道它属于哪个 Molecule（由 Molecule 持有 atoms 数组）
 *   - 不做元素表查询（那是 @wmv/structure 的 ElementTable）
 *   - 不做 GPU 上传
 *   - 不做颜色
 */
export class Atom {
    /** 在 Molecule.atoms 里的索引 */
    readonly index: number;
    /** 元素符号 */
    readonly element: string;
    /** 原子名 */
    readonly name: string;
    /** 笛卡尔坐标，单位 Å */
    readonly x: number;
    readonly y: number;
    readonly z: number;
    /** 形式电荷 */
    readonly charge: number;
    /** 所属残基索引。-1 表示非蛋白质分子 */
    readonly residueIndex: number;
    /** 所属链索引。-1 表示无链 */
    readonly chainIndex: number;
    /** 占用率 [0, 1] */
    readonly occupancy: number;
    /** B-factor */
    readonly bFactor: number;

    constructor(options: AtomOptions) {
        if (!options.element)
            throw new Error("MsgId: Atom.element 不能为空");
        if (
            !Number.isFinite(options.x) ||
            !Number.isFinite(options.y) ||
            !Number.isFinite(options.z)
        )
            throw new Error(
                `MsgId: Atom 坐标必须是有限数：(${options.x}, ${options.y}, ${options.z})`,
            );

        this.index = options.index ?? -1;
        this.element = options.element;
        this.name = options.name ?? options.element;
        this.x = options.x;
        this.y = options.y;
        this.z = options.z;
        this.charge = options.charge ?? 0;
        this.residueIndex = options.residueIndex ?? -1;
        this.chainIndex = options.chainIndex ?? -1;
        this.occupancy = options.occupancy ?? 1;
        this.bFactor = options.bFactor ?? 0;
    }

    /** 位置元组。每次返回新数组；在意分配时直接读 x/y/z。 */
    get position(): [number, number, number] {
        return [this.x, this.y, this.z];
    }

    /** 是否是氢（含氘、氚） */
    get isHydrogen(): boolean {
        return this.element === "H" || this.element === "D" || this.element === "T";
    }

    /** 是否是重原子（非氢） */
    get isHeavy(): boolean {
        return !this.isHydrogen;
    }

    /** 是否是碳 */
    get isCarbon(): boolean {
        return this.element === "C";
    }

    /** 是否是氮 */
    get isNitrogen(): boolean {
        return this.element === "N";
    }

    /** 是否是氧 */
    get isOxygen(): boolean {
        return this.element === "O";
    }

    /** 是否属于蛋白质主链（N / CA / C / O / OXT） */
    get isBackbone(): boolean {
        return (
            this.name === "N" ||
            this.name === "CA" ||
            this.name === "C" ||
            this.name === "O" ||
            this.name === "OXT"
        );
    }

    /** 是否属于蛋白质侧链 */
    get isSidechain(): boolean {
        return this.residueIndex >= 0 && !this.isBackbone;
    }

    /** 是否是有残基归属的原子（即来自蛋白质/核酸） */
    get hasResidue(): boolean {
        return this.residueIndex >= 0;
    }

    /** 到另一个原子的欧氏距离，单位 Å */
    distanceTo(other: Atom): number {
        return Math.sqrt(this.distanceSquaredTo(other));
    }

    /** 到另一个原子的平方距离。用于 cutoff 判断时省一次 sqrt。 */
    distanceSquaredTo(other: Atom): number {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dz = this.z - other.z;
        return dx * dx + dy * dy + dz * dz;
    }

    /** 到任意点的距离 */
    distanceToPoint(x: number, y: number, z: number): number {
        return Math.sqrt(this.distanceSquaredToPoint(x, y, z));
    }

    /** 到任意点的平方距离 */
    distanceSquaredToPoint(x: number, y: number, z: number): number {
        const dx = this.x - x;
        const dy = this.y - y;
        const dz = this.z - z;
        return dx * dx + dy * dy + dz * dz;
    }

    /** 是否在某个点附近（用于拾取、邻居查询）。用平方比较，避免 sqrt。 */
    isWithinRadius(
        point: readonly [number, number, number],
        radius: number,
    ): boolean {
        const r2 = radius * radius;
        return this.distanceSquaredToPoint(point[0], point[1], point[2]) <= r2;
    }

    /**
     * 返回一个「部分字段不同，其余相同」的新 Atom。
     * 用 ?? 而非 ||，因为 0 是合法值。
     */
    with(changes: Partial<AtomOptions>): Atom {
        return new Atom({
            index: changes.index ?? this.index,
            element: changes.element ?? this.element,
            name: changes.name ?? this.name,
            x: changes.x ?? this.x,
            y: changes.y ?? this.y,
            z: changes.z ?? this.z,
            charge: changes.charge ?? this.charge,
            residueIndex: changes.residueIndex ?? this.residueIndex,
            chainIndex: changes.chainIndex ?? this.chainIndex,
            occupancy: changes.occupancy ?? this.occupancy,
            bFactor: changes.bFactor ?? this.bFactor,
        });
    }

    /** 平移（返回新 Atom）。等价于 with({ x: this.x + dx, ... })。 */
    translated(dx: number, dy: number, dz: number): Atom {
        return this.with({ x: this.x + dx, y: this.y + dy, z: this.z + dz });
    }

    /** 深克隆。Atom 是纯值对象，clone 等价于「用同一份数据新建」。 */
    clone(): Atom {
        return new Atom(this);
    }

    /** 输出为普通对象，用于 JSON.stringify。与 AtomOptions 兼容。 */
    toJSON(): AtomOptions {
        return {
            index: this.index,
            element: this.element,
            name: this.name,
            x: this.x,
            y: this.y,
            z: this.z,
            charge: this.charge,
            residueIndex: this.residueIndex,
            chainIndex: this.chainIndex,
            occupancy: this.occupancy,
            bFactor: this.bFactor,
        };
    }

    /** 从 toJSON 的结果恢复。与 toJSON 对称。 */
    static fromJSON(json: AtomOptions): Atom {
        return new Atom(json);
    }

    /** 简短描述，用于日志。例："[C] CA @ (12.345, 5.678, -3.210) charge=0" */
    toString(): string {
        const x = this.x.toFixed(3);
        const y = this.y.toFixed(3);
        const z = this.z.toFixed(3);
        const charge = this.charge !== 0 ? ` charge=${this.charge}` : "";
        return `[${this.element}] ${this.name} @ (${x}, ${y}, ${z})${charge}`;
    }

    /** 一行 CSV 格式，用于调试导出。 */
    toCSV(): string {
        return [
            this.index,
            this.element,
            this.name,
            this.x,
            this.y,
            this.z,
            this.charge,
            this.residueIndex,
            this.chainIndex,
        ].join(",");
    }
}
