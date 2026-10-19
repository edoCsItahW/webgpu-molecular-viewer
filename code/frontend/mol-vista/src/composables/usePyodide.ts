// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file usePyodide.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/28 16:21
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {useAsyncState} from "@vueuse/core";
import {onMounted} from "vue";

/** Pyodide 模块单例 */
let pyodideInstance: any | null = null;
let loadingPromise: Promise<any> | null = null;

/**
 * 加载 Pyodide 运行时（单例）。
 * 首次调用时从 CDN 加载 Pyodide 并安装 biopython 包。
 * 用于 RDKit 不支持的格式（如 PDB）的解析。
 */
export async function loadPyodide(): Promise<any> {
    if (pyodideInstance) return pyodideInstance;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        if (!("loadPyodide" in window)) {
            await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js';
                script.onload = () => resolve();
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        if (!("loadPyodide" in window) || typeof (window as any).loadPyodide !== "function") {
            throw new Error("Pyodide failed to load");
        }

        const py = await (window as any).loadPyodide();
        await py.loadPackage(["biopython"]);
        pyodideInstance = py;
        return py;
    })();

    try {
        return await loadingPromise;
    } finally {
        loadingPromise = null;
    }
}

/**
 * 使用 Pyodide + Biopython 解析 PDB 文件。
 *
 * 注意这里是**刻意"笨"的**：Python 侧只负责把文件读成
 *   - 原子（含 PDB 的**序列号 serial**、元素、坐标、残基/链/温度因子）
 *   - CONECT 记录里的**原始序列号对**
 * 而不做任何下标换算或键推断 —— 那样会把两个不同的索引空间混在一起（见下）。
 *
 * 历史坑（导致"孤岛原子 + 极远原子相连"，见 issues.md #38）：
 *   CONECT 里的数字是 PDB 的**原子序列号**（第 7-11 列），不是原子数组下标；
 *   而 atoms 数组来自 Biopython 的遍历顺序（按 chain→residue→atom 重排，且会折叠未选中的 altLoc）。
 *   两者本来就不一致，再加上序列号本身可能有空洞（实测 3ERT 是 1..2071 但只有 2070 个原子），
 *   直接 `serial - 1` 当下标必然错位 → 键被接到空间上毫不相干的原子上。
 *   序列号 → 下标的换算放到 TS 侧，与"键感知"一起做，便于单测。
 *
 * @param pdbText PDB 文件文本内容
 * @returns 原子（含序列号）与 CONECT 原始序列号对；解析失败返回 null
 */
export async function parsePDBWithPyodide(pdbText: string): Promise<PdbParseResult | null> {
    const py = await loadPyodide();

    // 将 PDB 文本传入 Python 全局作用域
    py.globals.set("pdb_text", pdbText);

    await py.runPythonAsync(`
import io
import json
from Bio.PDB import PDBParser

parser = PDBParser(QUIET=True)
structure = parser.get_structure("mol", io.StringIO(pdb_text))

atoms = []
first_model = next(structure.get_models(), None)
if first_model:
    for chain in first_model:
        for residue in chain:
            for atom in residue:
                coord = atom.get_coord()
                name = atom.get_name().strip()
                element = (atom.element or name[:1] or "X").strip().upper()
                atoms.append({
                    "serial": int(atom.get_serial_number()),
                    "symbol": element,
                    "position": [float(coord[0]), float(coord[1]), float(coord[2])],
                    "residue": residue.get_resname().strip(),
                    "chain": str(chain.id).strip(),
                    "bfactor": float(atom.get_bfactor() or 0.0),
                    "occupancy": float(atom.get_occupancy() or 1.0)
                })

# CONECT：原样收集序列号对，不做任何下标换算
conect = []
for line in pdb_text.splitlines():
    if line.startswith("CONECT"):
        numbers = []
        for token in line[6:].split():
            try:
                numbers.append(int(token))
            except ValueError:
                pass
        if len(numbers) >= 2:
            for other in numbers[1:]:
                conect.append([numbers[0], other])

result = json.dumps({"atoms": atoms, "conect": conect})
`);

    // 通过 py.globals 获取 Python 中的 result 变量
    const jsonStr = py.globals.get("result");
    return JSON.parse(jsonStr) as PdbParseResult;
}

/** PDB 解析结果（原子带序列号；CONECT 仍是"序列号空间"） */
export interface PdbParseResult {
    atoms: Array<{
        /** PDB 文件的原子序列号（第 7-11 列），**不是**数组下标 */
        serial: number;
        symbol: string;
        position: [number, number, number];
        residue?: string;
        chain?: string;
        bfactor?: number;
        occupancy?: number;
    }>;
    /** CONECT 记录的原始序列号对（未换算成下标） */
    conect: Array<[number, number]>;
}

export function usePyodide() {
    // State
    const {
        state: pyodide,
        isLoading: pyodideLoading,
        error: pyodideError,
        execute: pyodideExecute
    } = useAsyncState(async () => {
        if (!("loadPyodide" in window))
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });

        if (!("loadPyodide" in window) || typeof window.loadPyodide !== "function")
            throw new Error("MsgId: Pyodide is not ready yet");

        const py = await window.loadPyodide();

        await py.loadPackage(["biopython"]);

        return py;
    }, undefined, {immediate: false});

    // functions
    const runPython = async (code: string, globals: Record<string, unknown> = {}) => {
        if (pyodideLoading.value || !pyodide.value) throw new Error("MsgId: Pyodide is not ready yet");

        for (const [k, v] of Object.entries(globals))
            pyodide.value.globals.set(k, v);

        return await pyodide.value.runPythonAsync(code);
        // 错误直接reject
    }

    // onMounted
    onMounted(() => pyodideExecute());

    return {
        pyodide,
        pyodideLoading,
        pyodideError,
        pyodideExecute,
        runPython
    };
}
