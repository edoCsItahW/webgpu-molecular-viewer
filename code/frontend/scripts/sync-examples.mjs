// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file sync-examples.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 把 `code/backend/assets` 里的示例结构复制到 `mol-vista/public/examples/`。
 *
 *       单一来源：`src/data/examples.json` 列出 id / 源文件 / 格式；
 *       本脚本只做"校验 + 复制"，缺文件直接失败（不允许静默少示例）。
 *       生成目录已加入 .gitignore，部署时由 dev/build 脚本自动同步。
 * */
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDir, '..');
const repoRoot = resolve(frontendRoot, '..', '..');
const appRoot = resolve(frontendRoot, 'mol-vista');

const manifestPath = resolve(appRoot, 'src/data/examples.json');
const assetsRoot = resolve(repoRoot, 'code/backend/assets');
const outDir = resolve(appRoot, 'public/examples');

const list = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (!Array.isArray(list) || list.length === 0)
    throw new Error(`MsgId: 示例清单为空：${manifestPath}`);

rmSync(outDir, {recursive: true, force: true});
mkdirSync(outDir, {recursive: true});

let copied = 0;

for (const entry of list) {
    const source = resolve(assetsRoot, entry.source);
    const target = resolve(outDir, `${entry.id}.${entry.format}`);

    if (!existsSync(source))
        throw new Error(`MsgId: 示例源文件不存在：${source}（id=${entry.id}）`);

    copyFileSync(source, target);
    copied++;
}

console.log(`[examples] synced ${copied} structures -> ${outDir}`);
