// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Molecule.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 分子数据模型：持有原子/键/残基/链，提供派生属性、查询、克隆。不解析、不上传、不渲染。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import {Atom} from "./Atom";
import {Bond} from "./Bond";
import {Residue} from "./Residue";
import {Chain} from "./Chain";
import type {
    StructureData,
    AtomColumns,
    BondColumns,
    ResidueColumns,
    ChainColumns,
} from "@wmv/structure";
import {elementByZ, symbolToZ, type ElementInfo} from "@wmv/structure";

/** 包围盒 + 包围球。 */
export interface Bounds {
    readonly min: [number, number, number];
    readonly max: [number, number, number];
    readonly center: [number, number, number];
    /** 包围球半径 */
    readonly radius: number;
}

/** 分子元信息。 */
export interface MoleculeMetadata {
    /** 分子名。从 PDB 的 HEADER 或文件名推导 */
    readonly name: string;
    /** 数据来源 */
    readonly source: "pdb" | "sdf" | "manual" | "structure";
    /** 原始文本（可选，用于重新解析或调试） */
    readonly sourceText?: string;
}

/** 解析器输出的中间格式。 */
export interface ParserResult {
    atoms: Atom[];
    bonds: Bond[];
    residues: Residue[];
    chains: Chain[];
}

/**
 * 分子数据模型。
 *
 * 它做的事：
 *   1. 持有原子 / 键 / 残基 / 链的扁平数组
 *   2. 提供 fromAtoms / fromStructureData / fromPDB / fromSDF 构造入口
 *   3. 计算并缓存派生属性：bounds / center / radiusOfGyration
 *   4. 提供 O(1) 的原子索引查找，O(degree) 的键查找
 *   5. 提供按元素 / 残基 / 链筛选的查询接口
 *   6. 提供 clone / toJSON，用于修改副本和持久化
 *
 * 它不做的事：
 *   - 不解析文件（那是适配器的活）
 *   - 不做 GPU 上传
 *   - 不做键推断
 *   - 不管颜色 / 渲染
 */
export class Molecule {
    /** 所有原子。index 与数组下标一致 */
    readonly atoms: readonly Atom[];
    /** 所有键。Bond.atomA / Bond.atomB 是 atoms 的索引 */
    readonly bonds: readonly Bond[];
    /** 所有残基。非蛋白质分子为空数组 */
    readonly residues: readonly Residue[];
    /** 所有链。非蛋白质分子为空数组 */
    readonly chains: readonly Chain[];
    /** 元信息 */
    readonly metadata: MoleculeMetadata;

    /** 包围盒 + 包围球 */
    readonly bounds: Bounds;
    /** 分子中心（bounds.center 的别名） */
    readonly center: readonly [number, number, number];
    /** 回转半径（radius of gyration）。蛋白质特征量 */
    readonly radiusOfGyration: number;

    /**
     * 邻接表。
     * _adjacency[i] = 与 atom i 相连的所有 bond 在 bonds 数组里的索引。
     * 构造时建立，之后只读。
     */
    readonly #adjacency: readonly (readonly number[])[];

    /** 私有构造。请通过 fromAtoms / fromStructureData / fromPDB / fromSDF 创建。 */
    private constructor(
        parserResult: ParserResult,
        metadata: MoleculeMetadata,
    ) {
        this.atoms = [...parserResult.atoms];
        this.bonds = [...parserResult.bonds];
        this.residues = [...parserResult.residues];
        this.chains = [...parserResult.chains];
        this.metadata = metadata;

        this.#adjacency = this.#buildAdjacency();

        this.bounds = computeBounds(this.atoms);
        this.center = this.bounds.center;
        this.radiusOfGyration = computeRadiusOfGyration(this.atoms, this.center);
    }

    /**
     * 从 PDB 文本 / URL 创建。
     * 若传入 URL（以 http / https / data / blob 开头），会 fetch 后解析。
     * 否则视为 PDB 文本直接解析。
     */
    static async fromPDB(urlOrText: string): Promise<Molecule> {
        const text = await loadIfUrl(urlOrText);
        // 动态导入解析器，避免 model → adapters 的静态循环依赖
        const {parsePDB} = await import("../adapters/ts/parse");
        const result = parsePDB(text);
        return new Molecule(result, {
            name: extractName(urlOrText),
            source: "pdb",
            sourceText: text,
        });
    }

    /** 从 SDF 文本 / URL 创建。 */
    static async fromSDF(urlOrText: string): Promise<Molecule> {
        const text = await loadIfUrl(urlOrText);
        const {parseSDF} = await import("../adapters/ts/parse");
        const result = parseSDF(text);
        return new Molecule(result, {
            name: extractName(urlOrText),
            source: "sdf",
            sourceText: text,
        });
    }

    /**
     * 从 StructureData（MDR）构造 Molecule。
     * 这是领域构造的唯一入口：适配器产出 MDR，领域负责 MDR → Molecule。
     */
    static fromStructureData(data: StructureData): Molecule {
        const atoms = buildAtomsFromColumns(data.meta.atomCount, data.atoms);
        const bonds = data.bonds ? buildBondsFromColumns(data.bonds) : [];
        const residues = data.residues ? buildResiduesFromColumns(data.residues) : [];
        const chains = data.chains ? buildChainsFromColumns(data.chains) : [];

        return new Molecule(
            { atoms, bonds, residues, chains },
            { name: data.meta.name, source: "structure" },
        );
    }

    /**
     * 从已有的原子 / 键数组创建。
     * 用于单元测试、从外部库构造、从副本修改后重建。
     * 本方法假设 atoms 的 index 与数组下标一致；若不正确会做一次修正。
     */
    static fromAtoms(
        atoms: Atom[],
        bonds: Bond[] = [],
        options: { name?: string } = {},
    ): Molecule {
        // 修正 index 保证一致
        const fixedAtoms = atoms.map((a, i) =>
            a.index === i ? a : a.with({ index: i }),
        );

        // 修正 bonds 里的 atomA / atomB 范围
        const validBonds = bonds.filter(
            (b) =>
                b.atomA >= 0 && b.atomA < fixedAtoms.length &&
                b.atomB >= 0 && b.atomB < fixedAtoms.length &&
                b.atomA !== b.atomB,
        );

        return new Molecule(
            { atoms: fixedAtoms, bonds: validBonds, residues: [], chains: [] },
            { name: options.name ?? "<manual>", source: "manual" },
        );
    }

    // -------------------------------------------------------------------
    // 查询：按原子
    // -------------------------------------------------------------------

    /** 按元素符号查询原子索引。大小写敏感。 */
    getAtomsByElement(element: string): number[] {
        const result: number[] = [];
        for (let i = 0; i < this.atoms.length; i++)
            if (this.atoms[i].element === element) result.push(i);
        return result;
    }

    /** 按原子名查询（PDB 里的 atom name，如 "CA"）。 */
    getAtomsByName(name: string): number[] {
        const result: number[] = [];
        for (let i = 0; i < this.atoms.length; i++)
            if (this.atoms[i].name === name) result.push(i);
        return result;
    }

    /** 按元素统计。返回 Map<element, count>。 */
    countByElement(): Map<string, number> {
        const map = new Map<string, number>();
        for (const a of this.atoms)
            map.set(a.element, (map.get(a.element) ?? 0) + 1);
        return map;
    }

    // -------------------------------------------------------------------
    // 查询：按键
    // -------------------------------------------------------------------

    /** 获取与 atomIndex 相连的所有键的索引。O(degree)。 */
    getBondIndicesOfAtom(atomIndex: number): readonly number[] {
        if (atomIndex < 0 || atomIndex >= this.atoms.length) return [];
        return this.#adjacency[atomIndex];
    }

    /** 获取与 atomIndex 相连的所有键对象。每次创建新数组。 */
    getBondsOfAtom(atomIndex: number): Bond[] {
        const indices = this.getBondIndicesOfAtom(atomIndex);
        return indices.map((i) => this.bonds[i]);
    }

    /** 获取与 atomIndex 相连的所有邻居原子索引。 */
    getNeighbors(atomIndex: number): number[] {
        const bondIndices = this.getBondIndicesOfAtom(atomIndex);
        const result: number[] = [];
        for (const bi of bondIndices) {
            const bond = this.bonds[bi];
            const other = bond.other(atomIndex);
            if (other >= 0) result.push(other);
        }
        return result;
    }

    /**
     * 距离 cutoff（单位：Å）内的所有原子。
     * 暴力搜索 O(N)，对分子可视化足够。
     */
    getAtomsInRadius(
        center: readonly [number, number, number],
        cutoff: number,
    ): number[] {
        const cutSq = cutoff * cutoff;
        const result: number[] = [];
        const cx = center[0], cy = center[1], cz = center[2];

        for (let i = 0; i < this.atoms.length; i++) {
            const a = this.atoms[i];
            const dx = a.x - cx;
            const dy = a.y - cy;
            const dz = a.z - cz;
            if (dx * dx + dy * dy + dz * dz <= cutSq) result.push(i);
        }
        return result;
    }

    // -------------------------------------------------------------------
    // 查询：按残基 / 链
    // -------------------------------------------------------------------

    /** 获取某个残基包含的所有原子索引。 */
    getAtomsOfResidue(residueIndex: number): readonly number[] {
        if (residueIndex < 0 || residueIndex >= this.residues.length) return [];
        return this.residues[residueIndex].atomIndices;
    }

    /** 获取某个链包含的所有残基索引。 */
    getResiduesOfChain(chainIndex: number): readonly number[] {
        if (chainIndex < 0 || chainIndex >= this.chains.length) return [];
        return this.chains[chainIndex].residueIndices;
    }

    /** 获取某个原子所属的残基。无残基时返回 null。 */
    getResidueOfAtom(atomIndex: number): Residue | null {
        if (atomIndex < 0 || atomIndex >= this.atoms.length) return null;
        const ri = this.atoms[atomIndex].residueIndex;
        if (ri < 0) return null;
        return this.residues[ri];
    }

    /** 获取某个原子所属的链。 */
    getChainOfAtom(atomIndex: number): Chain | null {
        if (atomIndex < 0 || atomIndex >= this.atoms.length) return null;
        const ci = this.atoms[atomIndex].chainIndex;
        if (ci < 0) return null;
        return this.chains[ci];
    }

    // -------------------------------------------------------------------
    // 派生属性访问
    // -------------------------------------------------------------------

    /** 原子数量 */
    get atomCount(): number {
        return this.atoms.length;
    }

    /** 键数量 */
    get bondCount(): number {
        return this.bonds.length;
    }

    /** 是否含有蛋白质残基信息 */
    get isProtein(): boolean {
        return this.residues.length > 0;
    }

    /**
     * 某个原子的范德华半径（Å）。
     * 从元素表查。若元素未知返回默认值 1.5。
     */
    getVanDerWaalsRadius(atomIndex: number): number {
        const a = this.atoms[atomIndex];
        if (!a) return 0;
        const info = elementByZ(symbolToZ(a.element));
        return info.vdwRadius;
    }

    /** 某个原子的元素信息。 */
    getElementInfo(atomIndex: number): ElementInfo {
        const a = this.atoms[atomIndex];
        if (!a) return elementByZ(0);
        return elementByZ(symbolToZ(a.element));
    }

    // -------------------------------------------------------------------
    // 克隆 / 序列化
    // -------------------------------------------------------------------

    /**
     * 深克隆。
     * 所有数组和对象都重新创建，clone 后的实例与原文互不影响。
     * 派生属性在构造时重新计算。
     */
    clone(): Molecule {
        return new Molecule(
            {
                atoms: this.atoms.map((a) => a.clone()),
                bonds: this.bonds.map((b) => b.clone()),
                residues: this.residues.map((r) => r.clone()),
                chains: this.chains.map((c) => c.clone()),
            },
            { ...this.metadata },
        );
    }

    /**
     * 序列化为纯 JSON 对象。
     * 默认不包含 sourceText（可能几 MB）。需要时传 includeSource: true。
     */
    toJSON(options: { includeSource?: boolean } = {}): object {
        return {
            metadata: options.includeSource
                ? this.metadata
                : { ...this.metadata, sourceText: undefined },
            atoms: this.atoms.map((a) => a.toJSON()),
            bonds: this.bonds.map((b) => b.toJSON()),
            residues: this.residues.map((r) => r.toJSON()),
            chains: this.chains.map((c) => c.toJSON()),
        };
    }

    /** 从 toJSON 的结果恢复。 */
    static fromJSON(json: unknown): Molecule {
        const obj = json as {
            metadata: MoleculeMetadata;
            atoms: Parameters<typeof Atom.fromJSON>[0][];
            bonds: Parameters<typeof Bond.fromJSON>[0][];
            residues: Parameters<typeof Residue.fromJSON>[0][];
            chains: Parameters<typeof Chain.fromJSON>[0][];
        };
        return new Molecule(
            {
                atoms: obj.atoms.map((a) => Atom.fromJSON(a)),
                bonds: obj.bonds.map((b) => Bond.fromJSON(b)),
                residues: obj.residues.map((r) => Residue.fromJSON(r)),
                chains: obj.chains.map((c) => Chain.fromJSON(c)),
            },
            obj.metadata,
        );
    }

    /** 邻接表构建。 */
    #buildAdjacency(): readonly (readonly number[])[] {
        const n = this.atoms.length;
        const adj: number[][] = new Array(n);
        for (let i = 0; i < n; i++) adj[i] = [];

        for (let bi = 0; bi < this.bonds.length; bi++) {
            const bond = this.bonds[bi];
            const a = bond.atomA;
            const b = bond.atomB;
            if (a >= 0 && a < n) adj[a].push(bi);
            if (b >= 0 && b < n) adj[b].push(bi);
        }

        return adj;
    }
}

// ---------------------------------------------------------------------------
// 私有工具
// ---------------------------------------------------------------------------

/** 判断字符串是否是 URL（而非 PDB / SDF 文本），是则 fetch。 */
function loadIfUrl(urlOrText: string): Promise<string> | string {
    const trimmed = urlOrText.trimStart();
    if (
        trimmed.startsWith("http://") ||
        trimmed.startsWith("https://") ||
        trimmed.startsWith("data:") ||
        trimmed.startsWith("blob:") ||
        trimmed.startsWith("/") ||
        trimmed.startsWith("./")
    ) {
        return fetch(urlOrText).then((r) => {
            if (!r.ok)
                throw new Error(`MsgId: Molecule 加载失败 ${urlOrText}: ${r.status}`);
            return r.text();
        });
    }
    return urlOrText;
}

/** 从 URL 或文本提取一个名字。 */
function extractName(urlOrText: string): string {
    const trimmed = urlOrText.trimStart();
    if (trimmed.includes("/") && !trimmed.includes("\n")) {
        const parts = urlOrText.split("/");
        const last = parts[parts.length - 1];
        return last.replace(/\.[^.]+$/, "") || "molecule";
    }
    return "molecule";
}

/** 计算包围盒。 */
function computeBounds(atoms: readonly Atom[]): Bounds {
    if (atoms.length === 0)
        return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 0 };

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const a of atoms) {
        if (a.x < minX) minX = a.x;
        if (a.y < minY) minY = a.y;
        if (a.z < minZ) minZ = a.z;
        if (a.x > maxX) maxX = a.x;
        if (a.y > maxY) maxY = a.y;
        if (a.z > maxZ) maxZ = a.z;
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cz = (minZ + maxZ) / 2;

    let maxDistSq = 0;
    for (const a of atoms) {
        const dx = a.x - cx;
        const dy = a.y - cy;
        const dz = a.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > maxDistSq) maxDistSq = d2;
    }

    return {
        min: [minX, minY, minZ],
        max: [maxX, maxY, maxZ],
        center: [cx, cy, cz],
        // + 范德华半径余量
        radius: Math.sqrt(maxDistSq) + 1.5,
    };
}

/**
 * 回转半径 Rg = sqrt( Σ |rᵢ - rcm|² / N )
 * 简化：质量权重全部取 1（每个原子等权）。
 */
function computeRadiusOfGyration(
    atoms: readonly Atom[],
    center: readonly [number, number, number],
): number {
    if (atoms.length === 0) return 0;

    let sum = 0;
    const cx = center[0], cy = center[1], cz = center[2];
    for (const a of atoms) {
        const dx = a.x - cx;
        const dy = a.y - cy;
        const dz = a.z - cz;
        sum += dx * dx + dy * dy + dz * dz;
    }
    return Math.sqrt(sum / atoms.length);
}

// ---------------------------------------------------------------------------
// MDR → 领域对象转换
// ---------------------------------------------------------------------------

/** 由 AtomColumns 构造 Atom 数组。 */
function buildAtomsFromColumns(n: number, cols: AtomColumns): Atom[] {
    const atoms: Atom[] = new Array(n);
    const pos = cols.positions;
    const name = cols.name;
    const resIdx = cols.residueIndex;
    const chainIdx = cols.chainIndex;
    const charge = cols.charge;
    const occ = cols.occupancy;
    const bf = cols.bFactor;

    for (let i = 0; i < n; i++) {
        const info = elementByZ(cols.element[i]);
        atoms[i] = new Atom({
            index: i,
            element: info.symbol,
            name: name?.[i] ?? info.symbol,
            x: pos[i * 3],
            y: pos[i * 3 + 1],
            z: pos[i * 3 + 2],
            charge: charge?.[i] ?? 0,
            residueIndex: resIdx?.[i] ?? -1,
            chainIndex: chainIdx?.[i] ?? -1,
            occupancy: occ?.[i] ?? 1,
            bFactor: bf?.[i] ?? 0,
        });
    }
    return atoms;
}

/** 键级 MDR 编码 → Bond.order。2=单、4=双、6=三、3=芳香(1.5)、1=未知→1。 */
function bondOrderFromCode(code: number): number {
    switch (code) {
        case 2: return 1;
        case 4: return 2;
        case 6: return 3;
        case 3: return 1.5;
        default: return 1;
    }
}

/** 由 BondColumns 构造 Bond 数组。 */
function buildBondsFromColumns(cols: BondColumns): Bond[] {
    const bonds: Bond[] = new Array(cols.a.length);
    for (let i = 0; i < cols.a.length; i++) {
        bonds[i] = new Bond({
            index: i,
            atomA: cols.a[i],
            atomB: cols.b[i],
            order: bondOrderFromCode(cols.order[i]),
        });
    }
    return bonds;
}

/** 由 ResidueColumns 构造 Residue 数组（CSR → atomIndices）。 */
function buildResiduesFromColumns(cols: ResidueColumns): Residue[] {
    const r = cols.name.length;
    const residues: Residue[] = new Array(r);
    for (let i = 0; i < r; i++) {
        const start = cols.start[i];
        const count = cols.count[i];
        const atomIndices = new Array<number>(count);
        for (let j = 0; j < count; j++) atomIndices[j] = start + j;

        residues[i] = new Residue({
            index: i,
            name: cols.name[i],
            seqNumber: cols.seqNumber[i],
            insertionCode: cols.insertionCode[i],
            chainIndex: cols.chainIndex[i],
            atomIndices,
            isHetero: cols.flags ? (cols.flags[i] & 1) !== 0 : false,
        });
    }
    return residues;
}

/** 由 ChainColumns 构造 Chain 数组（CSR → residueIndices）。 */
function buildChainsFromColumns(cols: ChainColumns): Chain[] {
    const c = cols.id.length;
    const chains: Chain[] = new Array(c);
    for (let i = 0; i < c; i++) {
        const start = cols.start[i];
        const count = cols.count[i];
        const residueIndices = new Array<number>(count);
        for (let j = 0; j < count; j++) residueIndices[j] = start + j;

        chains[i] = new Chain({
            index: i,
            id: cols.id[i],
            residueIndices,
        });
    }
    return chains;
}
