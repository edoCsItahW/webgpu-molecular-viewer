// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 结构解析包入口：PDB / mmCIF → SoA。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { parseCif } from "./cif.js";
import { parsePdb } from "./pdb.js";
import { parseSdf } from "./sdf.js";
import { toStructureData } from "./mdr.js";
import { detectStructureFormat, type ParseOptions, type ParsedStructure } from "./types.js";
import type { StructureData } from "@wmv/structure";

export { parsePdb } from "./pdb.js";
export { parseCif } from "./cif.js";
export { parseSdf } from "./sdf.js";
export { toStructureData } from "./mdr.js";
export type { StructureData } from "@wmv/structure";
export { detectStructureFormat, nameFromFilename } from "./types.js";
export type { ParseOptions, ParsedStructure, StructureFormat } from "./types.js";
export { perceiveBondsSoA } from "./bonds.js";
export type { BondPerceptionInput, BondPerceptionResult } from "./bonds.js";
export { covalentRadiusOf, maxValenceOf, normalizeElementSymbol } from "./elements.js";


/**
 * 按格式解析（自动检测）。
 *
 * @param text 文件文本
 * @param filename 文件名（用于格式推断与命名）
 * @param options 解析选项
 */
export function parseStructure(
    text: string,
    filename = "",
    options: ParseOptions = {}
): ParsedStructure {
    const format = detectStructureFormat(filename, text);

    if (format === "pdb") return parsePdb(text, filename, options);
    if (format === "cif") return parseCif(text, filename, options);
    if (format === "sdf") return parseSdf(text, filename, options);

    // 内容分不清时：含 loop_/_atom_site 的按 CIF，含 ATOM 记录的按 PDB
    if (/_atom_site\./.test(text.slice(0, 65536))) return parseCif(text, filename, options);
    if (/^(ATOM  |HETATM)/m.test(text.slice(0, 65536))) return parsePdb(text, filename, options);

    throw new Error("MsgId: 无法识别的结构格式（仅支持 PDB / mmCIF / SDF）");
}

/**
 * 解析并直接产出 MDR（StructureData）。
 *
 * 这是 R2.0 的推荐入口；`parseStructure` 保留为过渡期兼容接口。
 */
export function parseStructureData(
    text: string,
    filename = "",
    options: ParseOptions = {}
): StructureData {
    return toStructureData(parseStructure(text, filename, options));
}

