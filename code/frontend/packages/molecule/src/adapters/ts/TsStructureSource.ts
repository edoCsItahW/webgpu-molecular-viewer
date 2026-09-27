// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file TsStructureSource.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 默认结构来源适配器：用 TS 解析器把 PDB/SDF 文本/文件/URL 转成 MDR。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {
    StructureSourcePort,
    StructureRequest,
    SourceCapabilities,
} from "../../ports";
import type {StructureData, StructureFormat} from "@wmv/structure";
import {
    MDR_MAJOR,
    MDR_MINOR,
    assertValid,
} from "@wmv/structure";
import {sniff, parsePDB, parseSDF} from "./parse";
import {PortError} from "@wmv/common";
import type {Atom, Bond, Residue, Chain} from "../../model";
import {symbolToZ} from "@wmv/structure";

/** 把 ParserResult（Atom/Bond/Residue/Chain 数组）转成 StructureData（MDR）。 */
function parserResultToMDR(
    atoms: readonly Atom[],
    bonds: readonly Bond[],
    residues: readonly Residue[],
    chains: readonly Chain[],
    name: string,
    sourceFormat: StructureFormat,
): StructureData {
    const n = atoms.length;

    const element = new Uint8Array(n);
    const positions = new Float32Array(n * 3);
    const nameArr: string[] = new Array(n);
    const residueIndex = new Int32Array(n);
    const chainIndex = new Int32Array(n);
    const charge = new Float32Array(n);
    const occupancy = new Float32Array(n);
    const bFactor = new Float32Array(n);

    for (let i = 0; i < n; i++) {
        const a = atoms[i];
        element[i] = symbolToZ(a.element);
        positions[i * 3] = a.x;
        positions[i * 3 + 1] = a.y;
        positions[i * 3 + 2] = a.z;
        nameArr[i] = a.name;
        residueIndex[i] = a.residueIndex;
        chainIndex[i] = a.chainIndex;
        charge[i] = a.charge;
        occupancy[i] = a.occupancy;
        bFactor[i] = a.bFactor;
    }

    const data: StructureData = {
        meta: {
            mdrVersion: MDR_MAJOR,
            name,
            sourceFormat,
            units: { length: "angstrom" },
            atomCount: n,
            modelCount: 1,
            producer: { kind: "ts", name: "TsStructureSource", version: `${MDR_MAJOR}.${MDR_MINOR}` },
        },
        atoms: {
            element,
            positions,
            name: nameArr,
            residueIndex,
            chainIndex,
            charge,
            occupancy,
            bFactor,
        },
        problems: [],
    };

    if (bonds.length > 0) {
        const ba = new Uint32Array(bonds.length);
        const bb = new Uint32Array(bonds.length);
        const order = new Uint8Array(bonds.length);
        for (let i = 0; i < bonds.length; i++) {
            const b = bonds[i];
            ba[i] = b.atomA;
            bb[i] = b.atomB;
            order[i] = bondOrderToCode(b.order);
        }
        data.bonds = { a: ba, b: bb, order, inferred: false };
    }

    if (residues.length > 0) {
        const rCount = residues.length;
        const resName: string[] = new Array(rCount);
        const seqNumber = new Int32Array(rCount);
        const insertionCode: string[] = new Array(rCount);
        const resChainIndex = new Int32Array(rCount);
        const start = new Int32Array(rCount);
        const count = new Int32Array(rCount);
        const flags = new Uint8Array(rCount);

        for (let i = 0; i < rCount; i++) {
            const r = residues[i];
            resName[i] = r.name;
            seqNumber[i] = r.seqNumber;
            insertionCode[i] = r.insertionCode;
            resChainIndex[i] = r.chainIndex;
            count[i] = r.atomIndices.length;
            flags[i] = r.isHetero ? 1 : 0;
        }
        // CSR start：累加
        let acc = 0;
        for (let i = 0; i < rCount; i++) {
            start[i] = acc;
            acc += count[i];
        }
        data.residues = {
            name: resName,
            seqNumber,
            insertionCode,
            chainIndex: resChainIndex,
            start,
            count,
            flags,
        };
    }

    if (chains.length > 0) {
        const cCount = chains.length;
        const chainId: string[] = new Array(cCount);
        const start = new Int32Array(cCount);
        const count = new Int32Array(cCount);
        for (let i = 0; i < cCount; i++) {
            chainId[i] = chains[i].id;
            count[i] = chains[i].residueIndices.length;
        }
        let acc = 0;
        for (let i = 0; i < cCount; i++) {
            start[i] = acc;
            acc += count[i];
        }
        data.chains = { id: chainId, start, count };
    }

    return data;
}

/** Bond.order → MDR order 编码。1→2, 2→4, 3→6, 1.5→3, 其他→2。 */
function bondOrderToCode(order: number): number {
    if (order === 1) return 2;
    if (order === 2) return 4;
    if (order === 3) return 6;
    if (order === 1.5) return 3;
    return 2;
}

/** 把 ArrayBuffer 按 UTF-8 解码为文本。 */
function decodeBytes(bytes: ArrayBuffer): string {
    return new TextDecoder("utf-8").decode(bytes);
}

/**
 * 默认结构来源适配器：TS 解析器，零后端。
 * 支持 inline-text / file / url / sample（sample 返回空结构占位）。
 */
export class TsStructureSource implements StructureSourcePort {
    readonly id = "ts";

    async capabilities(): Promise<SourceCapabilities> {
        return {
            source: "ts",
            formats: ["pdb", "sdf"],
            supportsCancel: false,
            supportsBinaryTransfer: false,
        };
    }

    async load(request: StructureRequest, signal?: AbortSignal): Promise<StructureData> {
        // 取消检查
        if (signal?.aborted)
            throw new PortError("cancelled", "加载已取消");

        let text: string;
        let name: string;
        let formatHint: StructureFormat | undefined;

        switch (request.kind) {
            case "inline-text":
                text = request.text;
                name = request.name ?? "molecule";
                formatHint = request.formatHint;
                break;
            case "file":
                text = decodeBytes(request.bytes);
                name = request.name;
                formatHint = request.formatHint;
                break;
            case "url": {
                name = request.name ?? extractNameFromUrl(request.url);
                formatHint = request.formatHint;
                try {
                    const res = await fetch(request.url, { signal });
                    if (!res.ok)
                        throw new PortError("backend-unavailable", `HTTP ${res.status}`);
                    text = await res.text();
                } catch (e) {
                    if (signal?.aborted) throw new PortError("cancelled", "加载已取消");
                    if (e instanceof PortError) throw e;
                    throw new PortError("network", String(e));
                }
                break;
            }
            case "sample":
                // 首版无内置示例库，返回空结构
                throw new PortError("unsupported-format", `示例 ${request.sampleId} 未提供`);
        }

        const fmt = formatHint ?? sniff(text);
        if (fmt === "unknown")
            throw new PortError("unsupported-format", "无法识别结构格式");

        const result = fmt === "pdb" ? parsePDB(text) : parseSDF(text);
        const data = parserResultToMDR(
            result.atoms, result.bonds, result.residues, result.chains,
            name, fmt,
        );

        // 解码后立即自检
        try {
            assertValid(data);
        } catch (e) {
            throw new PortError("malformed", e instanceof Error ? e.message : String(e));
        }

        return data;
    }
}

/** 从 URL 提取文件名。 */
function extractNameFromUrl(url: string): string {
    try {
        const u = new URL(url);
        const last = u.pathname.split("/").pop() ?? "molecule";
        return last.replace(/\.[^.]+$/, "") || "molecule";
    } catch {
        return "molecule";
    }
}
