// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file types.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 解析结果的 SoA（Structure of Arrays）约定。
 *
 *       为什么不是 `Atom[]`：
 *         - 100k 原子时对象数组 = 100k 个对象 + 100k 个 [x,y,z] 子数组，GC 与缓存都不友好；
 *         - SoA 的 TypedArray 可以直接 `postMessage(..., transfer)` 零拷贝交给主线程；
 *         - 字符串走字典 + 索引（residue/chain/element），避免每原子重复存字符串。
 *
 *       内存账（N 原子 / B 键）：
 *         positions 12N + elementIndex 1N + residueIndex 4N + chainIndex 2N
 *         + bfactor 4N + occupancy 4N + bonds 8B ≈ 27N + 8B 字节。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 结构文件格式 */
export type StructureFormat = "pdb" | "cif" | "sdf" | "unknown";

/** 解析结果（SoA） */
export interface ParsedStructure {
    /** 名称（通常是文件名去扩展名） */
    name: string;

    /** 来源格式 */
    format: StructureFormat;

    /** 原子数 */
    count: number;

    /** 坐标，长度 3N（x,y,z 交错，便于网格遍历时顺序读取） */
    positions: Float32Array;

    /** 元素字典 */
    elements: string[];

    /** 每原子的元素字典下标 */
    elementIndex: Uint8Array;

    /** 残基名字典 */
    residues: string[];

    /** 每原子的残基字典下标 */
    residueIndex: Uint32Array;

    /** 链 ID 字典 */
    chains: string[];

    /** 每原子的链字典下标 */
    chainIndex: Uint16Array;

    /** 温度因子 */
    bfactor: Float32Array;

    /** 占有率 */
    occupancy: Float32Array;

    /** 键端点下标，长度 2B（i*2, i*2+1），i < j */
    bonds: Uint32Array;

    /** 键数 */
    bondCount: number;

    /** 键级（与 bonds 等长：1/2/3/4=芳香；仅 SDF 等带键级的格式） */
    bondOrders?: Uint8Array;

    /** 形式电荷（长度 N；SDF 有则填，缺省 0） */
    charges?: Float32Array;

    /** MDR 位标记（Hetero/Water/Hydrogen/Backbone…），长度 N */
    flags?: Uint8Array;

    /** 每原子的残基序号 */
    residueSeq?: Int32Array;

    /** 每原子的插入码 */
    residueIcode?: string[];

    /** 每个残基的二级结构（0=coil 1=helix 2=sheet 3=turn） */
    ss?: Uint8Array;

    /** 键是否由几何感知推断（true）还是文件显式给出（false） */
    bondsInferred?: boolean;

    /** 解析耗时（毫秒，仅解析阶段，不含键感知） */
    parseMs: number;

    /** 键感知耗时（毫秒；未开启时为 0） */
    bondMs: number;
}

/** 解析选项 */
export interface ParseOptions {
    /** 名称；缺省用文件名 */
    name?: string;

    /** 是否做几何键感知（PDB/CIF 默认 true） */
    perceiveBonds?: boolean;

    /** 共价半径容差，默认 1.25 */
    tolerance?: number;

    /** 单键长度上限（Å），默认 2.6 */
    maxBondLength?: number;
}

/** 基于扩展名 + 内容首行判断格式 */
export function detectStructureFormat(filename: string, text: string): StructureFormat {
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";

    if (ext === "pdb" || ext === "ent") return "pdb";
    if (ext === "cif" || ext === "mmcif") return "cif";
    if (ext === "sdf" || ext === "mol") return "sdf";

    const head = text.slice(0, 4096);

    if (/^\s*(data_|loop_|_atom_site\.)/m.test(head)) return "cif";
    if (/^(HEADER|CRYST1|ATOM  |HETATM|MODEL |CONECT)/m.test(head)) return "pdb";
    if (/V2000|V3000|\$\$\$\$/.test(head)) return "sdf";

    return "unknown";
}

/** 从文件名提取结构名 */
export function nameFromFilename(filename: string): string {
    const base = filename.replace(/^.*[\\/]/, "");
    const name = base.replace(/\.[^.]+$/, "");

    return name || "molecule";
}

