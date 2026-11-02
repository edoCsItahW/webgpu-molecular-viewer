// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file examples.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 示例库清单的完整性测试：id 唯一、格式合法、源文件真实存在。
 *       这些失败意味着 `scripts/sync-examples.mjs` 会在 dev/build 时直接报错。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import examples from '@/data/examples.json';

interface Entry {
    id: string;
    format: string;
    source: string;
}

const entries = examples as Entry[];

// vitest 的 cwd 可能是 app 也可能是仓库根；向上找到 code/backend/assets
function findAssetsRoot(): string {
    let dir = process.cwd();

    for (let i = 0; i < 5; i++) {
        const candidate = resolve(dir, 'code/backend/assets');

        if (existsSync(candidate)) return candidate;

        dir = resolve(dir, '..');
    }

    return '';
}

const assetsRoot = findAssetsRoot();

describe('examples manifest', () => {
    it('id 唯一，格式仅 pdb/sdf', () => {
        const ids = new Set(entries.map(e => e.id));

        expect(ids.size).toBe(entries.length);
        expect(entries.every(e => e.format === 'pdb' || e.format === 'sdf')).toBe(true);
        expect(entries.length).toBeGreaterThanOrEqual(10);
    });

    it('每条记录的源文件都存在于 code/backend/assets', () => {
        expect(assetsRoot).not.toBe('');

        const missing = entries.filter(e => !existsSync(`${assetsRoot}/${e.source}`));

        expect(missing.map(e => `${e.id}: ${e.source}`)).toEqual([]);
    });
});
