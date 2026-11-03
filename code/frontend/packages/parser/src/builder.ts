// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file builder.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 解析结果的累加器：可增长的 SoA 数组 + 字符串字典。
 *
 *       一次性增长到 2 倍，避免逐原子 `push` 的 GC；字典只存不重复的残基/链/元素。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { ParsedStructure, StructureFormat } from "./types.js";


export class StructureBuilder {
    positions: Float32Array;
    elementIndex: Uint8Array;
    residueIndex: Uint32Array;
    chainIndex: Uint16Array;
    bfactor: Float32Array;
    occupancy: Float32Array;

    /** MDR 位标记（Hetero/Water/Hydrogen/Backbone…） */
    flags: Uint8Array;

    /** 每原子的残基序号 */
    residueSeq: Int32Array;

    /** 每原子的插入码（通常空串） */
    residueIcode: string[] = [];

    /** 每个残基的二级结构（0=coil 1=helix 2=sheet 3=turn）；可选 */
    ss?: Uint8Array;

    count = 0;

    readonly elements: string[] = [];
    readonly residues: string[] = [];
    readonly chains: string[] = [];

    private readonly elementMap = new Map<string, number>();
    private readonly residueMap = new Map<string, number>();
    private readonly chainMap = new Map<string, number>();

    constructor(capacity = 1024) {
        const cap = Math.max(16, capacity);

        this.positions = new Float32Array(cap * 3);
        this.elementIndex = new Uint8Array(cap);
        this.residueIndex = new Uint32Array(cap);
        this.chainIndex = new Uint16Array(cap);
        this.bfactor = new Float32Array(cap);
        this.occupancy = new Float32Array(cap);
        this.flags = new Uint8Array(cap);
        this.residueSeq = new Int32Array(cap);
    }

    /** 追加一个原子；返回其下标 */
    push(
        x: number,
        y: number,
        z: number,
        symbol: string,
        residue: string,
        chain: string,
        bfactor: number,
        occupancy: number,
        meta?: {flags?: number; residueSeq?: number; residueIcode?: string}
    ): number {
        if (this.count >= this.elementIndex.length) this.grow(this.elementIndex.length * 2);

        const i = this.count;

        this.positions[i * 3] = x;
        this.positions[i * 3 + 1] = y;
        this.positions[i * 3 + 2] = z;
        this.elementIndex[i] = this.intern(this.elementMap, this.elements, symbol);
        this.residueIndex[i] = this.internResidue(
            residue,
            chain,
            meta?.residueSeq ?? 0,
            meta?.residueIcode ?? ""
        );
        this.chainIndex[i] = this.intern(this.chainMap, this.chains, chain);
        this.bfactor[i] = bfactor;
        this.occupancy[i] = occupancy;
        this.flags[i] = meta?.flags ?? 0;
        this.residueSeq[i] = meta?.residueSeq ?? 0;
        this.residueIcode[i] = meta?.residueIcode ?? "";
        this.count = i + 1;

        return i;
    }

    /** 裁剪到实际长度并产出结果 */
    finish(
        name: string,
        format: StructureFormat,
        bonds: Uint32Array,
        bondCount: number,
        parseMs: number,
        bondMs: number,
        extras?: {
            bondOrders?: Uint8Array;
            charges?: Float32Array;
            bondsInferred?: boolean;
        }
    ): ParsedStructure {
        const n = this.count;

        return {
            name,
            format,
            count: n,
            positions: this.positions.slice(0, n * 3),
            elements: this.elements,
            elementIndex: this.elementIndex.slice(0, n),
            residues: this.residues,
            residueIndex: this.residueIndex.slice(0, n),
            chains: this.chains,
            chainIndex: this.chainIndex.slice(0, n),
            bfactor: this.bfactor.slice(0, n),
            occupancy: this.occupancy.slice(0, n),
            flags: this.flags.slice(0, n),
            residueSeq: this.residueSeq.slice(0, n),
            residueIcode: this.residueIcode.slice(0, n),
            ss: this.ss,
            bonds,
            bondCount,
            ...extras,
            parseMs,
            bondMs
        };
    }

    private grow(capacity: number): void {
        const cap = Math.max(16, capacity);

        this.positions = growFloat32(this.positions, cap * 3);
        this.elementIndex = growUint8(this.elementIndex, cap);
        this.residueIndex = growUint32(this.residueIndex, cap);
        this.chainIndex = growUint16(this.chainIndex, cap);
        this.bfactor = growFloat32(this.bfactor, cap);
        this.occupancy = growFloat32(this.occupancy, cap);
        this.flags = growUint8(this.flags, cap);
        this.residueSeq = growInt32(this.residueSeq, cap);
    }

    /** 残基按 chain + seq + icode + name 区分；只按名字会把所有 ALA 合成一个残基 */
    private internResidue(name: string, chain: string, seq: number, icode: string): number {
        const key = `${chain}\u0001${seq}\u0001${icode}\u0001${name}`;
        const existing = this.residueMap.get(key);

        if (existing !== undefined) return existing;

        const index = this.residues.length;

        this.residues.push(name);
        this.residueMap.set(key, index);

        return index;
    }

    private intern(map: Map<string, number>, list: string[], value: string): number {
        const existing = map.get(value);

        if (existing !== undefined) return existing;

        const index = list.length;

        list.push(value);
        map.set(value, index);

        return index;
    }
}

function growFloat32(source: Float32Array, size: number): Float32Array {
    const next = new Float32Array(size);
    next.set(source);

    return next;
}

function growUint8(source: Uint8Array, size: number): Uint8Array {
    const next = new Uint8Array(size);
    next.set(source);

    return next;
}

function growUint16(source: Uint16Array, size: number): Uint16Array {
    const next = new Uint16Array(size);
    next.set(source);

    return next;
}

function growUint32(source: Uint32Array, size: number): Uint32Array {
    const next = new Uint32Array(size);
    next.set(source);

    return next;
}

function growInt32(source: Int32Array, size: number): Int32Array {
    const next = new Int32Array(size);
    next.set(source);

    return next;
}

