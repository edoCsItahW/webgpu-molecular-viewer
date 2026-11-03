// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file md.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc GPU 分子动力学基准：4HHB 在 2×/4× 步速下的步/秒、帧率与能量。
 *       教学简化模型，数值只用于性能，不作为科研结果。
 * */
import {loadDataset, measureFps, readStats, setMode} from '../metrics.mjs';

export const meta = {
    id: 'md',
    title: 'GPU MD（4HHB）',
    datasets: ['4hhb'],
};

async function runCase(page, speed) {
    await page.evaluate(async value => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();

        store.simSpeed = value;
    }, speed);

    const start = await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();

        store.play();

        return {step: store.simStep, t: performance.now()};
    });

    const frames = await measureFps(page, 2400);

    const end = await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();

        store.pause();

        return {
            step: store.simStep,
            t: performance.now(),
            energy: {...store.energy},
        };
    });

    const seconds = (end.t - start.t) / 1000;
    const steps = end.step - start.step;

    return {
        speed,
        steps,
        seconds: +seconds.toFixed(2),
        stepsPerSec: +(steps / seconds).toFixed(1),
        fps: frames.fps,
        frameP95: frames.p95,
        energy: {
            potential: +end.energy.potential.toFixed(4),
            kinetic: +end.energy.kinetic.toFixed(4),
            total: +end.energy.total.toFixed(4),
            temperature: +end.energy.temperature.toFixed(1),
        },
    };
}

/**
 * @param {{page: import('playwright-core').Page, appUrl: string}} ctx
 */
export async function run({page, appUrl}) {
    await page.goto(appUrl, {waitUntil: 'load'});
    await loadDataset(page, '4hhb');
    await setMode(page, 'ballStick');
    await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();

        store.setFocus(null);
        store.showLabels = false;
        store.simHorizon = 100000;
        store.simLoop = false;
    });

    const rows = [];

    for (const speed of [2, 4]) {
        const result = await runCase(page, speed);
        const stats = await readStats(page);

        rows.push({
            scenario: 'md',
            case: `4hhb.speed${speed}`,
            metrics: {
                stepsPerSec: result.stepsPerSec,
                steps: result.steps,
                seconds: result.seconds,
                fps: result.fps,
                frameP95: result.frameP95,
                atoms: stats.atoms,
                potential: result.energy.potential,
                kinetic: result.energy.kinetic,
                total: result.energy.total,
                temperature: result.energy.temperature,
            },
            notes: 'teaching model · GPU compute + instanced render',
        });
    }

    return rows;
}
