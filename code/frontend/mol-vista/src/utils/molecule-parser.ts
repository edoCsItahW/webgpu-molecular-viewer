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
import { normalizeBonds, perceiveBonds } from '@/utils/bond-perception';
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

        const atoms: AtomData[] = pdbResult.atoms.map((a, i) => ({
            id: i,
            symbol: a.symbol,
            position: a.position,
            color: getElementColor(a.symbol),
            radius: getElementRadius(a.symbol),
            residue: a.residue,
            chain: a.chain,
            bfactor: a.bfactor,
            occupancy: a.occupancy,
        }));

        // ---- CONECT 的序列号 → 数组下标 ----
        // CONECT 里的数字是 PDB 的原子序列号（第 7-11 列），不是数组下标；序列号本身可能有空洞
        // （实测 3ERT 是 1..2071 但只有 2070 个原子、1AKI 是 1..1080 只有 1079 个），
        // 而 atoms 数组来自 Biopython 的遍历顺序（还折叠了未选中的 altLoc）→ 直接 `serial - 1`
        // 当下标必然错位，表现就是"键接在空间上毫不相干的原子上"（issues.md #38）。
        const serialToIndex = new Map<number, number>();

        pdbResult.atoms.forEach((a, i) => serialToIndex.set(a.serial, i));

        const explicit: Array<[number, number]> = [];
        let unmapped = 0;

        for (const [serialA, serialB] of pdbResult.conect) {
            const i = serialToIndex.get(serialA);
            const j = serialToIndex.get(serialB);

            if (i === undefined || j === undefined || i === j) {
                unmapped++;
                continue;
            }

            explicit.push([i, j]);
        }

        if (unmapped > 0)
            console.warn(`MsgId: ${unmapped} 条 CONECT 端点无法映射到已解析的原子（序列号缺失或 altLoc 被折叠），已忽略`);

        // ---- 其余键按几何推断 ----
        // PDB **不存**聚合物连通性：规范只要求给 HETATM/配体/二硫键写 CONECT
        // （实测 1UBQ 660 个原子 0 条 CONECT、1CRN 327 个原子只有 6 条 = 3 对二硫键）。
        // 只读 CONECT 的话蛋白质绝大部分原子都是孤岛 —— 所以必须做共价半径的键感知。
        const bonds = normalizeBonds(perceiveBonds(atoms, { explicit }), atoms.length);
        const name = filename.replace(/\.[^.]+$/, '') || 'molecule';

        return { name, atoms, bonds };
    }

    // RDKit 的 format 参数
    const rdkitFormat = fmt === 'mol' || fmt === 'sdf' ? 'mol' : fmt;

    result = await parseWithRDKit(text, rdkitFormat);
    if (!result) {
        throw new Error(`Failed to parse molecule (format: ${fmt})`);
    }

    const atoms = toAtomData(result);

    // RDKit 对"文件里没有键信息"的格式（如 XYZ）会返回空键表；这时同样按几何推断，
    // 否则渲染出来就是一堆孤立的球。SDF/MOL 有 bond block，走显式键，不受影响。
    const bonds = result.bonds.length > 0
        ? normalizeBonds(result.bonds, atoms.length)
        : normalizeBonds(perceiveBonds(atoms), atoms.length);

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
