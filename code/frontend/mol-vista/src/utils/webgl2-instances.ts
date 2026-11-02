// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file webgl2-instances.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc WebGL2 降级渲染的纯实例构建器（不依赖 GL / Vue）。
 *
 *       球实例 7 float：center xyz + radius + rgb
 *       柱实例 11 float：a xyz + radius + b xyz + radius + rgb
 *
 *       只做“教学可用”的子集：球棍/空间填充/线框/卡通管 + 配体叠加；
 *       不做 impostor、GPU 剔除、SSAO、GPU MD。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { elementByZ, type StructureData } from '@wmv/structure';
import { getElementColor, getElementRadius } from '@/data/demo-molecule';
import type { ColorScheme, DisplayMode, FocusSpec, Selection } from '@/stores/molecule.store';

const FLAG_HETERO = 1;
const FLAG_WATER = 2;
const FLAG_HYDROGEN = 4;
const FLAG_BACKBONE = 16;
const FLAG_CA = 32;

const CHAIN_PALETTE: Array<[number, number, number]> = [
    [0.36, 0.61, 1.0],
    [0.25, 0.75, 0.56],
    [0.88, 0.64, 0.23],
    [0.88, 0.36, 0.56],
    [0.61, 0.36, 1.0],
    [0.36, 0.75, 0.88],
];

const SS_COLOR: Record<number, [number, number, number]> = {
    1: [0.95, 0.42, 0.36],
    2: [0.95, 0.76, 0.28],
    0: [0.58, 0.64, 0.72],
    3: [0.58, 0.64, 0.72],
};

export interface WebGL2BuildOptions {
    mode: DisplayMode;
    colorScheme: ColorScheme;
    ballScale: number;
    bondScale: number;
    showHydrogens: boolean;
    showWaters: boolean;
    showLigands: boolean;
    showSidechains: boolean;
    focus?: FocusSpec | null;
    selection?: Selection | null;
}

export interface WebGL2Instances {
    spheres: Float32Array;
    sphereCount: number;
    cylinders: Float32Array;
    cylinderCount: number;
}

function dim(color: [number, number, number], level: 0 | 1 | 2): [number, number, number] {
    if (level === 0) return color;

    const mix = level === 1 ? 0.7 : 0.95;
    const scale = level === 1 ? 0.75 : 0.5;
    const grey = 0.42;

    return [
        (color[0] * (1 - mix) + grey * mix) * scale,
        (color[1] * (1 - mix) + grey * mix) * scale,
        (color[2] * (1 - mix) + grey * mix) * scale,
    ];
}

export function buildWebGL2Instances(
    data: StructureData,
    options: WebGL2BuildOptions
): WebGL2Instances {
    const n = data.meta.atomCount;
    const flags = data.atoms.flags;
    const residues = data.residues;
    const residueIndex = data.atoms.residueIndex;
    const chainIndex = data.atoms.chainIndex;
    const chainIds = data.chains?.id;

    const hasBackbone = !!flags && flags.some(flag => (flag & FLAG_BACKBONE) !== 0);
    const focusSet = new Set(options.focus?.residueIndexes ?? []);
    const focusRadius = options.focus?.radius ?? 6;

    let fx = 0, fy = 0, fz = 0, focusAtoms = 0;
    let hull = 0;

    if (focusSet.size && residueIndex) {
        for (let i = 0; i < n; i++) {
            const r = residueIndex[i] ?? -1;

            if (!focusSet.has(r)) continue;

            fx += data.atoms.positions[i * 3]!;
            fy += data.atoms.positions[i * 3 + 1]!;
            fz += data.atoms.positions[i * 3 + 2]!;
            focusAtoms++;
        }

        if (focusAtoms) {
            fx /= focusAtoms;
            fy /= focusAtoms;
            fz /= focusAtoms;

            for (let i = 0; i < n; i++) {
                const r = residueIndex![i] ?? -1;

                if (!focusSet.has(r)) continue;

                hull = Math.max(hull, Math.hypot(
                    data.atoms.positions[i * 3]! - fx,
                    data.atoms.positions[i * 3 + 1]! - fy,
                    data.atoms.positions[i * 3 + 2]! - fz
                ));
            }
        }
    }

    const levelOf = (i: number): 0 | 1 | 2 => {
        if (!focusAtoms || !residueIndex) return 0;

        const r = residueIndex[i] ?? -1;

        if (focusSet.has(r)) return 0;

        const d = Math.hypot(
            data.atoms.positions[i * 3]! - fx,
            data.atoms.positions[i * 3 + 1]! - fy,
            data.atoms.positions[i * 3 + 2]! - fz
        );

        return d - hull <= focusRadius ? 1 : 2;
    };

    const selected = (i: number): boolean => {
        const selection = options.selection;

        if (!selection) return false;
        if (selection.kind === 'atom') return selection.index === i;
        if (selection.kind === 'residue') return residueIndex?.[i] === selection.index;

        return chainIndex?.[i] === selection.index;
    };

    const colorOf = (i: number): [number, number, number] => {
        const symbol = elementByZ(data.atoms.element[i] ?? 0).symbol;
        const chain = chainIds?.[chainIndex?.[i] ?? -1] ?? '';
        let color: [number, number, number] = getElementColor(symbol);

        if (options.colorScheme === 'chain' && chain) {
            let hash = 0;

            for (let k = 0; k < chain.length; k++) hash = (hash * 31 + chain.charCodeAt(k)) >>> 0;

            color = CHAIN_PALETTE[hash % CHAIN_PALETTE.length] ?? color;
        }

        if (selected(i)) color = [1.0, 0.85, 0.25];

        return dim(color, levelOf(i));
    };

    const visible = new Uint8Array(n).fill(1);

    for (let i = 0; i < n; i++) {
        const flag = flags?.[i] ?? 0;
        const z = data.atoms.element[i] ?? 0;

        if (z === 1 && !options.showHydrogens) visible[i] = 0;
        else if ((flag & FLAG_WATER) !== 0 && !options.showWaters) visible[i] = 0;
        else if ((flag & FLAG_HETERO) !== 0 && (flag & FLAG_WATER) === 0 && !options.showLigands) visible[i] = 0;
        else if (hasBackbone && (flag & FLAG_HETERO) === 0 && (flag & FLAG_BACKBONE) === 0 && !options.showSidechains) visible[i] = 0;
    }

    const isCartoon = options.mode === 'cartoon';
    const ballFactor = options.mode === 'spaceFill' ? 2.2 : options.mode === 'ballStick' ? 1.0 : 0;
    const stickRadius = options.mode === 'wireframe' ? 0.035 : options.mode === 'ballStick' ? 0.12 : isCartoon ? 0.1 : 0;
    const ligandBall = isCartoon ? 0.65 : 0;

    const atomIndices: number[] = [];

    for (let i = 0; i < n; i++) {
        if (!visible[i]) continue;
        if (isCartoon && ((flags?.[i] ?? 0) & FLAG_HETERO) === 0) continue;

        atomIndices.push(i);
    }

    const sphereFactor = isCartoon ? ligandBall : ballFactor;
    const spheres = new Float32Array(atomIndices.length * 7);
    let sphereCount = 0;

    for (const i of atomIndices) {
        if (sphereFactor <= 0) break;

        const symbol = elementByZ(data.atoms.element[i] ?? 0).symbol;
        const radius = getElementRadius(symbol) * sphereFactor * (options.ballScale / 100);
        const color = colorOf(i);
        const o = sphereCount * 7;

        spheres[o] = data.atoms.positions[i * 3]!;
        spheres[o + 1] = data.atoms.positions[i * 3 + 1]!;
        spheres[o + 2] = data.atoms.positions[i * 3 + 2]!;
        spheres[o + 3] = radius;
        spheres[o + 4] = color[0];
        spheres[o + 5] = color[1];
        spheres[o + 6] = color[2];
        sphereCount++;
    }

    const bonds = data.bonds;
    const totalBonds = bonds?.a.length ?? 0;
    const cylinders = new Float32Array(totalBonds * 11);
    let cylinderCount = 0;

    const pushCylinder = (
        a: number,
        b: number,
        radius: number,
        color: [number, number, number]
    ): void => {
        const o = cylinderCount * 11;

        cylinders[o] = data.atoms.positions[a * 3]!;
        cylinders[o + 1] = data.atoms.positions[a * 3 + 1]!;
        cylinders[o + 2] = data.atoms.positions[a * 3 + 2]!;
        cylinders[o + 3] = radius;
        cylinders[o + 4] = data.atoms.positions[b * 3]!;
        cylinders[o + 5] = data.atoms.positions[b * 3 + 1]!;
        cylinders[o + 6] = data.atoms.positions[b * 3 + 2]!;
        cylinders[o + 7] = radius;
        cylinders[o + 8] = color[0];
        cylinders[o + 9] = color[1];
        cylinders[o + 10] = color[2];
        cylinderCount++;
    };

    if (isCartoon) {
        // CA 管：每链连续，ss 决定半径/颜色
        const chains = new Map<number, number[]>();

        for (let i = 0; i < n; i++) {
            if (((flags?.[i] ?? 0) & FLAG_CA) === 0 || !visible[i]) continue;

            const c = chainIndex?.[i] ?? 0;
            const list = chains.get(c);

            if (list) list.push(i);
            else chains.set(c, [i]);
        }

        for (const [chain, list] of chains) {
            const chainColor = CHAIN_PALETTE[chain % CHAIN_PALETTE.length] ?? [0.7, 0.7, 0.7];

            for (let k = 0; k + 1 < list.length; k++) {
                const a = list[k]!;
                const b = list[k + 1]!;
                const distance = Math.hypot(
                    data.atoms.positions[b * 3]! - data.atoms.positions[a * 3]!,
                    data.atoms.positions[b * 3 + 1]! - data.atoms.positions[a * 3 + 1]!,
                    data.atoms.positions[b * 3 + 2]! - data.atoms.positions[a * 3 + 2]!
                );

                if (distance < 1.5 || distance > 5.5) continue;

                const r = residueIndex?.[a] ?? -1;
                const ss = r >= 0 ? (data.ss?.[r] ?? 0) : 0;
                const radius = (ss === 1 ? 0.9 : ss === 2 ? 0.7 : 0.45) * (options.bondScale / 100);
                let color: [number, number, number] = options.colorScheme === 'chain' ? chainColor : (SS_COLOR[ss] ?? SS_COLOR[0]!);

                if (selected(a)) color = [1.0, 0.85, 0.25];

                pushCylinder(a, b, radius, dim(color, levelOf(a)));
            }
        }

        // 配体内部/与配体相关的键
        if (bonds && stickRadius > 0) {
            for (let index = 0; index < totalBonds; index++) {
                const a = bonds.a[index]!;
                const b = bonds.b[index]!;
                const ligandA = (flags?.[a] ?? 0) & FLAG_HETERO && ((flags?.[a] ?? 0) & FLAG_WATER) === 0;
                const ligandB = (flags?.[b] ?? 0) & FLAG_HETERO && ((flags?.[b] ?? 0) & FLAG_WATER) === 0;

                if (!ligandA && !ligandB) continue;
                if (!visible[a] || !visible[b]) continue;

                pushCylinder(a, b, stickRadius * (options.bondScale / 100), colorOf(a));
            }
        }
    } else if (bonds && stickRadius > 0) {
        for (let index = 0; index < totalBonds; index++) {
            const a = bonds.a[index]!;
            const b = bonds.b[index]!;

            if (!visible[a] || !visible[b]) continue;

            pushCylinder(
                a,
                b,
                stickRadius * (options.bondScale / 100),
                colorOf(a)
            );
        }
    }

    return {
        spheres: spheres.slice(0, sphereCount * 7),
        sphereCount,
        cylinders: cylinders.slice(0, cylinderCount * 11),
        cylinderCount,
    };
}

