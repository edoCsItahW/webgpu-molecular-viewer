// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file parser.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc Node 侧解析基准：直接调用 @wmv/parser 的 dist，测冷/热解析与 MDR 构建。
 * */
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {FRONTEND_ROOT} from '../env.mjs';
import {readDataset} from '../datasets.mjs';

const PARSER_DIST = resolve(FRONTEND_ROOT, 'packages/parser/dist/index.js');

/** @type {typeof import('../packages/parser/src/index') | null} */
let parser = null;

async function loadParser() {
    if (!parser) parser = await import(pathToFileURL(PARSER_DIST).href);

    return parser;
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
}

/**
 * @param {{datasets: import('../datasets.mjs').Dataset[]}} ctx
 */
export async function run({datasets}) {
    const {parseStructureData} = await loadParser();
    const rows = [];

    for (const dataset of datasets) {
        const input = readDataset(dataset.id);
        const iterations = 5;
        const times = [];
        let last = null;

        // warmup：避免把第一次 JIT 当成冷启动
        parseStructureData(input.text, `${dataset.id}.${dataset.format}`);

        for (let i = 0; i < iterations; i++) {
            const t0 = performance.now();
            const data = parseStructureData(input.text, `${dataset.id}.${dataset.format}`);
            times.push(performance.now() - t0);
            last = data;
        }

        rows.push({
            scenario: 'parser',
            case: dataset.id,
            metrics: {
                medianMs: +median(times).toFixed(1),
                minMs: +Math.min(...times).toFixed(1),
                maxMs: +Math.max(...times).toFixed(1),
                atoms: last.meta.atomCount,
                bonds: last.bonds?.a.length ?? 0,
                residues: last.residues?.name.length ?? 0,
                chains: last.chains?.id.length ?? 0,
                kbPerMs: +(input.bytes / 1024 / median(times)).toFixed(1),
            },
            notes: `${(input.bytes / 1048576).toFixed(1)} MB text · ${iterations} runs, warm`,
        });
    }

    return rows;
}

export const meta = {
    id: 'parser',
    title: 'Node 解析（@wmv/parser MDR）',
    datasets: ['1crn', '4hhb', '6lu7', '5a9z', 'aspirin', 'caffeine', '9y4h'],
};


