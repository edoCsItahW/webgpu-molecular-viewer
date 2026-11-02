// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file StructureView.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc MDR 的索引视图：按需构造单个 Atom/Bond/Residue/Chain 的轻量对象，
 *       不复制全量数组；邻接表与残基原子表也是首次访问时才建 CSR。
 *
 *       这是 R2「去 AtomData[] 对象化」的核心：UI 只看当前选中项，引擎直接读列。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { elementByZ, type ElementInfo } from "./element/ElementTable.js";
import type { StructureData } from "./StructureData.js";


/** 单个原子的只读视图 */
export interface AtomView {
    readonly index: number;
    readonly z: number;
    readonly symbol: string;
    readonly element: ElementInfo;
    readonly position: readonly [number, number, number];
    readonly residueIndex: number;
    readonly chainIndex: number;
    readonly residueName: string;
    readonly chainId: string;
    readonly charge: number;
    readonly occupancy: number;
    readonly bFactor: number;
    readonly flags: number;
}

/** 单个键的只读视图 */
export interface BondView {
    readonly index: number;
    readonly a: number;
    readonly b: number;
    /** 1/2/3/4=芳香 */
    readonly order: number;
    readonly inferred: boolean;
}

/** 残基视图 */
export interface ResidueView {
    readonly index: number;
    readonly name: string;
    readonly seqNumber: number;
    readonly insertionCode: string;
    readonly chainIndex: number;
    readonly chainId: string;
    readonly start: number;
    readonly count: number;
}

/** 链视图 */
export interface ChainView {
    readonly index: number;
    readonly id: string;
    readonly start: number;
    readonly count: number;
}


export class StructureView {
    readonly data: StructureData;
    readonly atomCount: number;
    readonly bondCount: number;
    readonly residueCount: number;
    readonly chainCount: number;

    #bondsOfAtom: Uint32Array | null = null;
    #bondOffsets: Uint32Array | null = null;
    #residueAtoms: Uint32Array | null = null;

    constructor(data: StructureData) {
        this.data = data;
        this.atomCount = data.meta.atomCount;
        this.bondCount = data.bonds?.a.length ?? 0;
        this.residueCount = data.residues?.name.length ?? 0;
        this.chainCount = data.chains?.id.length ?? 0;
    }

    /** 按索引取原子视图（每次新建小对象，不缓存） */
    atom(index: number): AtomView {
        const atoms = this.data.atoms;
        const z = atoms.element[index] ?? 0;
        const element = elementByZ(z);
        const residueIndex = atoms.residueIndex?.[index] ?? -1;
        const chainIndex = atoms.chainIndex?.[index] ?? -1;

        return {
            index,
            z,
            symbol: element.symbol,
            element,
            position: [
                atoms.positions[index * 3]!,
                atoms.positions[index * 3 + 1]!,
                atoms.positions[index * 3 + 2]!,
            ],
            residueIndex,
            chainIndex,
            residueName: this.data.residues?.name[residueIndex] ?? "",
            chainId: this.data.chains?.id[chainIndex] ?? "",
            charge: atoms.charge?.[index] ?? 0,
            occupancy: atoms.occupancy?.[index] ?? 1,
            bFactor: atoms.bFactor?.[index] ?? 0,
            flags: atoms.flags?.[index] ?? 0,
        };
    }

    bond(index: number): BondView {
        const bonds = this.data.bonds!;

        return {
            index,
            a: bonds.a[index]!,
            b: bonds.b[index]!,
            order: bonds.order[index] ?? 1,
            inferred: bonds.inferred,
        };
    }

    residue(index: number): ResidueView {
        const residues = this.data.residues!;

        return {
            index,
            name: residues.name[index] ?? "",
            seqNumber: residues.seqNumber[index] ?? 0,
            insertionCode: residues.insertionCode[index] ?? "",
            chainIndex: residues.chainIndex[index] ?? -1,
            chainId: this.data.chains?.id[residues.chainIndex[index] ?? -1] ?? "",
            start: residues.start[index] ?? 0,
            count: residues.count[index] ?? 0,
        };
    }

    chain(index: number): ChainView {
        const chains = this.data.chains!;

        return {
            index,
            id: chains.id[index] ?? "",
            start: chains.start[index] ?? 0,
            count: chains.count[index] ?? 0,
        };
    }

    /** 原子 i 的键下标（CSR，首次访问构建） */
    bondsOfAtom(index: number): Uint32Array {
        this.#ensureAdjacency();

        const start = this.#bondOffsets![index]!;
        const end = this.#bondOffsets![index + 1]!;

        return this.#bondsOfAtom!.subarray(start, end);
    }

    /** 残基 r 的原子下标（CSR，直接复用 residues.start/count） */
    residueAtoms(index: number): Uint32Array {
        if (!this.#residueAtoms) {
            const residues = this.data.residues;
            const atoms = this.data.atoms;
            const count = this.atomCount;

            this.#residueAtoms = new Uint32Array(count);

            if (residues) {
                const cursor = new Uint32Array(residues.name.length);

                for (let i = 0; i < count; i++) {
                    const r = atoms.residueIndex?.[i] ?? -1;
                    if (r < 0) continue;

                    this.#residueAtoms[residues.start[r]! + cursor[r]!] = i;
                    cursor[r] = cursor[r]! + 1;
                }
            }
        }

        const residues = this.data.residues;
        if (!residues) return new Uint32Array(0);

        const start = residues.start[index] ?? 0;
        const count = residues.count[index] ?? 0;

        return this.#residueAtoms.subarray(start, start + count);
    }

    #ensureAdjacency(): void {
        if (this.#bondOffsets) return;

        const bonds = this.data.bonds;
        const offsets = new Uint32Array(this.atomCount + 1);
        const degree = new Uint32Array(this.atomCount);

        if (bonds) {
            for (let k = 0; k < bonds.a.length; k++) {
                degree[bonds.a[k]!] = degree[bonds.a[k]!]! + 1;
                degree[bonds.b[k]!] = degree[bonds.b[k]!]! + 1;
            }
        }

        for (let i = 0; i < this.atomCount; i++) offsets[i + 1] = offsets[i]! + degree[i]!;

        const cursor = offsets.slice(0, this.atomCount);
        const list = new Uint32Array(offsets[this.atomCount]!);

        if (bonds) {
            for (let k = 0; k < bonds.a.length; k++) {
                const a = bonds.a[k]!;
                const b = bonds.b[k]!;

                list[cursor[a]!] = k;
                cursor[a] = cursor[a]! + 1;
                list[cursor[b]!] = k;
                cursor[b] = cursor[b]! + 1;
            }
        }

        this.#bondOffsets = offsets;
        this.#bondsOfAtom = list;
    }
}
