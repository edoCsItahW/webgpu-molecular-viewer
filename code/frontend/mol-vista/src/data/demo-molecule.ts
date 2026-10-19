// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file demo-molecule.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:35
 * @desc 演示分子数据。在真实结构解析器接入前，提供一组原子坐标用于引擎渲染与面板展示。
 *       数据为一个简化的苯环 + 取代基，便于观察球棍渲染效果。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** CPK 元素颜色（0~1 线性 RGB） */
const ELEMENT_COLORS: Record<string, [number, number, number]> = {
    C: [0.255, 0.282, 0.333],
    O: [0.878, 0.290, 0.227],
    N: [0.231, 0.435, 0.878],
    S: [0.878, 0.690, 0.251],
    H: [0.847, 0.863, 0.878],
    P: [0.957, 0.522, 0.227],
    F: [0.255, 0.776, 0.529],
    Cl: [0.180, 0.620, 0.278],
};

/** 范德华半径（Å，用于球半径缩放） */
const ELEMENT_RADII: Record<string, number> = {
    C: 0.76,
    O: 0.66,
    N: 0.71,
    S: 1.05,
    H: 0.31,
    P: 1.07,
    F: 0.57,
    Cl: 1.02,
};

/** 单个演示原子 */
export interface DemoAtom {
    /** 元素符号 */
    symbol: string;
    /** 世界坐标（Å） */
    position: [number, number, number];
    /** CPK 颜色（0~1） */
    color: [number, number, number];
    /** 球半径（Å） */
    radius: number;
    /** 残基名（演示用） */
    residue?: string;
    /** 链 ID（演示用） */
    chain?: string;
}

/** 演示分子 */
export interface DemoMolecule {
    name: string;
    atoms: DemoAtom[];
    bonds: Array<[number, number]>;
}

/**
 * 生成一个简化的苯并咪唑（Benzimidazole）结构作为演示分子。
 * 坐标为近似值，仅用于渲染展示。
 */
export function createDemoMolecule(): DemoMolecule {
    const atoms: DemoAtom[] = [];
    const bonds: Array<[number, number]> = [];

    // 苯环六元环（XY 平面，中心在原点）
    const ringR = 1.4;
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        atoms.push({
            symbol: 'C',
            position: [Math.cos(angle) * ringR, Math.sin(angle) * ringR, 0],
            color: colorOf('C'),
            radius: radiusOf('C'),
            residue: 'BEN',
            chain: 'A',
        });
    }

    // 苯环键
    for (let i = 0; i < 6; i++) {
        bonds.push([i, (i + 1) % 6]);
    }

    // 咪唑环融合（在苯环的一条边上融合一个五元含氮环）
    // 简化：在苯环下方添加 N 原子形成稠环
    const n1: DemoAtom = {
        symbol: 'N',
        position: [0, -ringR * 1.6, 0],
        color: colorOf('N'),
        radius: radiusOf('N'),
        residue: 'BEN',
        chain: 'A',
    };
    atoms.push(n1);
    bonds.push([4, 6]); // 苯环底左 -> N
    bonds.push([5, 6]); // 苯环底右 -> N

    // 取代基：在苯环顶部加一个羟基 O
    const o1: DemoAtom = {
        symbol: 'O',
        position: [0, ringR * 1.8, 0],
        color: colorOf('O'),
        radius: radiusOf('O'),
        residue: 'BEN',
        chain: 'A',
    };
    atoms.push(o1);
    bonds.push([0, 7]); // 苯环顶 -> O

    // 氢原子（示意）
    const hPositions: Array<{ parent: number; offset: [number, number, number] }> = [
        { parent: 0, offset: [0.8, 0.6, 0.5] },
        { parent: 1, offset: [1.3, 0, 0.5] },
        { parent: 2, offset: [0.8, -0.6, 0.5] },
        { parent: 3, offset: [-0.8, -0.6, 0.5] },
        { parent: 7, offset: [0, 0.6, 0.5] },
        { parent: 6, offset: [0, -0.6, 0.5] },
    ];

    for (const { parent, offset } of hPositions) {
        const parentAtom = atoms[parent];
        if (!parentAtom) continue;
        atoms.push({
            symbol: 'H',
            position: [
                parentAtom.position[0] + offset[0],
                parentAtom.position[1] + offset[1],
                parentAtom.position[2] + offset[2],
            ],
            color: colorOf('H'),
            radius: radiusOf('H'),
            residue: 'BEN',
            chain: 'A',
        });
        bonds.push([parent, atoms.length - 1]);
    }

    return {
        name: 'Benzimidazole (demo)',
        atoms,
        bonds,
    };
}

/** 获取元素的 CPK 颜色 */
export function getElementColor(symbol: string): [number, number, number] {
    return ELEMENT_COLORS[symbol] ?? [0.5, 0.5, 0.5];
}

/** 获取元素的范德华半径 */
export function getElementRadius(symbol: string): number {
    return ELEMENT_RADII[symbol] ?? 1.0;
}

/** 安全的元素颜色查找（编译期处理 undefined） */
function colorOf(symbol: string): [number, number, number] {
    return ELEMENT_COLORS[symbol] ?? [0.5, 0.5, 0.5];
}

/** 安全的元素半径查找 */
function radiusOf(symbol: string): number {
    return ELEMENT_RADII[symbol] ?? 1.0;
}
