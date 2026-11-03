// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file pdb.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc PDB（Protein Data Bank）解析器：固定列扫描，不切行、不建对象。
 *
 *       关键规则：
 *         - 只取第一个 MODEL（NMR 多模型结构）；
 *         - altLoc 只接受空 / 'A'（其余构象跳过，避免同原子重复）；
 *         - 元素优先取 77-78 列，缺失时按原子名推断；
 *         - CONECT 的数字是 PDB 序列号而非数组下标：解析时顺带记录 serial，最后映射；
 *         - PDB 不存聚合物键，默认做几何键感知（显式 CONECT 优先占价数）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { StructureBuilder } from "./builder.js";
import { perceiveBondsSoA } from "./bonds.js";
import { covalentRadiusOf, maxValenceOf, normalizeElementSymbol } from "./elements.js";
import { parseFloatRange, parseIntRange } from "./scan.js";
import { nameFromFilename, type ParseOptions, type ParsedStructure } from "./types.js";


/** 水残基名（用于 MDR 的 Water 位标记） */
const WATER_RESIDUES = new Set(["HOH", "WAT", "H2O", "DOD", "SOL"]);

/** 主链原子名（Protein + Nucleic） */
const BACKBONE_ATOMS = new Set([
    "N", "CA", "C", "O", "OXT",
    "P", "O5'", "C5'", "C4'", "C3'", "O3'"
]);

/** MDR AtomFlag 位（与 @wmv/structure 的 AtomFlag 一致） */
const FLAG_HETERO = 1 << 0;
const FLAG_WATER = 1 << 1;
const FLAG_HYDROGEN = 1 << 2;
const FLAG_ALT_PRIMARY = 1 << 3;
const FLAG_BACKBONE = 1 << 4;
const FLAG_CA = 1 << 5;


/** 原子名字段推断元素（PDB 77-78 列为空时的兜底） */
function elementFromAtomName(text: string, start: number, end: number): string {
    // PDB 约定：原子名以空格开头时（如 " CA "）是单字母元素；顶格两字母（如 "CA  "）才是钙
    const leadingSpace = text.charCodeAt(start) === 32;

    for (let i = start; i < end; i++) {
        const code = text.charCodeAt(i);

        if (code === 32 || (code >= 48 && code <= 57)) continue;

        const first = String.fromCharCode(code).toUpperCase();

        if (!leadingSpace && i + 1 < end) {
            const nextCode = text.charCodeAt(i + 1);

            if (nextCode >= 65 && nextCode <= 90) {
                const second = String.fromCharCode(nextCode).toLowerCase();
                const pair = first + second;

                if (pair === "Cl" || pair === "Br" || pair === "Fe" || pair === "Zn" || pair === "Mg"
                    || pair === "Ca" || pair === "Na" || pair === "Mn" || pair === "Cu"
                    || pair === "Ni" || pair === "Co" || pair === "Se") {
                    return pair;
                }
            }
        }

        return first;
    }

    return "X";
}

/** 判断 [start,end) 是否与 last 完全相同（复用上一次的残基字符串，避免每原子 slice） */
function equalsLast(text: string, start: number, end: number, last: string): boolean {
    if (last.length !== end - start) return false;

    for (let i = 0; i < last.length; i++)
        if (text.charCodeAt(start + i) !== last.charCodeAt(i)) return false;

    return true;
}


/**
 * 解析 PDB 文本。
 */
export function parsePdb(text: string, filename = "", options: ParseOptions = {}): ParsedStructure {
    const startedAt = performance.now();
    const builder = new StructureBuilder(Math.max(1024, Math.floor(text.length / 80)));

    // 与 builder.count 同步增长：CONECT 的序列号 → 下标映射需要它
    let serials = new Uint32Array(Math.max(1024, Math.floor(text.length / 80)));

    let conect = new Uint32Array(4096);
    let conectFill = 0;

    const appendConect = (a: number, b: number): void => {
        if (conectFill + 2 > conect.length) {
            const next = new Uint32Array(conect.length * 2);
            next.set(conect);
            conect = next;
        }

        conect[conectFill++] = a;
        conect[conectFill++] = b;
    };

    let modelCount = 0;
    let lastResidue = "";
    let lastChainCode = -1;
    let lastChain = "";

    /** 二级结构区间（来自 HELIX/SHEET 记录） */
    const ssRanges: Array<{chain: string; start: number; end: number; type: number}> = [];

    const length = text.length;

    for (let lineStart = 0; lineStart < length;) {
        let lineEnd = text.indexOf("\n", lineStart);

        if (lineEnd < 0) lineEnd = length;

        let contentEnd = lineEnd;

        if (contentEnd > lineStart && text.charCodeAt(contentEnd - 1) === 13) contentEnd--;

        const lineLength = contentEnd - lineStart;

        if (lineLength >= 6) {
            if (text.startsWith("ATOM  ", lineStart) || text.startsWith("HETATM", lineStart)) {
                if (modelCount <= 1 && lineLength >= 54) {
                    const isHetero = text.startsWith("HETATM", lineStart);
                    const altLoc = lineLength > 16 ? text.charCodeAt(lineStart + 16) : 32;

                    if (altLoc === 32 || altLoc === 65) {
                        const x = parseFloatRange(text, lineStart + 30, lineStart + 38);
                        const y = parseFloatRange(text, lineStart + 38, lineStart + 46);
                        const z = parseFloatRange(text, lineStart + 46, lineStart + 54);

                        let symbol: string;

                        if (lineLength >= 78) {
                            let es = lineStart + 76;
                            let ee = lineStart + 78;

                            while (es < ee && text.charCodeAt(es) === 32) es++;

                            symbol = es < ee
                                ? normalizeElementSymbol(text.slice(es, ee))
                                : elementFromAtomName(text, lineStart + 12, lineStart + 16);
                        } else {
                            symbol = elementFromAtomName(text, lineStart + 12, lineStart + 16);
                        }

                        let residue: string;

                        if (equalsLast(text, lineStart + 17, lineStart + 21, lastResidue)) {
                            residue = lastResidue;
                        } else {
                            residue = text.slice(lineStart + 17, lineStart + 21).trim();
                            lastResidue = residue;
                        }

                        let chain: string;

                        if (lineLength > 21) {
                            const code = text.charCodeAt(lineStart + 21);

                            if (code === lastChainCode) {
                                chain = lastChain;
                            } else {
                                chain = String.fromCharCode(code).trim();
                                lastChainCode = code;
                                lastChain = chain;
                            }
                        } else {
                            chain = "";
                        }

                        const bfactor = lineLength >= 66
                            ? parseFloatRange(text, lineStart + 60, lineStart + 66)
                            : 0;
                        const occupancy = lineLength >= 60
                            ? parseFloatRange(text, lineStart + 54, lineStart + 60)
                            : 1;

                        const atomName = text.slice(lineStart + 12, lineStart + 16).trim();

                        let flags = FLAG_ALT_PRIMARY;
                        if (isHetero) flags |= FLAG_HETERO;
                        if (isHetero && WATER_RESIDUES.has(residue)) flags |= FLAG_WATER;
                        if (symbol === "H" || symbol === "D") flags |= FLAG_HYDROGEN;
                        if (BACKBONE_ATOMS.has(atomName)) flags |= FLAG_BACKBONE;
                        if (atomName === "CA") flags |= FLAG_CA;

                        const residueSeq = parseIntRange(text, lineStart + 22, lineStart + 26);
                        const icode = lineLength > 26 && text.charCodeAt(lineStart + 26) !== 32
                            ? text.charAt(lineStart + 26)
                            : "";

                        const index = builder.push(
                            x, y, z, symbol, residue, chain, bfactor, occupancy,
                            {flags, residueSeq, residueIcode: icode}
                        );

                        if (index >= serials.length) {
                            const next = new Uint32Array(serials.length * 2);
                            next.set(serials);
                            serials = next;
                        }

                        serials[index] = parseIntRange(text, lineStart + 6, lineStart + 11);
                    }
                }
            } else if (text.startsWith("HELIX ", lineStart) || text.startsWith("SHEET ", lineStart)) {
                const isHelix = text.startsWith("HELIX ", lineStart);
                const chainIndex = isHelix ? 19 : 21;
                const startIndex = isHelix ? 21 : 22;
                const endIndex = isHelix ? 33 : 33;

                if (lineLength > endIndex + 4) {
                    const chainId = text.charAt(lineStart + chainIndex).trim();
                    const start = parseIntRange(text, lineStart + startIndex, lineStart + startIndex + 4);
                    const end = parseIntRange(text, lineStart + endIndex, lineStart + endIndex + 4);

                    if (end >= start && start > 0)
                        ssRanges.push({chain: chainId, start, end, type: isHelix ? 1 : 2});
                }
            } else if (text.startsWith("CONECT", lineStart)) {
                let current = -1;
                let i = lineStart + 6;

                while (i < contentEnd) {
                    const code = text.charCodeAt(i);

                    if (code >= 48 && code <= 57) {
                        const start = i;

                        while (i < contentEnd) {
                            const c = text.charCodeAt(i);

                            if (c < 48 || c > 57) break;
                            i++;
                        }

                        const value = parseIntRange(text, start, i);

                        if (current < 0) current = value;
                        else if (value > 0) appendConect(current, value);
                    } else {
                        i++;
                    }
                }
            } else if (text.startsWith("MODEL ", lineStart)) {
                modelCount++;
            }
        }

        lineStart = lineEnd + 1;
    }

    // ---- 二级结构：把 HELIX/SHEET 区间落到残基字典 ----
    if (ssRanges.length > 0 && builder.count > 0) {
        const firstAtom = new Int32Array(builder.residues.length).fill(-1);

        for (let i = 0; i < builder.count; i++) {
            const r = builder.residueIndex[i]!;

            if (firstAtom[r]! < 0) firstAtom[r] = i;
        }

        builder.ss = new Uint8Array(builder.residues.length);

        for (let r = 0; r < firstAtom.length; r++) {
            const i = firstAtom[r]!;
            if (i < 0) continue;

            const chain = builder.chains[builder.chainIndex[i]!]!;
            const seq = builder.residueSeq[i]!;

            for (const range of ssRanges) {
                if (range.chain === chain && seq >= range.start && seq <= range.end) {
                    builder.ss[r] = range.type;
                    break;
                }
            }
        }
    }

    // ---- 序列号 → 原子下标 ----
    let explicit: Uint32Array | undefined;

    if (conectFill > 0 && builder.count > 0) {
        const serialToIndex = new Map<number, number>();

        for (let i = 0; i < builder.count; i++) serialToIndex.set(serials[i]!, i);

        const pairs: number[] = [];

        for (let e = 0; e < conectFill; e += 2) {
            const i = serialToIndex.get(conect[e]!);
            const j = serialToIndex.get(conect[e + 1]!);

            if (i === undefined || j === undefined || i === j) continue;

            pairs.push(i, j);
        }

        explicit = new Uint32Array(pairs);
    }

    // ---- 键感知 ----
    const bondStartedAt = performance.now();
    const count = builder.count;
    const radii = new Float32Array(count);
    const valence = new Uint8Array(count);

    for (let i = 0; i < count; i++) {
        const symbol = builder.elements[builder.elementIndex[i]!]!;

        radii[i] = covalentRadiusOf(symbol);
        valence[i] = maxValenceOf(symbol);
    }

    let bonds: Uint32Array<ArrayBufferLike> = new Uint32Array(0);
    let bondCount = 0;

    if (options.perceiveBonds !== false) {
        const result = perceiveBondsSoA({
            positions: builder.positions.subarray(0, count * 3),
            count,
            radii,
            valence,
            explicit,
            tolerance: options.tolerance,
            maxBondLength: options.maxBondLength
        });

        bonds = result.bonds;
        bondCount = result.bondCount;
    } else if (explicit) {
        // 关闭几何感知时，文件里的显式键仍然要保留
        bonds = explicit;
        bondCount = explicit.length / 2;
    }

    const bondMs = performance.now() - bondStartedAt;

    return builder.finish(
        options.name ?? nameFromFilename(filename),
        "pdb",
        bonds,
        bondCount,
        performance.now() - startedAt - bondMs,
        bondMs,
        {bondsInferred: options.perceiveBonds !== false}
    );
}




