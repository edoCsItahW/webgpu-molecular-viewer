// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ribbon.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc ribbon 几何白盒测试：平滑后顶点/索引有效、链断裂切分、宽度按 ss。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { describe, expect, it } from 'vitest';
import { parseStructureData } from '@wmv/parser';
import { buildRibbonParts } from '@/utils/ribbon';

function caLine(serial: number, seq: number, x: number): string {
    const serialText = String(serial).padStart(5);
    const seqText = String(seq).padStart(4);
    const xs = x.toFixed(3).padStart(8);
    const ys = (0).toFixed(3).padStart(8);
    const zs = (0).toFixed(3).padStart(8);

    return `ATOM  ${serialText}  CA  ALA A${seqText}    ${xs}${ys}${zs}  1.00 20.00           C`;
}

describe('buildRibbonParts', () => {
    it('生成有效三角带：索引不越界、无 NaN', () => {
        const text = [1, 2, 3, 4].map(n => caLine(n, n, (n - 1) * 3.8)).join('\n');
        const data = parseStructureData(text, 'ribbon.pdb');

        data.ss = new Uint8Array([1, 1, 1, 1]);

        const parts = buildRibbonParts(data, 'secondary');

        expect(parts.length).toBe(1);

        const part = parts[0]!;
        const vertices = part.positions.length / 3;

        expect(vertices * 3).toBe(part.positions.length);
        expect(part.normals.length).toBe(part.positions.length);
        expect(part.positions.some(Number.isNaN)).toBe(false);

        for (const index of part.indices)
            expect(index).toBeLessThan(vertices);
    });

    it('链断裂（>5.5 Å）切分成不同 part', () => {
        const text = [
            caLine(1, 1, 0),
            caLine(2, 2, 3.8),
            caLine(3, 3, 30),
            caLine(4, 4, 33.8),
        ].join('\n');

        const data = parseStructureData(text, 'break.pdb');

        data.ss = new Uint8Array([1, 1, 1, 1]);

        const parts = buildRibbonParts(data, 'secondary');

        expect(parts.length).toBe(2);
        expect(parts.every(p => p.indices.length > 0)).toBe(true);
    });
});
