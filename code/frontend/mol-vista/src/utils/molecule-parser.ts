// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file molecule-parser.ts
 * @author edocsitahw
 * @version 1.3
 * @date 2026/10/29
 * @desc 分子文件解析入口：统一输出 MDR（StructureData）。
 *       - PDB / mmCIF / SDF / MOL：走 `@wmv/parser`（Worker 内解析 + 键感知）；
 *       - SMILES / MOL2 / XYZ：仍走 RDKit WASM，结果对象化为 MDR（这类分子很小）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { parseWithRDKit } from '@/composables/useRDKit';
import { normalizeBonds, perceiveBonds } from '@/utils/bond-perception';
import { buildStructureData, type InputAtom } from '@/utils/structure-build';
import { parseStructureAsync } from '@/utils/structure-parse-client';
import type { StructureData, StructureFormat } from '@wmv/structure';

/** 支持的分子文件格式 */
export type MoleculeFormat = 'smiles' | 'mol' | 'sdf' | 'pdb' | 'cif' | 'xyz' | 'mol2' | 'auto';

/** 解析结果：名称 + MDR */
export interface ParseResult {
    name: string;
    structure: StructureData;
}

/**
 * 根据文件名推断分子格式。
 */
export function detectFormat(filename: string): MoleculeFormat {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';

    switch (ext) {
        case 'smi':
        case 'smiles':
            return 'smiles';
        case 'mol':
            return 'mol';
        case 'sdf':
            return 'sdf';
        case 'pdb':
        case 'ent':
            return 'pdb';
        case 'cif':
        case 'mmcif':
            return 'cif';
        case 'xyz':
            return 'xyz';
        case 'mol2':
            return 'mol2';
        default:
            return 'auto';
    }
}

/**
 * 根据文本内容启发式判断格式（当扩展名无法识别时使用）。
 */
export function detectFormatFromContent(text: string): MoleculeFormat {
    const head = text.slice(0, 8192).trim();

    if (/^\s*(data_|loop_|_atom_site\.)/m.test(head)) return 'cif';
    if (/^(HEADER|CRYST1|ATOM  |HETATM|MODEL |CONECT)\b/m.test(head)) return 'pdb';
    if (/\$\$\$\$/.test(text) || /V[23]000/.test(text)) return 'sdf';

    const firstLine = head.split('\n')[0]?.trim();
    if (/^\d+$/.test(firstLine ?? '')) return 'xyz';

    return 'smiles';
}

/** app 的格式名 → MDR 格式名 */
function toStructureFormat(format: MoleculeFormat): StructureFormat {
    switch (format) {
        case 'pdb':
        case 'cif':
        case 'sdf':
        case 'mol':
        case 'xyz':
        case 'mol2':
            return format;
        default:
            return 'unknown';
    }
}

/**
 * 从文件文本解析分子结构。
 */
export async function parseMoleculeText(
    text: string,
    filename: string,
    format: MoleculeFormat = 'auto'
): Promise<ParseResult> {
    const fmt = format === 'auto'
        ? (detectFormat(filename) === 'auto' ? detectFormatFromContent(text) : detectFormat(filename))
        : format;

    // ---- 结构格式：Worker → MDR ----
    if (fmt === 'pdb' || fmt === 'cif' || fmt === 'sdf' || fmt === 'mol') {
        const structure = await parseStructureAsync(text, filename);

        return {name: structure.meta.name, structure};
    }

    // ---- 其余格式：RDKit ----
    const result = await parseWithRDKit(text, fmt);

    if (!result) throw new Error(`Failed to parse molecule (format: ${fmt})`);

    const inputAtoms: InputAtom[] = result.atoms.map((a) => ({
        symbol: a.symbol,
        position: a.position,
        charge: a.charge,
    }));

    const perceived = result.bonds.length > 0
        ? normalizeBonds(result.bonds, inputAtoms.length)
        : normalizeBonds(perceiveBonds(inputAtoms), inputAtoms.length);

    const name = filename.replace(/\.[^.]+$/, '') || 'molecule';
    const structure = buildStructureData(name, inputAtoms, perceived, toStructureFormat(fmt));

    return {name, structure};
}

/**
 * 从 File 对象解析分子结构。
 *
 * PDB/CIF/SDF 直接传 ArrayBuffer 给 Worker（转移所有权，主线程不做 TextDecoder）。
 */
export async function parseMoleculeFile(file: File): Promise<ParseResult> {
    const format = detectFormat(file.name);

    if (format === 'pdb' || format === 'cif' || format === 'sdf' || format === 'mol') {
        const structure = await parseStructureAsync(await file.arrayBuffer(), file.name);

        return {name: structure.meta.name, structure};
    }

    const text = await file.text();

    return parseMoleculeText(text, file.name, format);
}

/**
 * 从 SMILES 字符串解析分子结构（便捷方法）。
 */
export async function parseSmiles(smiles: string, name = 'molecule'): Promise<ParseResult> {
    return parseMoleculeText(smiles, `${name}.smi`, 'smiles');
}
