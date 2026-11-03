// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file picking.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 拾取基准：点击 → store.selectedAtomId 就绪的端到端延迟（含一帧调度）。
 *       球棍走 GPU compute pick；卡通走 CPU ray-sphere。
 * */
import {loadDataset, setMode} from '../metrics.mjs';

export const meta = {
    id: 'picking',
    title: '拾取延迟（4HHB）',
    datasets: ['4hhb', '9y4h'],
};

async function pickAt(page, x, y) {
    await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');

        useMoleculeStore().selectAtom(null);
        window.__pickStart = performance.now();
    });

    await page.mouse.click(x, y);

    return page.evaluate(() => new Promise(resolve => {
        const started = window.__pickStart;
        const tick = async () => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();

            if (store.selectedAtomId !== null) {
                resolve({latencyMs: performance.now() - started, id: store.selectedAtomId});
            } else if (performance.now() - started > 1500) {
                resolve({latencyMs: null, id: null});
            } else {
                requestAnimationFrame(tick);
            }
        };

        requestAnimationFrame(tick);
    }));
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)];
}

async function measureMode(page, mode, offsets) {
    await setMode(page, mode);

    const box = await page.locator('canvas').boundingBox();
    const samples = [];

    for (const [dx, dy] of offsets) {
        const result = await pickAt(page, box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);

        if (result.latencyMs !== null) samples.push(result);
    }

    return {
        samples: samples.length,
        medianMs: samples.length ? +median(samples.map(s => s.latencyMs)).toFixed(1) : null,
        maxMs: samples.length ? +Math.max(...samples.map(s => s.latencyMs)).toFixed(1) : null,
        hitIds: samples.map(s => s.id),
    };
}

/**
 * @param {{page: import('playwright-core').Page, appUrl: string}} ctx
 */
export async function run({page, appUrl}) {
    await page.goto(appUrl, {waitUntil: 'load'});
    await loadDataset(page, '4hhb');

    await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');

        useMoleculeStore().setFocus(null);
    });

    const ball = await measureMode(page, 'ballStick', [
        [0, 0], [60, 30], [-50, 40], [30, -60], [90, -20],
    ]);

    const cartoon = await measureMode(page, 'cartoon', [
        [30, 20], [-40, 30], [60, -20],
    ]);

    return [
        {
            scenario: 'picking',
            case: '4hhb.ballStick',
            metrics: {...ball},
            notes: 'GPU compute pick · click→selection',
        },
        {
            scenario: 'picking',
            case: '4hhb.cartoon',
            metrics: {...cartoon},
            notes: 'CPU ray-sphere · click→selection',
        },
    ];
}
