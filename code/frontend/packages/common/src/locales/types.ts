// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file types.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17 22:29
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Paths as PathsOf, Get } from "type-fest";


export type Paths<T> = PathsOf<T, { leavesOnly: true }>;


export type ValueAtPath<T, P extends string> = Get<T, P>;


export type ExtractPlaceholders<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
    ? Param | ExtractPlaceholders<Rest>
    : never;

type ParamsType<P extends string> = {
    [K in P]: string | number;
};

export type IsPluralObject<T> = T extends { other: string } ? true : false;


export type ParamsForPath<T, P extends string> =
    ValueAtPath<T, P> extends string
        ? ExtractPlaceholders<ValueAtPath<T, P>> extends never
            ? Record<string, string | number> | undefined // 无占位符时允许任意对象或 undefined
            : ParamsType<ExtractPlaceholders<ValueAtPath<T, P>>>
        : ValueAtPath<T, P> extends { other: string }
            ? { count: number }
            : undefined;