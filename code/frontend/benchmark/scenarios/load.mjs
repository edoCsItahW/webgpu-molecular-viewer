// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file load.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 浏览器端加载基准：Worker 解析 + MDR + 引擎 rebuild + 首帧。
 * */
import {loadDataset} from '../metrics.mjs';

export const meta = {
    id: 'load',
    title: '浏览器加载（解析 → 首帧）',
    datasets: ['1crn', '4hhb', '6lu7', '5a9z', 'aspirin', '9y4h'],
};

/**
 * @param {{page: import('playwright-core').Page, appUrl: string}} ctx
 */
export async function run({page, appUrl, datasets}) {
    await page.goto(appUrl, {waitUntil: 'load'});

    // 预热：先加载 1CRN，避免把第一次 wasm/worker 初始化算进 4HHB
    await loadDataset(page, '1crn');

    const rows = [];

    const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

    for (let index = 0; index < datasets.length; index++) {
        const dataset = datasets[index];
        const runs = dataset.id === '5a9z' ? 1 : 2;
        const samples = [];

        // 每个数据集从干净页面开始，避免上一个 150k 场景的堆/Worker 影响
        if (index > 0) await page.goto(appUrl, {waitUntil: 'load'});

        for (let i = 0; i < runs; i++) samples.push(await loadDataset(page, dataset.id));

        const last = samples[samples.length - 1];

        rows.push({
            scenario: 'load',
            case: dataset.id,
            metrics: {
                parseMs: +Math.min(...samples.map(sample => sample.parseMs)).toFixed(1),
                settledMs: +Math.min(...samples.map(sample => sample.settledMs)).toFixed(1),
                totalMs: +Math.min(...samples.map(sample => sample.totalMs)).toFixed(1),
                runs,
                atoms: last.atoms,
                bonds: last.bonds,
                residues: last.residues,
                chains: last.chains,
                heapMb: +Math.max(0, last.heapMb ?? 0).toFixed(1),
                mode: last.mode,
                mb: +(last.bytes / 1048576).toFixed(2),
            },
            notes: `${dataset.label} · ${(last.bytes / 1024).toFixed(0)} KB · best of ${runs}`,
        });
    }

    return rows;
}





