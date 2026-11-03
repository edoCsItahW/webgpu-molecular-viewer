// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file measure.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 三点夹角边界测试：0° / 90° / 180° / 退化。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { describe, expect, it } from 'vitest';
import { angleDegrees, dihedralDegrees } from '@/utils/measure';

const origin = [0, 0, 0] as const;

describe('angleDegrees', () => {
    it('正交向量为 90°', () => {
        expect(angleDegrees([1, 0, 0], origin, [0, 1, 0])).toBeCloseTo(90, 6);
    });

    it('反向共线为 180°，同向为 0°', () => {
        expect(angleDegrees([-1, 0, 0], origin, [1, 0, 0])).toBeCloseTo(180, 6);
        expect(angleDegrees([1, 0, 0], origin, [2, 0, 0])).toBeCloseTo(0, 6);
    });

    it('任一边退化为 0 长度时返回 null', () => {
        expect(angleDegrees(origin, origin, [1, 0, 0])).toBeNull();
        expect(angleDegrees([1, 0, 0], origin, origin)).toBeNull();
    });
});

describe('dihedralDegrees', () => {
    const a = [0, 0, 0] as const;
    const b = [1, 0, 0] as const;
    const c = [1, 1, 0] as const;

    it('正交平面为 ±90°', () => {
        expect(Math.abs(dihedralDegrees(a, b, c, [1, 1, 1])!)).toBeCloseTo(90, 6);
    });

    it('共面为 0°，反向为 ±180°', () => {
        expect(Math.abs(dihedralDegrees(a, b, c, [2, 1, 0])!)).toBeCloseTo(180, 6);
        expect(Math.abs(dihedralDegrees(a, b, c, [0, 1, 0])!)).toBeCloseTo(0, 6);
    });

    it('中间轴退化时返回 null', () => {
        expect(dihedralDegrees(a, b, b, [1, 1, 1])).toBeNull();
    });
});

