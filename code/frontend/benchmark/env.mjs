// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file env.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准框架路径与输出目录。所有路径从本文件相对推导，不写项目绝对路径。
 * */
import {existsSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** code/frontend/benchmark */
export const BENCH_ROOT = HERE;

/** code/frontend */
export const FRONTEND_ROOT = resolve(BENCH_ROOT, '..');

/** code/frontend/mol-vista */
export const APP_ROOT = resolve(FRONTEND_ROOT, 'mol-vista');

/** code/backend/assets */
export const ASSETS_ROOT = resolve(FRONTEND_ROOT, '..', 'backend', 'assets');

/** 生成物目录（gitignored） */
export const OUT_ROOT = resolve(BENCH_ROOT, 'out');

/** 浏览器 profile / Vite 缓存 */
export const CACHE_ROOT = resolve(BENCH_ROOT, '.cache');

export function ensureOut() {
    if (!existsSync(OUT_ROOT)) mkdirSync(OUT_ROOT, {recursive: true});
}

export function ensureCache() {
    if (!existsSync(CACHE_ROOT)) mkdirSync(CACHE_ROOT, {recursive: true});
}

