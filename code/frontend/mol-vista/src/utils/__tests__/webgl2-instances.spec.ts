// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file webgl2-instances.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc WebGL2 降级实例构建器的白盒测试：过滤、空间填充无键、实例浮点有限。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { describe, expect, it } from 'vitest';
import { parseStructureData } from '@wmv/parser';
import { buildWebGL2Instances, type WebGL2BuildOptions } from '@/utils/webgl2-instances';

function pdbLine(serial: number, element: string, x: number, y: number, z: number, record = 'ATOM'): string {
    return `${record.padEnd(6)}${String(serial).padStart(5)}  C   ALA A   1    ${x.toFixed(3).padStart(8)}${y.toFixed(3).padStart(8)}${z.toFixed(3).padStart(8)}  1.00 20.00          ${element.padStart(2)}`;
}

const DATA = parseStructureData(
    [
        'HEADER    FALLBACK TEST',
        pdbLine(1, 'C', 0, 0, 0),
        pdbLine(2, 'C', 1.4, 0, 0),
        pdbLine(3, 'O', 2.1, 1.0, 0),
        pdbLine(4, 'H', -0.6, 0.9, 0),
        'END',
    ].join('\n'),
    'fallback.pdb'
);

const BASE: WebGL2BuildOptions = {
    mode: 'ballStick',
    colorScheme: 'element',
    ballScale: 100,
    bondScale: 100,
    showHydrogens: true,
    showWaters: true,
    showLigands: true,
    showSidechains: true,
    focus: null,
    selection: null,
};

describe('buildWebGL2Instances', () => {
    it('球棍为每个原子生成球、为每条键生成柱，且实例浮点全部有限', () => {
        const result = buildWebGL2Instances(DATA, BASE);

        expect(result.sphereCount).toBe(4);
        expect(result.cylinderCount).toBeGreaterThan(0);
        expect(result.spheres).toHaveLength(result.sphereCount * 7);
        expect(result.cylinders).toHaveLength(result.cylinderCount * 11);

        expect([...result.spheres].every(Number.isFinite)).toBe(true);
        expect([...result.cylinders].every(Number.isFinite)).toBe(true);
    });

    it('空间填充只画球，不画键', () => {
        const result = buildWebGL2Instances(DATA, {...BASE, mode: 'spaceFill'});

        expect(result.sphereCount).toBe(4);
        expect(result.cylinderCount).toBe(0);
    });

    it('隐藏氢后不生成氢球，且不影响重原子数量', () => {
        const result = buildWebGL2Instances(DATA, {...BASE, showHydrogens: false});

        expect(result.sphereCount).toBe(3);
    });

    it('选中原子用高亮色覆盖元素色（白盒校验颜色槽）', () => {
        const normal = buildWebGL2Instances(DATA, BASE);
        const selected = buildWebGL2Instances(DATA, {
            ...BASE,
            selection: {kind: 'atom', index: 0},
        });

        // 第 0 个球：center(3) + radius(1) + rgb(3)，比较 rgb
        const normalColor = [...normal.spheres.slice(4, 7)];
        const selectedColor = [...selected.spheres.slice(4, 7)];

        expect(selectedColor).not.toEqual(normalColor);
        expect(selectedColor[0]).toBeCloseTo(1.0);
        expect(selectedColor[1]).toBeCloseTo(0.85);
    });
});
