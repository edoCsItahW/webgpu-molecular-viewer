// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/16 12:35
 * @desc 通用类型别名：Optional / Nullable。用 .ts 而非 .d.ts，确保 tsc 能把声明输出到 dist。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
export type Optional<T> = T | undefined;

export type Nullable<T> = T | null;
