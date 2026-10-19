// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

import {describe, expect, it} from 'vitest';
import {
    covalentRadiusOf,
    maxValenceOf,
    normalizeBonds,
    normalizeElementSymbol,
    perceiveBonds,
    type PerceptionAtom,
} from '@/utils/bond-perception';

/**
 * 键感知的白盒单元测试。
 *
 * 用例按等价类划分 + 边界值分析设计（`CLAUDE.local.md`）：
 *   等价类：显式键 / 推断键 / 两者混合、已知与未知元素、离子、价数受限与不受限、空与单原子
 *   边界值：判据距离（`(r₁+r₂)×tolerance`）内侧/外侧、绝对长度上限内侧/外侧
 * 判据常量（用于推导边界）：
 *   C–C: (0.76+0.76)×1.25 = 1.90 Å    C–H: (0.76+0.31)×1.25 = 1.3375 Å
 *   S–S: (1.05+1.05)×1.25 = 2.625 Å → 被 maxBondLength(2.6) 夹住
 */

const atom = (symbol: string, x = 0, y = 0, z = 0): PerceptionAtom => ({symbol, position: [x, y, z]});

/** 把键列表转成便于断言的字符串集合（键已经规范化成 i<j） */
const asKeys = (bonds: ReadonlyArray<readonly [number, number]>): string[] =>
    bonds.map(([i, j]) => `${i}-${j}`).sort();

describe('normalizeElementSymbol', () => {
    it('归一化大小写：单位/双位元素都取首字母大写', () => {
        expect(normalizeElementSymbol('C')).toBe('C');
        expect(normalizeElementSymbol('cl')).toBe('Cl');
        expect(normalizeElementSymbol('FE')).toBe('Fe');
        expect(normalizeElementSymbol(' fe ')).toBe('Fe');
    });

    it('空字符串归到未知元素 X（不抛错）', () => {
        expect(normalizeElementSymbol('')).toBe('X');
        expect(normalizeElementSymbol('   ')).toBe('X');
    });
});

describe('元素表兜底', () => {
    it('已知元素取表值，未知元素取保守默认值', () => {
        expect(covalentRadiusOf('C')).toBeCloseTo(0.76, 5);
        expect(covalentRadiusOf('Fe')).toBeCloseTo(1.32, 5);
        expect(covalentRadiusOf('Xx')).toBeGreaterThan(0.5);   // 默认半径不为 0，否则永远不成键
        expect(covalentRadiusOf('Xx')).toBeLessThan(1.0);      // 也不宜过大，否则乱成键
    });

    it('碱金属价数上限为 0（PDB 里它们几乎总是离子，不该画出共价键）', () => {
        expect(maxValenceOf('Na')).toBe(0);
        expect(maxValenceOf('K')).toBe(0);
        expect(maxValenceOf('C')).toBe(4);
        expect(maxValenceOf('Xx')).toBe(4);
    });
});

describe('perceiveBonds：等价类', () => {
    it('单个原子 / 空输入 → 没有键', () => {
        expect(perceiveBonds([])).toEqual([]);
        expect(perceiveBonds([atom('C')])).toEqual([]);
    });

    it('典型共价键：C–C(1.54)、C–H(1.09)、S–S(2.05) 都能识别', () => {
        // 两簇原子放得足够远（20 Å），互不干扰：
        //   0-1 C–C(1.54)、0-2 C–H(1.09)；3-4 S–S(2.05)
        const atoms = [atom('C', 0, 0, 0), atom('C', 1.54, 0, 0), atom('H', 0, 1.09, 0), atom('S', 0, 0, 20), atom('S', 0, 0, 22.05)];

        expect(asKeys(perceiveBonds(atoms))).toEqual(['0-1', '0-2', '3-4']);
    });

    it('C–S 这类不同元素的键同样按各自共价半径判定（C–S 判据 ≈ 2.26 Å）', () => {
        expect(perceiveBonds([atom('C', 0, 0, 0), atom('S', 1.82, 0, 0)])).toHaveLength(1);   // 真实 C–S 键长
        expect(perceiveBonds([atom('C', 0, 0, 0), atom('S', 2.40, 0, 0)])).toEqual([]);
    });

    it('非共价接触不成键：氢键（N···O ≈ 2.9 Å）与疏水接触（C···C ≈ 3.8 Å）都不连', () => {
        const atoms = [atom('N', 0, 0, 0), atom('O', 2.9, 0, 0), atom('C', 0, 5, 0), atom('C', 3.8, 5, 0)];

        expect(perceiveBonds(atoms)).toEqual([]);
    });

    it('碱金属不与周围原子成键（离子，不做假的配位键）', () => {
        const atoms = [atom('Na', 0, 0, 0), atom('O', 2.4, 0, 0), atom('O', 0, 2.4, 0)];

        expect(perceiveBonds(atoms)).toEqual([]);
    });

    it('显式键优先，且与推断结果去重（不会出现重复键）', () => {
        const atoms = [atom('C', 0, 0, 0), atom('C', 1.54, 0, 0)];

        expect(asKeys(perceiveBonds(atoms, {explicit: [[0, 1]]}))).toEqual(['0-1']);
        // 反向书写也算同一条键
        expect(asKeys(perceiveBonds(atoms, {explicit: [[1, 0]]}))).toEqual(['0-1']);
    });

    it('显式键可以超出共价判据（文件说了算），但仍占用价数', () => {
        // 两个 C 相距 4 Å：推断不会连，显式给了就连
        const atoms = [atom('C', 0, 0, 0), atom('C', 4, 0, 0)];

        expect(perceiveBonds(atoms)).toEqual([]);
        expect(asKeys(perceiveBonds(atoms, {explicit: [[0, 1]]}))).toEqual(['0-1']);
    });

    it('价数上限生效：一个碳最多 4 条键，且保留最短的那 4 条', () => {
        const atoms = [
            atom('C', 0, 0, 0),
            atom('H', 1.10, 0, 0),
            atom('H', -1.15, 0, 0),
            atom('H', 0, 1.20, 0),
            atom('H', 0, -1.25, 0),
            atom('H', 0, 0, 1.30),   // 最远的一条应当被价数上限挤掉
        ];

        const bonds = perceiveBonds(atoms);

        expect(bonds).toHaveLength(4);
        expect(asKeys(bonds)).toEqual(['0-1', '0-2', '0-3', '0-4']);
    });

    it('未知元素用保守默认半径，可以与常见元素成键（不至于全是孤岛）', () => {
        const atoms = [atom('Xx', 0, 0, 0), atom('O', 1.8, 0, 0)];

        // 默认半径 0.77 → 判据 (0.77+0.66)×1.25 ≈ 1.79；1.8 略超 → 不成键（保守）
        expect(perceiveBonds(atoms)).toEqual([]);
        // 更近时成键
        expect(perceiveBonds([atom('Xx', 0, 0, 0), atom('O', 1.4, 0, 0)])).toHaveLength(1);
    });
});

describe('perceiveBonds：边界值', () => {
    it('判据距离内侧成键、外侧不成键（C–C 判据 1.90 Å）', () => {
        expect(perceiveBonds([atom('C', 0, 0, 0), atom('C', 1.89, 0, 0)])).toHaveLength(1);
        expect(perceiveBonds([atom('C', 0, 0, 0), atom('C', 1.92, 0, 0)])).toEqual([]);
    });

    it('绝对长度上限生效（S–S 判据 2.625 Å 被 maxBondLength = 2.6 夹住）', () => {
        // 2.55 Å：在判据内也在上限内 → 成键
        expect(perceiveBonds([atom('S', 0, 0, 0), atom('S', 2.55, 0, 0)])).toHaveLength(1);
        // 2.62 Å：小于判据 2.625 但超过上限 2.6 → 不成键
        expect(perceiveBonds([atom('S', 0, 0, 0), atom('S', 2.62, 0, 0)])).toEqual([]);
    });

    it('tolerance 可调：放宽后原本不成的键会成立', () => {
        const atoms = [atom('C', 0, 0, 0), atom('C', 2.0, 0, 0)];

        expect(perceiveBonds(atoms)).toEqual([]);
        expect(perceiveBonds(atoms, {tolerance: 1.4})).toHaveLength(1);   // (0.76+0.76)×1.4 ≈ 2.13
    });

    it('完全重合的原子不产生键（距离 0 是陷阱，会污染法线与变换）', () => {
        expect(perceiveBonds([atom('C', 1, 1, 1), atom('C', 1, 1, 1)])).toEqual([]);
    });

    it('网格边界不丢邻居：跨格点的一对原子仍能成键', () => {
        // 人为把两个碳放在相距 1.54 Å 但跨越网格边界的位置
        const atoms = [atom('C', 2.59, 0, 0), atom('C', 4.13, 0, 0)];

        expect(perceiveBonds(atoms)).toHaveLength(1);
    });
});

describe('normalizeBonds', () => {
    it('丢弃自环、越界、非整数与重复，保留合法键并统一成 i<j', () => {
        const bonds: Array<[number, number]> = [
            [3, 1],      // 合法，会规范成 1-3
            [1, 3],      // 重复
            [2, 2],      // 自环
            [0, 5],      // 越界（原子数 4）
            [-1, 2],     // 负数越界
            [0.5, 2],    // 非整数
        ];

        expect(normalizeBonds(bonds, 4)).toEqual([[1, 3]]);
    });

    it('空输入与原子数为 0 时返回空数组', () => {
        expect(normalizeBonds([], 0)).toEqual([]);
        expect(normalizeBonds([[0, 1]], 0)).toEqual([]);
    });
});
