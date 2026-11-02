// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file cif.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc mmCIF 解析器（只关心 `_atom_site` 与首个 model）。
 *
 *       为什么与 PDB 分开：
 *         PDB 是固定列，CIF 是 token/loop 结构（还有引号、分号文本块、`?`/`.` 缺失值）。
 *         共用一个 parser 只会互相拖累；两者共享 SoA 构建器与键感知。
 *
 *       取舍：
 *         - 不做通用 CIF 数据模型（不建字典树），只顺序扫描 loop；
 *         - `_struct_conn` 不解析，键统一走几何感知（CIF 的聚合物键同样不全）；
 *         - 只取第一个 `pdbx_PDB_model_num`。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { StructureBuilder } from "./builder.js";
import { perceiveBondsSoA } from "./bonds.js";
import { covalentRadiusOf, maxValenceOf, normalizeElementSymbol } from "./elements.js";
import { nameFromFilename, type ParseOptions, type ParsedStructure } from "./types.js";


/** 水残基名（MDR Water 位） */
const WATER_RESIDUES = new Set(["HOH", "WAT", "H2O", "DOD", "SOL"]);

/** 主链原子名（MDR Backbone 位） */
const FLAG_CA = 1 << 5;

const BACKBONE_ATOMS = new Set([
    "N", "CA", "C", "O", "OXT",
    "P", "O5'", "C5'", "C4'", "C3'", "O3'"
]);


/** 轻量 CIF 词法扫描器：按需取 token，不预先切分整个文件 */
class CifScanner {
    #index = 0;
    #peeked: string | null = null;
    #hasPeek = false;

    constructor(private readonly text: string) {
    }

    peek(): string | null {
        if (!this.#hasPeek) {
            this.#peeked = this.#read();
            this.#hasPeek = true;
        }

        return this.#peeked;
    }

    next(): string | null {
        if (this.#hasPeek) {
            this.#hasPeek = false;

            return this.#peeked;
        }

        return this.#read();
    }

    #read(): string | null {
        const text = this.text;
        const length = text.length;

        // 跳过空白与注释
        for (;;) {
            while (this.#index < length && text.charCodeAt(this.#index) <= 32) this.#index++;

            if (this.#index < length && text.charCodeAt(this.#index) === 35) {
                while (this.#index < length && text.charCodeAt(this.#index) !== 10) this.#index++;
                continue;
            }

            break;
        }

        if (this.#index >= length) return null;

        const start = this.#index;
        const code = text.charCodeAt(start);

        // 分号文本块：分号必须在行首
        if (code === 59 && (start === 0 || text.charCodeAt(start - 1) === 10)) {
            let lineEnd = text.indexOf("\n", start + 1);

            if (lineEnd < 0) lineEnd = length;

            const contentStart = Math.min(start + 1, lineEnd);
            const content: string[] = [];
            let cursor = lineEnd + 1;

            for (;;) {
                let nextEnd = text.indexOf("\n", cursor);

                if (nextEnd < 0) nextEnd = length;

                if (nextEnd < length && text.charCodeAt(cursor) === 59) {
                    this.#index = nextEnd + 1;

                    return content.join("\n");
                }

                content.push(text.slice(cursor, nextEnd));
                cursor = nextEnd + 1;

                if (cursor >= length) {
                    this.#index = length;

                    return content.join("\n");
                }
            }
        }

        if (code === 34 || code === 39) {
            const quote = code;

            this.#index++;

            const valueStart = this.#index;

            while (this.#index < length && text.charCodeAt(this.#index) !== quote) this.#index++;

            const value = text.slice(valueStart, this.#index);

            if (this.#index < length) this.#index++;

            return value;
        }

        while (this.#index < length) {
            const c = text.charCodeAt(this.#index);

            if (c <= 32 || c === 35) break;

            this.#index++;
        }

        return text.slice(start, this.#index);
    }
}


/** 缺省值判断（CIF 的 `.` / `?`） */
function isMissing(value: string | undefined): boolean {
    return value === undefined || value === "." || value === "?";
}

function toFloat(value: string | undefined, fallback: number): number {
    if (isMissing(value)) return fallback;

    const n = Number(value);

    return Number.isFinite(n) ? n : fallback;
}

function toInt(value: string | undefined, fallback: number): number {
    if (isMissing(value)) return fallback;

    const n = Number.parseInt(value!, 10);

    return Number.isFinite(n) ? n : fallback;
}


/**
 * 解析 mmCIF 文本。
 */
export function parseCif(text: string, filename = "", options: ParseOptions = {}): ParsedStructure {
    const startedAt = performance.now();
    const builder = new StructureBuilder(Math.max(1024, Math.min(400_000, Math.floor(text.length / 160))));
    const scanner = new CifScanner(text);

    let firstModel = Number.NaN;

    for (;;) {
        const token = scanner.next();

        if (token === null) break;
        if (!token.startsWith("loop_")) continue;

        // ---- 收集列名 ----
        const tags: string[] = [];

        for (;;) {
            const peek = scanner.peek();

            if (peek === null || !peek.startsWith("_")) break;

            tags.push(scanner.next()!);
        }

        if (tags.length === 0) continue;

        const column = (suffix: string): number => {
            for (let i = 0; i < tags.length; i++) {
                const tag = tags[i]!;

                if (tag === suffix || tag.endsWith(`.${suffix}`)) return i;
            }

            return -1;
        };

        const isAtomSite = tags.some(tag => tag.startsWith("_atom_site."));

        const xCol = column("Cartn_x");
        const yCol = column("Cartn_y");
        const zCol = column("Cartn_z");

        if (!isAtomSite || xCol < 0 || yCol < 0 || zCol < 0) {
            // 非原子 loop：消费掉所有值，直到下一个控制 token
            while (scanner.peek() !== null) {
                const peek = scanner.peek()!;

                if (peek.startsWith("_") || peek === "loop_" || peek.startsWith("data_")
                    || peek.startsWith("save_") || peek === "stop_") break;

                scanner.next();
            }

            continue;
        }

        const symbolCol = column("type_symbol");
        const atomNameCol = column("label_atom_id") >= 0
            ? column("label_atom_id")
            : column("auth_atom_id");

        const compCol = column("auth_comp_id") >= 0
            ? column("auth_comp_id")
            : column("label_comp_id");

        const asymCol = column("auth_asym_id") >= 0
            ? column("auth_asym_id")
            : column("label_asym_id");

        const occCol = column("occupancy");
        const bCol = column("B_iso_or_equiv");
        const altCol = column("label_alt_id");
        const modelCol = column("pdbx_PDB_model_num");
        const groupCol = column("group_PDB");
        const seqCol = column("auth_seq_id") >= 0
            ? column("auth_seq_id")
            : column("label_seq_id");

        const row = new Array<string>(tags.length);

        for (;;) {
            const peek = scanner.peek();

            if (peek === null) break;
            if (peek.startsWith("_") || peek === "loop_" || peek.startsWith("data_")
                || peek.startsWith("save_") || peek === "stop_") break;

            // 读一行（列数不足说明 loop 提前结束）
            let complete = true;

            for (let c = 0; c < tags.length; c++) {
                const value = scanner.next();

                if (value === null) {
                    complete = false;
                    break;
                }

                row[c] = value;
            }

            if (!complete) break;

            // ---- model 过滤 ----
            if (modelCol >= 0) {
                const model = toInt(row[modelCol], 1);

                if (Number.isNaN(firstModel)) firstModel = model;
                else if (model !== firstModel) continue;
            }

            // ---- altLoc 过滤 ----
            if (altCol >= 0) {
                const alt = row[altCol];

                if (!isMissing(alt) && alt !== "A") continue;
            }

            const symbol = symbolCol >= 0 && !isMissing(row[symbolCol])
                ? normalizeElementSymbol(row[symbolCol]!)
                : normalizeElementSymbol((row[atomNameCol] ?? "X").replace(/[^A-Za-z]/g, "").slice(0, 2) || "X");

            const residue = compCol >= 0 && !isMissing(row[compCol]) ? row[compCol]! : "UNK";
            const chain = asymCol >= 0 && !isMissing(row[asymCol]) ? row[asymCol]! : "";
            const atomName = atomNameCol >= 0 ? (row[atomNameCol] ?? "") : "";
            const isHetero = groupCol >= 0 && row[groupCol] === "HETATM";

            let flags = 1 << 3;
            if (isHetero) flags |= 1 << 0;
            if (isHetero && WATER_RESIDUES.has(residue)) flags |= 1 << 1;
            if (symbol === "H" || symbol === "D") flags |= 1 << 2;
            if (BACKBONE_ATOMS.has(atomName)) flags |= 1 << 4;
            if (atomName === "CA") flags |= FLAG_CA;

            builder.push(
                toFloat(row[xCol], 0),
                toFloat(row[yCol], 0),
                toFloat(row[zCol], 0),
                symbol,
                residue,
                chain,
                bCol >= 0 ? toFloat(row[bCol], 0) : 0,
                occCol >= 0 ? toFloat(row[occCol], 1) : 1,
                {
                    flags,
                    residueSeq: seqCol >= 0 ? toInt(row[seqCol], 0) : 0,
                    residueIcode: "",
                }
            );
        }
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
            tolerance: options.tolerance,
            maxBondLength: options.maxBondLength
        });

        bonds = result.bonds;
        bondCount = result.bondCount;
    }

    const bondMs = performance.now() - bondStartedAt;

    return builder.finish(
        options.name ?? nameFromFilename(filename),
        "cif",
        bonds,
        bondCount,
        performance.now() - startedAt - bondMs,
        bondMs
    );
}



