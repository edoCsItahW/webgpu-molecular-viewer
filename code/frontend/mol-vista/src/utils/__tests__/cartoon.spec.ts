// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file cartoon.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 卡通 builder 的白盒单测：CA 邻接、链断裂、二级结构半径/颜色。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { describe, expect, it } from 'vitest';
import { parseStructureData } from '@wmv/parser';
import { buildCartoonInstances } from '@/utils/cartoon';

/** 固定列 PDB 行（只要 CA 与坐标） */
function caLine(serial: number, seq: number, x: number): string {
    const serialText = String(serial).padStart(5);
    const seqText = String(seq).padStart(4);
    const xs = x.toFixed(3).padStart(8);
    const ys = (0).toFixed(3).padStart(8);
    const zs = (0).toFixed(3).padStart(8);

    return `ATOM  ${serialText}  CA  ALA A${seqText}    ${xs}${ys}${zs}  1.00 20.00           C`;
}

describe('buildCartoonInstances', () => {
    it('相邻 CA 连段，链断裂（>5.5 Å）不连', () => {
        const text = [
            caLine(1, 1, 0),
            caLine(2, 2, 3.8),
            caLine(3, 3, 7.6),
            caLine(4, 4, 30),
        ].join('\n');

        const data = parseStructureData(text, 'trace.pdb');
        const cartoon = buildCartoonInstances(data, 'secondary');

        // 前 3 个 CA 形成 2 段，每段 SUBDIV=3；第 4 个与前面断开
        expect(cartoon.count).toBe(6);
        expect(cartoon.data.length).toBe(6 * 12);
    });

    it('二级结构决定半径：helix > sheet > coil', () => {
        const text = [caLine(1, 1, 0), caLine(2, 2, 3.8)].join('\n');
        const data = parseStructureData(text, 'trace.pdb');

        data.ss = new Uint8Array([1, 0]);
        const helix = buildCartoonInstances(data, 'secondary');
        data.ss = new Uint8Array([2, 0]);
        const sheet = buildCartoonInstances(data, 'secondary');
        data.ss = new Uint8Array([0, 0]);
        const coil = buildCartoonInstances(data, 'secondary');

        // 每实例的 radius 在 float 偏移 3
        expect(helix.data[3]).toBeGreaterThan(sheet.data[3]!);
        expect(sheet.data[3]).toBeGreaterThan(coil.data[3]!);
    });
});
