// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file molecule-parser.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/28 16:45
 * @desc 分子文件解析工具。
 *       支持 SMILES / MOL / SDF / PDB 等 RDKit 可识别的格式。
 *       通过文件扩展名或内容启发式判断格式，调用 RDKit WASM 解析，
 *       输出统一的 AtomData[] 与 bonds 供 store / 引擎使用。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { parseWithRDKit, type RDKitParseResult } from '@/composables/useRDKit';
import { parsePDBWithPyodide } from '@/composables/usePyodide';
import { getElementColor, getElementRadius } from '@/data/demo-molecule';
import type { AtomData } from '@/stores/molecule.store';

/** 支持的分子文件格式 */
export type MoleculeFormat = 'smiles' | 'mol' | 'sdf' | 'pdb' | 'xyz' | 'mol2' | 'auto';

/** 解析结果 */
export interface ParseResult {
    name: string;
    atoms: AtomData[];
    bonds: Array<[number, number]>;
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
            return 'pdb';
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
    const trimmed = text.trim();
    // PDB 文件以 HEADER / CRYST1 / ATOM 等记录开头
    if (/^(HEADER|CRYST1|ATOM|HETATM|MODEL)\b/m.test(trimmed)) return 'pdb';
    // SDF 文件以 $$$$ 结尾，或包含 V2000 / V3000 molblock
    if (/\$\$\$\$/.test(trimmed) || /V[23]000/.test(trimmed)) return 'sdf';
    // MOL block 包含 V2000 或 V3000
    if (/V[23]000/.test(trimmed)) return 'mol';
    // XYZ 格式：第一行是数字，第二行是注释，之后是元素+坐标
    const firstLine = trimmed.split('\n')[0]?.trim();
    if (/^\d+$/.test(firstLine ?? '')) return 'xyz';
    // 否则按 SMILES 尝试（单行无空格的字母数字串）
    return 'smiles';
}

/**
 * 将 RDKit 解析结果转换为统一的 AtomData[]。
 */
function toAtomData(result: RDKitParseResult): AtomData[] {
    return result.atoms.map((a, i) => ({
        id: i,
        symbol: a.symbol,
        position: a.position,
        color: getElementColor(a.symbol),
        radius: getElementRadius(a.symbol),
        charge: a.charge,
    }));
}

/**
 * 从文件文本解析分子结构。
 *
 * @param text 文件文本内容
 * @param filename 文件名（用于格式推断）
 * @param format 显式指定格式（可选，默认 auto）
 * @returns 解析结果；解析失败抛出 Error
 */
export async function parseMoleculeText(
    text: string,
    filename: string,
    format: MoleculeFormat = 'auto'
): Promise<ParseResult> {
    const fmt = format === 'auto'
        ? (detectFormat(filename) === 'auto' ? detectFormatFromContent(text) : detectFormat(filename))
        : format;

    let result: RDKitParseResult | null;

    if (fmt === 'pdb') {
        // RDKit MinimalLib 不支持 PDB，使用 Pyodide + Biopython 解析
        const pdbResult = await parsePDBWithPyodide(text);
        if (!pdbResult) {
            throw new Error(`Failed to parse PDB molecule`);
        }
        const atoms = pdbResult.atoms.map((a, i) => ({
            id: i,
            symbol: a.symbol,
            position: a.position,
            color: getElementColor(a.symbol),
            radius: getElementRadius(a.symbol),
        }));
        const name = filename.replace(/\.[^.]+$/, '') || 'molecule';
        return { name, atoms, bonds: pdbResult.bonds };
    }

    // RDKit 的 format 参数
    const rdkitFormat = fmt === 'mol' || fmt === 'sdf' ? 'mol' : fmt;

    result = await parseWithRDKit(text, rdkitFormat);
    if (!result) {
        throw new Error(`Failed to parse molecule (format: ${fmt})`);
    }

    const atoms = toAtomData(result);
    const bonds = result.bonds;

    // 从文件名提取名称（去扩展名）
    const name = filename.replace(/\.[^.]+$/, '') || 'molecule';

    return { name, atoms, bonds };
}

/**
 * 从 File 对象解析分子结构。
 * 自动读取文本内容并推断格式。
 */
export async function parseMoleculeFile(file: File): Promise<ParseResult> {
    const text = await file.text();
    return parseMoleculeText(text, file.name);
}

/**
 * 从 SMILES 字符串解析分子结构（便捷方法）。
 */
export async function parseSmiles(smiles: string, name = 'molecule'): Promise<ParseResult> {
    return parseMoleculeText(smiles, `${name}.smi`, 'smiles');
}
