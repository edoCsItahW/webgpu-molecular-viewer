// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file structure-build.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 把"演示分子 / RDKit 结果"这类遗留对象数组转成 MDR（StructureData）。
 *
 *       仅用于入口适配（demo、SMILES/MOL2/XYZ 等 RDKit 路径）；PDB/CIF/SDF 由 parser 直接产 MDR。
 *       键感知仍在调用方完成（RDKit 无键时），这里只负责列化。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { symbolToZ, type StructureData, type StructureFormat } from "@wmv/structure";


/** 遗留原子输入（最小字段） */
export interface InputAtom {
    symbol: string;
    position: readonly [number, number, number];
    residue?: string;
    chain?: string;
    bfactor?: number;
    occupancy?: number;
    charge?: number;
}

const WATER = new Set(["HOH", "WAT", "H2O", "DOD", "SOL"]);

const FLAG_HETERO = 1 << 0;
const FLAG_WATER = 1 << 1;
const FLAG_HYDROGEN = 1 << 2;
const FLAG_ALT_PRIMARY = 1 << 3;


/**
 * 对象数组 → MDR。
 *
 * 残基编号按"首次出现顺序"分配（demo/RDKit 没有真实 seq）；PDB/CIF 请走 parser。
 */
export function buildStructureData(
    name: string,
    atoms: readonly InputAtom[],
    bonds: ReadonlyArray<readonly [number, number]>,
    format: StructureFormat = "unknown"
): StructureData {
    const n = atoms.length;
    const element = new Uint8Array(n);
    const positions = new Float32Array(n * 3);
    const residueIndex = new Int32Array(n);
    const chainIndex = new Int32Array(n);
    const occupancy = new Float32Array(n);
    const bFactor = new Float32Array(n);
    const charge = new Float32Array(n);
    const flags = new Uint8Array(n);

    const residueNames: string[] = [];
    const chainIds: string[] = [];
    const residueMap = new Map<string, number>();
    const chainMap = new Map<string, number>();
    const residueChain: number[] = [];
    const residueSeq: number[] = [];

    for (let i = 0; i < n; i++) {
        const atom = atoms[i]!;

        element[i] = symbolToZ(atom.symbol);
        positions[i * 3] = atom.position[0];
        positions[i * 3 + 1] = atom.position[1];
        positions[i * 3 + 2] = atom.position[2];
        occupancy[i] = atom.occupancy ?? 1;
        bFactor[i] = atom.bfactor ?? 0;
        charge[i] = atom.charge ?? 0;

        const chainId = atom.chain ?? "";
        const residueName = atom.residue ?? "";

        let c = chainMap.get(chainId);

        if (c === undefined) {
            c = chainIds.length;
            chainIds.push(chainId);
            chainMap.set(chainId, c);
        }

        const residueKey = `${chainId}\u0001${residueName}`;
        let r = residueMap.get(residueKey);

        if (r === undefined) {
            r = residueNames.length;
            residueNames.push(residueName);
            residueMap.set(residueKey, r);
            residueChain.push(c);
            residueSeq.push(residueNames.length);
        }

        chainIndex[i] = c;
        residueIndex[i] = r;

        let flag = FLAG_ALT_PRIMARY;

        if (WATER.has(residueName)) flag |= FLAG_WATER;
        if (element[i] === 1) flag |= FLAG_HYDROGEN;
        flags[i] = flag;
    }

    const residueStart = new Int32Array(residueNames.length);
    const residueCount = new Int32Array(residueNames.length);
    const firstAtom = new Int32Array(residueNames.length).fill(-1);

    for (let i = 0; i < n; i++) {
        const r = residueIndex[i]!;

        if (firstAtom[r]! < 0) firstAtom[r] = i;
        residueCount[r] = residueCount[r]! + 1;
    }

    let offset = 0;

    for (let r = 0; r < residueNames.length; r++) {
        residueStart[r] = offset;
        offset += residueCount[r]!;
    }

    const chainStart = new Int32Array(chainIds.length);
    const chainCount = new Int32Array(chainIds.length);

    for (let r = 0; r < residueNames.length; r++)
        chainCount[residueChain[r]!] = chainCount[residueChain[r]!]! + 1;

    offset = 0;

    for (let c = 0; c < chainIds.length; c++) {
        chainStart[c] = offset;
        offset += chainCount[c]!;
    }

    const bA = new Uint32Array(bonds.length);
    const bB = new Uint32Array(bonds.length);
    const bOrder = new Uint8Array(bonds.length);

    for (let k = 0; k < bonds.length; k++) {
        const [a, b] = bonds[k]!;

        bA[k] = Math.min(a, b);
        bB[k] = Math.max(a, b);
        bOrder[k] = 1;
    }

    return {
        meta: {
            mdrVersion: 1,
            name,
            sourceFormat: format,
            units: {length: "angstrom"},
            atomCount: n,
            modelCount: 1,
            producer: {kind: "ts", name: "app:buildStructureData", version: "1.0.0"},
        },
        atoms: {
            element,
            positions,
            residueIndex,
            chainIndex,
            occupancy,
            bFactor,
            charge,
            flags,
        },
        bonds: bonds.length > 0
            ? {a: bA, b: bB, order: bOrder, inferred: true}
            : undefined,
        residues: residueNames.length > 0
            ? {
                name: residueNames,
                seqNumber: Int32Array.from(residueSeq),
                insertionCode: new Array<string>(residueNames.length).fill(""),
                chainIndex: Int32Array.from(residueChain),
                start: residueStart,
                count: residueCount,
            }
            : undefined,
        chains: chainIds.length > 0
            ? {id: chainIds, start: chainStart, count: chainCount}
            : undefined,
        problems: [],
    };
}
