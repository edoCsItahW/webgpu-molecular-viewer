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
 * @param pdbText PDB 文件文本内容
 * @returns 解析出的原子与键
 */
export async function parsePDBWithPyodide(pdbText: string): Promise<{
    atoms: Array<{ symbol: string; position: [number, number, number] }>;
    bonds: Array<[number, number]>;
} | null> {
    const py = await loadPyodide();

    // 将 PDB 文本传入 Python 全局作用域
    py.globals.set("pdb_text", pdbText);

    // 使用 Biopython 解析 PDB，提取原子坐标和 CONECT 键信息
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
                element = (atom.element or atom.get_name().strip()[0]).upper()
                atoms.append({
                    "symbol": element,
                    "position": [float(coord[0]), float(coord[1]), float(coord[2])]
                })

# 解析 CONECT 记录中的键
bonds = []
for line in pdb_text.splitlines():
    if line.startswith("CONECT"):
        parts = line[6:].split()
        if len(parts) >= 2:
            try:
                a1 = int(parts[0]) - 1  # PDB 编号从 1 开始
                for p in parts[1:]:
                    a2 = int(p) - 1
                    if 0 <= a1 < len(atoms) and 0 <= a2 < len(atoms):
                        bonds.append([a1, a2])
            except (ValueError, IndexError):
                pass

result = json.dumps({"atoms": atoms, "bonds": bonds})
`);

    // 通过 py.globals 获取 Python 中的 result 变量
    const jsonStr = py.globals.get("result");
    const data = JSON.parse(jsonStr);
    return data;
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
