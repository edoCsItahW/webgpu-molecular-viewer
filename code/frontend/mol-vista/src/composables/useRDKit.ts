// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file useRDKit.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/28 16:30
 * @desc RDKit WASM 模块懒加载 composable。
 *       使用单例模式确保全局只加载一次 RDKit_minimal.wasm（~10MB）。
 *       WASM 文件已复制到 public/RDKit_minimal.wasm，通过 locateFile 指向静态路径。
 *       解析完成后调用方负责 Mol.delete() 释放 WASM 内存。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { ref, type Ref } from 'vue';
import initRDKit, { type MainModule, type Mol } from '@rdkit/rdkit';

/** RDKit 模块单例（模块级变量，跨 composable 调用共享） */
let rdkitInstance: MainModule | null = null;
let loadingPromise: Promise<MainModule> | null = null;

/**
 * 加载 RDKit WASM 模块（单例）。
 * 首次调用时加载，后续调用直接返回已加载的实例。
 */
export async function loadRDKit(): Promise<MainModule> {
    if (rdkitInstance) return rdkitInstance;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        const mod = await initRDKit({
            locateFile: (path: string) => {
                // WASM 文件托管在 public/ 根目录
                if (path.endsWith('.wasm')) return `${import.meta.env.BASE_URL}RDKit_minimal.wasm`;
                return path;
            },
        });
        rdkitInstance = mod;
        return mod;
    })();

    try {
        return await loadingPromise;
    } finally {
        loadingPromise = null;
    }
}

/** RDKit 解析结果 */
export interface RDKitParseResult {
    atoms: Array<{
        symbol: string;
        position: [number, number, number];
        charge?: number;
    }>;
    bonds: Array<[number, number]>;
}

/**
 * 使用 RDKit 解析分子文本。
 *
 * @param text 分子文本（SMILES / MOL block / SDF / PDB 等）
 * @param format RDKit 解析参数 JSON 字符串，如 `'{"format": "smiles"}'`
 * @returns 解析出的原子与键，解析失败返回 null
 */
export async function parseWithRDKit(
    text: string,
    format?: string
): Promise<RDKitParseResult | null> {
    const rdkit = await loadRDKit();

    const details = format ? JSON.stringify({ format }) : undefined;
    const mol: Mol | null = rdkit.get_mol(text, details ?? '');
    if (!mol || !mol.is_valid()) {
        mol?.delete();
        return null;
    }

    // 如果没有 3D 坐标，让 RDKit 生成坐标
    if (!mol.has_coords()) {
        mol.set_new_coords(true);
    }

    // 通过 JSON 获取原子与键数据
    const jsonStr = mol.get_json();
    mol.delete();

    const data = JSON.parse(jsonStr) as RDKitMolJSON;

    const mol0 = data.molecules?.[0];
    if (!mol0) return null;
    const atomDefaults = data.defaults?.atom ?? {};

    // 获取坐标（取第一个构象）
    const conformer = mol0.conformers?.[0];
    const coords = conformer?.coords ?? [];
    const dim = conformer?.dim ?? 3;

    const atoms = mol0.atoms.map((a, i) => {
        const z = a.z ?? atomDefaults.z ?? 6;
        const symbol = atomNumberToSymbol(z) ?? a.name ?? 'X';
        const charge = a.chg ?? atomDefaults.chg ?? 0;

        const coord = coords[i] ?? [0, 0, 0];
        const position: [number, number, number] = dim >= 3
            ? [coord[0] ?? 0, coord[1] ?? 0, coord[2] ?? 0]
            : [coord[0] ?? 0, coord[1] ?? 0, 0];

        return { symbol, position, charge };
    });

    const bonds = mol0.bonds.map((b) => {
        const [i, j] = b.atoms;
        return [i, j] as [number, number];
    });

    return { atoms, bonds };
}

/** RDKit JSON 输出结构（rdkitjson v2+） */
interface RDKitMolJSON {
    rdkitjson?: { version: number };
    defaults?: {
        atom?: { z?: number; impHs?: number; chg?: number };
        bond?: { bo?: number };
    };
    molecules?: Array<{
        atoms: Array<{
            z?: number;
            name?: string;
            impHs?: number;
            chg?: number;
        }>;
        bonds: Array<{
            atoms: [number, number];
            bo?: number;
        }>;
        conformers?: Array<{
            dim: number;
            coords: number[][];
        }>;
    }>;
}

/** 原子序数 → 元素符号映射（前 118 号） */
const ATOM_NUMBER_TO_SYMBOL: Record<number, string> = {
    1: 'H', 2: 'He', 3: 'Li', 4: 'Be', 5: 'B', 6: 'C', 7: 'N', 8: 'O', 9: 'F', 10: 'Ne',
    11: 'Na', 12: 'Mg', 13: 'Al', 14: 'Si', 15: 'P', 16: 'S', 17: 'Cl', 18: 'Ar', 19: 'K', 20: 'Ca',
    21: 'Sc', 22: 'Ti', 23: 'V', 24: 'Cr', 25: 'Mn', 26: 'Fe', 27: 'Co', 28: 'Ni', 29: 'Cu', 30: 'Zn',
    31: 'Ga', 32: 'Ge', 33: 'As', 34: 'Se', 35: 'Br', 36: 'Kr', 37: 'Rb', 38: 'Sr', 39: 'Y', 40: 'Zr',
    41: 'Nb', 42: 'Mo', 43: 'Tc', 44: 'Ru', 45: 'Rh', 46: 'Pd', 47: 'Ag', 48: 'Cd', 49: 'In', 50: 'Sn',
    51: 'Sb', 52: 'Te', 53: 'I', 54: 'Xe', 55: 'Cs', 56: 'Ba', 57: 'La', 58: 'Ce', 59: 'Pr', 60: 'Nd',
    61: 'Pm', 62: 'Sm', 63: 'Eu', 64: 'Gd', 65: 'Tb', 66: 'Dy', 67: 'Ho', 68: 'Er', 69: 'Tm', 70: 'Yb',
    71: 'Lu', 72: 'Hf', 73: 'Ta', 74: 'W', 75: 'Re', 76: 'Os', 77: 'Ir', 78: 'Pt', 79: 'Au', 80: 'Hg',
    81: 'Tl', 82: 'Pb', 83: 'Bi', 84: 'Po', 85: 'At', 86: 'Rn', 87: 'Fr', 88: 'Ra', 89: 'Ac', 90: 'Th',
    91: 'Pa', 92: 'U', 93: 'Np', 94: 'Pu', 95: 'Am', 96: 'Cm', 97: 'Bk', 98: 'Cf', 99: 'Es', 100: 'Fm',
    101: 'Md', 102: 'No', 103: 'Lr', 104: 'Rf', 105: 'Db', 106: 'Sg', 107: 'Bh', 108: 'Hs', 109: 'Mt',
    110: 'Ds', 111: 'Rg', 112: 'Cn', 113: 'Nh', 114: 'Fl', 115: 'Mc', 116: 'Lv', 117: 'Ts', 118: 'Og',
};

function atomNumberToSymbol(z: number): string | undefined {
    return ATOM_NUMBER_TO_SYMBOL[z];
}

/**
 * RDKit composable。提供加载状态与模块访问。
 * 在组件中按需调用 loadRDKit()，避免页面加载时即下载 WASM。
 */
export function useRDKit() {
    const loading = ref(false);
    const ready = ref(false);
    const error = ref<string | null>(null);
    const module: Ref<MainModule | null> = ref(null);

    async function ensure(): Promise<MainModule | null> {
        if (module.value) return module.value;
        loading.value = true;
        error.value = null;
        try {
            const mod = await loadRDKit();
            module.value = mod;
            ready.value = true;
            return mod;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
            return null;
        } finally {
            loading.value = false;
        }
    }

    return { loading, ready, error, module, ensure };
}
