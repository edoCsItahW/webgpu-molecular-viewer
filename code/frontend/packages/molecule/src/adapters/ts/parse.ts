// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file parse.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc TS 解析器：PDB 与 SDF（V2000）行式/块式状态机 → ParserResult（Atom/Bond/Residue/Chain）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import {Atom} from "../../model/Atom";
import {Bond} from "../../model/Bond";
import {Residue} from "../../model/Residue";
import {Chain} from "../../model/Chain";
import type {ParserResult} from "../../model/Molecule";
import {symbolToZ, elementByZ} from "@wmv/structure";

/** 格式嗅探结果。 */
export type SniffedFormat = "pdb" | "sdf" | "unknown";

/**
 * 格式嗅探（只读前若干行，不解析完整文件）。
 * - PDB：首行是 HEADER / TITLE / CRYST1 / ATOM / HETATM / MODEL 等记录名（1-6 列）。
 * - SDF：第 4 行是 counts 行（前 3 字符为整数原子数），且文件以 $$$$ 结束。
 */
export function sniff(text: string): SniffedFormat {
    const head = text.slice(0, 4096);
    const lines = head.split(/\r?\n/);

    // PDB：前几行中出现已知记录名
    const pdbRecords = new Set([
        "HEADER", "TITLE", "CRYST1", "ATOM", "HETATM", "TER",
        "MODEL", "ENDMDL", "CONECT", "HELIX", "SHEET", "END",
        "REMARK", "SOURCE", "KEYWDS", "EXPDTA", "AUTHOR", "REVDAT",
    ]);
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
        const rec = lines[i].slice(0, 6).trim();
        if (pdbRecords.has(rec)) return "pdb";
    }

    // SDF：第 4 行是 counts 行（aaabbblllfff...），前 3 字符为非负整数
    if (lines.length >= 4) {
        const counts = lines[3].trim();
        const m = counts.match(/^(\d+)\s+(\d+)/);
        if (m) {
            const a = Number(m[1]);
            const b = Number(m[2]);
            if (a >= 0 && a < 10_000_000 && b >= 0 && b < 10_000_000)
                return "sdf";
        }
    }

    return "unknown";
}

/** 解析 PDB 文本为 ParserResult。 */
export function parsePDB(text: string): ParserResult {
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    const residues: Residue[] = [];
    const chains: Chain[] = [];

    // 临时字典：chainID → chainIndex
    const chainIdToIndex = new Map<string, number>();
    // 临时字典：(chainIndex, seqNumber, insertionCode, resName) → residueIndex
    const residueKeyToIndex = new Map<string, number>();

    // CONECT 记录收集的键（原子 serial → atomIndex 映射在解析完后做）
    const conectPairs: Array<[number, number]> = [];
    // serial → atomIndex（PDB serial 可能不连续、可能从 1 开始）
    const serialToIndex = new Map<number, number>();

    const lines = text.split(/\r?\n/);

    for (const line of lines) {
        const record = line.slice(0, 6).trim();

        if (record === "ATOM" || record === "HETATM") {
            const serial = parseInt(line.slice(6, 11), 10);
            const name = line.slice(12, 16).trim();
            const altLoc = line.slice(16, 17);
            const resName = line.slice(17, 20).trim();
            const chainID = line.slice(21, 22).trim();
            const resSeq = parseInt(line.slice(22, 26), 10) || 0;
            const iCode = line.slice(26, 27).trim();
            const x = parseFloat(line.slice(30, 38));
            const y = parseFloat(line.slice(38, 46));
            const z = parseFloat(line.slice(46, 54));
            const occupancy = parseFloat(line.slice(54, 60));
            const bFactor = parseFloat(line.slice(60, 66));
            const elementCol = line.slice(76, 78).trim();

            // 元素推断：列 77-78 优先，否则原子名启发式
            let element = elementCol;
            if (!element) element = inferElementFromName(name, resName);

            // 链
            let chainIndex = chainIdToIndex.get(chainID);
            if (chainIndex === undefined) {
                chainIndex = chains.length;
                chainIdToIndex.set(chainID, chainIndex);
                chains.push(new Chain({ index: chainIndex, id: chainID }));
            }

            // 残基
            const resKey = `${chainIndex}|${resSeq}|${iCode}|${resName}`;
            let residueIndex = residueKeyToIndex.get(resKey);
            if (residueIndex === undefined) {
                residueIndex = residues.length;
                residueKeyToIndex.set(resKey, residueIndex);
                residues.push(new Residue({
                    index: residueIndex,
                    name: resName,
                    seqNumber: resSeq,
                    insertionCode: iCode,
                    chainIndex,
                    isHetero: record === "HETATM",
                }));
            }

            const atomIndex = atoms.length;
            if (Number.isFinite(serial)) serialToIndex.set(serial, atomIndex);

            const zNum = symbolToZ(element);
            const elemSymbol = zNum > 0 ? elementByZ(zNum).symbol : element;

            atoms.push(new Atom({
                index: atomIndex,
                element: elemSymbol,
                name: name || elemSymbol,
                x: Number.isFinite(x) ? x : 0,
                y: Number.isFinite(y) ? y : 0,
                z: Number.isFinite(z) ? z : 0,
                charge: 0,
                residueIndex,
                chainIndex,
                occupancy: Number.isFinite(occupancy) ? occupancy : 1,
                bFactor: Number.isFinite(bFactor) ? bFactor : 0,
            }));

            // 把原子追加到残基的 atomIndices
            residues[residueIndex] = residues[residueIndex].withAtom(atomIndex);

            // altLoc 仅保留第一个（简化：不做多构象）
            void altLoc;
        } else if (record === "CONECT") {
            // CONECT a1 a2 a3 a4 ...
            const a1 = parseInt(line.slice(6, 11), 10);
            if (!Number.isFinite(a1)) continue;
            const partners: number[] = [];
            for (let c = 11; c + 5 <= line.length; c += 5) {
                const p = parseInt(line.slice(c, c + 5), 10);
                if (Number.isFinite(p)) partners.push(p);
            }
            for (const p of partners) conectPairs.push([a1, p]);
        }
    }

    // 把残基分配到链（CSR 风格：链.residueIndices）
    for (let ri = 0; ri < residues.length; ri++) {
        const r = residues[ri];
        const ci = r.chainIndex;
        if (ci >= 0 && ci < chains.length)
            chains[ci] = chains[ci].withResidue(ri);
    }

    // 构建键（CONECT 的 serial → atomIndex）
    const seen = new Set<string>();
    for (const [sa, sb] of conectPairs) {
        const ia = serialToIndex.get(sa);
        const ib = serialToIndex.get(sb);
        if (ia === undefined || ib === undefined) continue;
        if (ia === ib) continue;
        const key = ia < ib ? `${ia}-${ib}` : `${ib}-${ia}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bonds.push(new Bond({
            index: bonds.length,
            atomA: Math.min(ia, ib),
            atomB: Math.max(ia, ib),
            order: 1,
        }));
    }

    return { atoms, bonds, residues, chains };
}

/** 解析 SDF（V2000）文本为 ParserResult。仅取第一个分子。 */
export function parseSDF(text: string): ParserResult {
    const atoms: Atom[] = [];
    const bonds: Bond[] = [];
    const residues: Residue[] = [];
    const chains: Chain[] = [];

    const lines = text.split(/\r?\n/);

    // 第 4 行：counts 行 "aaabbblllfffcccsssxxxrrrpppiiimmmvvvvvv"
    if (lines.length < 4)
        return { atoms, bonds, residues, chains };

    const counts = lines[3];
    const atomCount = parseInt(counts.slice(0, 3), 10) || 0;
    const bondCount = parseInt(counts.slice(3, 6), 10) || 0;

    // 原子块：从第 5 行开始
    let idx = 4;
    for (let i = 0; i < atomCount && idx < lines.length; i++, idx++) {
        const line = lines[idx];
        const x = parseFloat(line.slice(0, 10));
        const y = parseFloat(line.slice(10, 20));
        const z = parseFloat(line.slice(20, 30));
        const symbol = line.slice(31, 34).trim();
        const zNum = symbolToZ(symbol);
        const elemSymbol = zNum > 0 ? elementByZ(zNum).symbol : symbol;

        atoms.push(new Atom({
            index: i,
            element: elemSymbol,
            name: elemSymbol,
            x: Number.isFinite(x) ? x : 0,
            y: Number.isFinite(y) ? y : 0,
            z: Number.isFinite(z) ? z : 0,
            charge: 0,
            residueIndex: -1,
            chainIndex: -1,
            occupancy: 1,
            bFactor: 0,
        }));
    }

    // 键块
    const bondOrders: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 1.5 };
    for (let i = 0; i < bondCount && idx < lines.length; i++, idx++) {
        const line = lines[idx];
        const a = parseInt(line.slice(0, 3), 10) - 1; // SDF 是 1-based
        const b = parseInt(line.slice(3, 6), 10) - 1;
        const type = parseInt(line.slice(6, 9), 10);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (a < 0 || b < 0 || a >= atomCount || b >= atomCount) continue;
        if (a === b) continue;
        bonds.push(new Bond({
            index: bonds.length,
            atomA: Math.min(a, b),
            atomB: Math.max(a, b),
            order: bondOrders[type] ?? 1,
        }));
    }

    // 属性块：M  CHG
    for (; idx < lines.length; idx++) {
        const line = lines[idx];
        if (line.startsWith("$$$$")) break;
        if (line.startsWith("M  CHG")) {
            // M  CHG  n  atom1  charge1  atom2  charge2 ...
            const parts = line.trim().split(/\s+/);
            const n = parseInt(parts[2], 10) || 0;
            for (let k = 0; k < n; k++) {
                const atomIdx = parseInt(parts[3 + k * 2], 10) - 1;
                const charge = parseInt(parts[4 + k * 2], 10);
                if (atomIdx >= 0 && atomIdx < atoms.length && Number.isFinite(charge))
                    atoms[atomIdx] = atoms[atomIdx].with({ charge });
            }
        }
    }

    return { atoms, bonds, residues, chains };
}

/**
 * 从原子名推断元素（PDB element 列缺失时的启发式）。
 * 先按两字母元素表匹配，再取首个字母；用 resName 校正水。
 */
function inferElementFromName(name: string, resName: string): string {
    if (resName === "HOH" || resName === "WAT" || resName === "DOD") {
        // 水：O 或 H
        if (name.startsWith("O")) return "O";
        if (name.startsWith("H") || name.startsWith("D")) return "H";
        return "O";
    }

    const twoLetter = name.slice(0, 2).toUpperCase();
    const twoLetterElements = new Set([
        "CL", "NA", "MG", "FE", "ZN", "CA", "MN", "CU", "BR",
        "CO", "NI", "SE", "MO", "SN", "AU", "HG", "PB", "CR",
    ]);
    if (twoLetterElements.has(twoLetter) && symbolToZ(twoLetter) > 0)
        return twoLetter;

    return name.slice(0, 1).toUpperCase();
}
