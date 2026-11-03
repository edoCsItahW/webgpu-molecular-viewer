// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file render.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 渲染基准：4HHB / 5A9Z 在四种表示下的真实 rAF 帧率。
 *       注意：浏览器 rAF 受 vsync 限制，60 fps 可能是上限而非 GPU 上限。
 * */
import {loadDataset, measureFps, readStats, setMode} from '../metrics.mjs';

export const meta = {
    id: 'render',
    title: '渲染帧率（4HHB / 5A9Z）',
    datasets: ['4hhb', '5a9z', '9y4h'],
};

const MODES = ['ballStick', 'spaceFill', 'wireframe', 'cartoon'];

/**
 * @param {{page: import('playwright-core').Page, appUrl: string, screenshot?: Function}} ctx
 */
export async function run({page, appUrl, screenshot}) {
    await page.goto(appUrl, {waitUntil: 'load'});
    const rows = [];

    for (const id of ['4hhb', '5a9z', '9y4h']) {
        await loadDataset(page, id);

        for (const mode of MODES) {
            await setMode(page, mode);

            const samples = [await measureFps(page, 1500), await measureFps(page, 1500), await measureFps(page, 1500)];
            const frames = samples.sort((a, b) => a.fps - b.fps)[1];
            const stats = await readStats(page);

            rows.push({
                scenario: 'render',
                case: `${id}.${mode}`,
                metrics: {
                    fps: frames.fps,
                    frameP50: frames.p50,
                    frameP95: frames.p95,
                    frameMax: frames.max,
                    runs: samples.length,
                    inst: stats.inst,
                    atoms: stats.atoms,
                    mode: stats.mode,
                    heapMb: stats.heapMb,
                },
                notes: 'uncapped rAF · median of 3',
            });

            if (screenshot && id === '4hhb') {
                await screenshot(page, `render-4hhb-${mode}.png`);
            }
        }
    }

    return rows;
}




