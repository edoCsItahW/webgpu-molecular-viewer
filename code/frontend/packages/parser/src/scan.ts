// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file scan.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 无分配的数字扫描：直接从字符串区间解析 float/int，避免 `slice().trim()` 的临时字符串。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 从 [start, end) 解析浮点数；空/非法返回 0 */
export function parseFloatRange(text: string, start: number, end: number): number {
    let i = start;

    while (i < end && text.charCodeAt(i) === 32) i++;
    if (i >= end) return 0;

    let sign = 1;

    if (text.charCodeAt(i) === 45) {
        sign = -1;
        i++;
    } else if (text.charCodeAt(i) === 43) {
        i++;
    }

    let value = 0;
    let digits = 0;

    while (i < end) {
        const code = text.charCodeAt(i);

        if (code < 48 || code > 57) break;

        value = value * 10 + (code - 48);
        digits++;
        i++;
    }

    if (i < end && text.charCodeAt(i) === 46) {
        i++;

        let place = 0.1;

        while (i < end) {
            const code = text.charCodeAt(i);

            if (code < 48 || code > 57) break;

            value += (code - 48) * place;
            place *= 0.1;
            digits++;
            i++;
        }
    }

    if (digits === 0) return 0;

    if (i < end) {
        const code = text.charCodeAt(i);

        if (code === 69 || code === 101) {
            i++;

            let expSign = 1;

            if (i < end && text.charCodeAt(i) === 45) {
                expSign = -1;
                i++;
            } else if (i < end && text.charCodeAt(i) === 43) {
                i++;
            }

            let exp = 0;

            while (i < end) {
                const c = text.charCodeAt(i);

                if (c < 48 || c > 57) break;

                exp = exp * 10 + (c - 48);
                i++;
            }

            value *= Math.pow(10, expSign * exp);
        }
    }

    return sign * value;
}

/** 从 [start, end) 解析整数；空/非法返回 0 */
export function parseIntRange(text: string, start: number, end: number): number {
    let i = start;

    while (i < end && text.charCodeAt(i) === 32) i++;
    if (i >= end) return 0;

    let sign = 1;

    if (text.charCodeAt(i) === 45) {
        sign = -1;
        i++;
    } else if (text.charCodeAt(i) === 43) {
        i++;
    }

    let value = 0;
    let digits = 0;

    while (i < end) {
        const code = text.charCodeAt(i);

        if (code < 48 || code > 57) break;

        value = value * 10 + (code - 48);
        digits++;
        i++;
    }

    return digits === 0 ? 0 : sign * value;
}

/** 区间去空格后转字符串（仅在字典未命中时调用） */
export function sliceTrimmed(text: string, start: number, end: number): string {
    let a = start;
    let b = end;

    while (a < b && text.charCodeAt(a) === 32) a++;
    while (b > a && text.charCodeAt(b - 1) === 32) b--;

    return text.slice(a, b);
}

