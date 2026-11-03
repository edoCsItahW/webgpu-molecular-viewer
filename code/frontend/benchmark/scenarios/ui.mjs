// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ui.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc UI 冒烟性能：官网首页与工作台首屏的 rAF 帧率、画布尺寸与 WebGPU 状态。
 * */
import {measureFps, readGpu} from '../metrics.mjs';

export const meta = {
    id: 'ui',
    title: 'UI 首屏（官网 / 工作台）',
    datasets: [],
};

/**
 * @param {{page: import('playwright-core').Page, appUrl: string, screenshot?: Function}} ctx
 */
export async function run({page, appUrl, screenshot}) {
    const rows = [];

    await page.goto(new URL('showcase', appUrl).href, {waitUntil: 'load'});
    await page.waitForTimeout(3000);

    const showcaseStats = await page.evaluate(() => ({
        canvas: !!document.querySelector('canvas'),
        sections: document.querySelectorAll('[data-section]').length,
        height: document.documentElement.scrollHeight,
        title: document.querySelector('.display')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    }));
    const showcaseFps = await measureFps(page, 2000);

    rows.push({
        scenario: 'ui',
        case: 'showcase',
        metrics: {
            fps: showcaseFps.fps,
            frameP95: showcaseFps.p95,
            canvas: showcaseStats.canvas ? 1 : 0,
            sections: showcaseStats.sections,
            documentHeight: showcaseStats.height,
        },
        notes: showcaseStats.title,
    });

    if (screenshot) await screenshot(page, 'ui-showcase.png');

    await page.goto(appUrl, {waitUntil: 'load'});
    await page.waitForTimeout(1800);

    const workbenchFps = await measureFps(page, 2000);
    const workbenchStats = await page.evaluate(() => ({
        canvas: !!document.querySelector('canvas'),
        title: document.querySelector('.matb-doc-name')?.textContent ?? '',
    }));
    const gpu = await readGpu(page);

    rows.push({
        scenario: 'ui',
        case: 'workbench',
        metrics: {
            fps: workbenchFps.fps,
            frameP95: workbenchFps.p95,
            canvas: workbenchStats.canvas ? 1 : 0,
            gpu: gpu?.vendor ?? gpu?.description ?? '',
        },
        notes: `default demo · ${workbenchStats.title}`,
    });

    return rows;
}
