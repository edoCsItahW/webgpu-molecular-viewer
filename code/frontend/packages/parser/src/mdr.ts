// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file mdr.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 把 parser 的 SoA 结果适配成 `@wmv/structure` 的 MDR v1（StructureData）。
 *
 *       这是 R2.0 的契约层：
 *         - 元素用**原子序数**（GPU/查表友好），不再带符号字典；
 *         - flags 携带 Hetero/Water/Hydrogen/Backbone，供过滤与着色；
 *         - 残基/链转成 CSR，卡通与结构树直接消费；
 *         - 键级/电荷原样带入，SDF 不再丢化学信息。
 *
 *       仍缺的列（下一步补）：`atoms.serial/name/altLoc/modelIndex`、`ss`（CIF 的
 *       `_struct_conf` 尚未解析）、`problems` 的细粒度记录。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {
    symbolToZ,
    type StructureData,
    type StructureFormat as MdrFormat,
} from "@wmv/structure";
import type { ParsedStructure } from "./types.js";


/** parser 的格式名 → MDR 的格式名 */
function toMdrFormat(format: ParsedStructure["format"]): MdrFormat {
    return format === "pdb" || format === "cif" || format === "sdf" ? format : "unknown";
}


/**
 * SoA → MDR。
 *
 * 纯函数：不修改输入数组（输出是新分配的列）。
 */
export function toStructureData(parsed: ParsedStructure): StructureData {
    const n = parsed.count;

    const element = new Uint8Array(n);

    for (let i = 0; i < n; i++) {
        const symbol = parsed.elements[parsed.elementIndex[i]!] ?? "X";

        element[i] = symbolToZ(symbol);
    }

    const residueIndex = new Int32Array(n);
    const chainIndex = new Int32Array(n);

    for (let i = 0; i < n; i++) {
        residueIndex[i] = parsed.residueIndex[i]!;
        chainIndex[i] = parsed.chainIndex[i]!;
    }

    const atoms: StructureData["atoms"] = {
        element,
        positions: parsed.positions,
        residueIndex,
        chainIndex,
        occupancy: parsed.occupancy,
        bFactor: parsed.bfactor,
        flags: parsed.flags ?? new Uint8Array(n),
    };

    if (parsed.charges) atoms.charge = parsed.charges;

    // ---- 键列 ----
    let bonds: StructureData["bonds"] | undefined;

    if (parsed.bondCount > 0) {
        const a = new Uint32Array(parsed.bondCount);
        const b = new Uint32Array(parsed.bondCount);
        const order = new Uint8Array(parsed.bondCount);

        for (let k = 0; k < parsed.bondCount; k++) {
            a[k] = parsed.bonds[k * 2]!;
            b[k] = parsed.bonds[k * 2 + 1]!;
            order[k] = parsed.bondOrders?.[k] ?? 1;
        }

        bonds = {a, b, order, inferred: parsed.bondsInferred ?? true};
    }

    // ---- 残基 CSR ----
    let residues: StructureData["residues"] | undefined;
    let chains: StructureData["chains"] | undefined;

    const residueCount = parsed.residues.length;
    const chainCount = parsed.chains.length;

    if (residueCount > 0) {
        const start = new Int32Array(residueCount);
        const count = new Int32Array(residueCount);
        const firstAtom = new Int32Array(residueCount).fill(-1);

        for (let i = 0; i < n; i++) {
            const r = residueIndex[i]!;

            if (firstAtom[r]! < 0) firstAtom[r] = i;
            count[r] = count[r]! + 1;
        }

        let offset = 0;

        for (let r = 0; r < residueCount; r++) {
            start[r] = offset;
            offset += count[r]!;
        }

        const seqNumber = new Int32Array(residueCount);
        const insertionCode = new Array<string>(residueCount).fill("");
        const residueChain = new Int32Array(residueCount);

        for (let r = 0; r < residueCount; r++) {
            const i = firstAtom[r]!;

            if (i < 0) continue;

            seqNumber[r] = parsed.residueSeq?.[i] ?? 0;
            insertionCode[r] = parsed.residueIcode?.[i] ?? "";
            residueChain[r] = chainIndex[i]!;
        }

        residues = {
            name: parsed.residues,
            seqNumber,
            insertionCode,
            chainIndex: residueChain,
            start,
            count,
        };

        // ---- 链 CSR ----
        if (chainCount > 0) {
            const chainStart = new Int32Array(chainCount);
            const chainCounts = new Int32Array(chainCount);

            for (let r = 0; r < residueCount; r++)
                chainCounts[residueChain[r]!] = chainCounts[residueChain[r]!]! + 1;

            let chainOffset = 0;

            for (let c = 0; c < chainCount; c++) {
                chainStart[c] = chainOffset;
                chainOffset += chainCounts[c]!;
            }

            chains = {id: parsed.chains, start: chainStart, count: chainCounts};
        }
    }

    const data: StructureData = {
        meta: {
            mdrVersion: 1,
            name: parsed.name,
            sourceFormat: toMdrFormat(parsed.format),
            units: {length: "angstrom"},
            atomCount: n,
            modelCount: 1,
            producer: {kind: "ts", name: "@wmv/parser", version: "1.0.0"},
            timing: {parseMs: parsed.parseMs},
        },
        atoms,
        bonds,
        residues,
        chains,
        ss: parsed.ss,
        problems: [],
    };

    if (parsed.ss && residues && parsed.ss.length !== residues.name.length)
        data.ss = undefined;

    return data;
}
