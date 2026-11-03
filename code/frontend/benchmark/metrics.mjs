// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file metrics.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 页面内测量原语：真实 rAF 帧率、加载耗时、HUD/内存、模式切换、GPU 信息。
 *       所有函数都只依赖应用公开的 store / DOM，不修改业务代码。
 * */
import {getDataset} from './datasets.mjs';

/** 读取 HUD / 画布 / store 的当前状态 */
export async function readStats(page) {
    return page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();
        const hudText = document.querySelector('.mv-viewport-hud')?.textContent?.replace(/\s+/g, ' ') ?? '';
        const inst = Number(hudText.match(/(\d+)\s*inst/)?.[1] ?? 0);

        return {
            atoms: store.atomCount,
            bonds: store.bondCount,
            residues: store.residueCount,
            chains: store.chainCount,
            mode: store.displayMode,
            focusResidues: store.focusResidues.length,
            inst,
            hud: hudText,
            heapMb: performance.memory
                ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1)
                : null,
            canvas: (() => {
                const canvas = document.querySelector('canvas');

                return canvas ? {width: canvas.width, height: canvas.height} : null;
            })(),
        };
    });
}

/**
 * 加载数据集；返回解析、settle（含引擎 90ms 防抖）与统计。
 * @param {import('playwright-core').Page} page
 * @param {string} id
 */
export async function loadDataset(page, id) {
    const dataset = getDataset(id);

    return page.evaluate(async ({id, format}) => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();
        const response = await fetch(`/__bench__/asset/${id}`);
        const text = await response.text();

        const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const t0 = performance.now();

        await store.loadFromText(text, `${id}.${format}`);

        const parseMs = performance.now() - t0;
        const t1 = performance.now();

        // 引擎 rebuild 是 90 ms 防抖；留 180 ms 后等两帧，测“可交互首帧”
        await new Promise(resolve => setTimeout(resolve, 180));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const settledMs = performance.now() - t1;

        return {
            id,
            parseMs: +parseMs.toFixed(1),
            settledMs: +settledMs.toFixed(1),
            totalMs: +(parseMs + settledMs).toFixed(1),
            atoms: store.atomCount,
            bonds: store.bondCount,
            residues: store.residueCount,
            chains: store.chainCount,
            mode: store.displayMode,
            heapMb: performance.memory
                ? +Math.max(0, performance.memory.usedJSHeapSize - heap0) / 1048576
                : null,
            bytes: new Blob([text]).size,
        };
    }, {id, format: dataset.format});
}

/**
 * 真实 rAF 帧率（不读取应用自报的 HUD fps）。
 * @param {import('playwright-core').Page} page
 * @param {number} durationMs
 */
export async function measureFps(page, durationMs = 2000) {
    return page.evaluate(ms => new Promise(resolve => {
        const stamps = [];
        const start = performance.now();

        const loop = now => {
            stamps.push(now);

            if (now - start < ms) {
                requestAnimationFrame(loop);
                return;
            }

            const intervals = [];

            for (let i = 1; i < stamps.length; i++) intervals.push(stamps[i] - stamps[i - 1]);

            intervals.sort((a, b) => a - b);

            const span = stamps[stamps.length - 1] - stamps[0];

            resolve({
                frames: stamps.length,
                spanMs: Math.round(span),
                fps: +((stamps.length - 1) / (span / 1000)).toFixed(1),
                p50: +intervals[Math.floor(intervals.length * 0.5)].toFixed(2),
                p95: +intervals[Math.floor(intervals.length * 0.95)].toFixed(2),
                max: +intervals[intervals.length - 1].toFixed(2),
            });
        };

        requestAnimationFrame(loop);
    }), durationMs);
}

/** 切换显示模式，等重建完成 */
export async function setMode(page, mode) {
    await page.evaluate(async value => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');

        useMoleculeStore().setDisplayMode(value);
    }, mode);

    await page.waitForTimeout(200);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** GPU 适配器信息 */
export async function readGpu(page) {
    return page.evaluate(async () => {
        if (!navigator.gpu) return null;

        const adapter = await navigator.gpu.requestAdapter();

        if (!adapter) return null;

        return {
            ...(adapter.info ?? {}),
            features: [...adapter.features].sort(),
        };
    });
}

/** 页面导航并等待 load */
export async function gotoApp(page, url) {
    await page.goto(url, {waitUntil: 'load', timeout: 120000});
}

