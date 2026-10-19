// 微基准 E：draw-call 压力扫描（关闭 vsync，固定帧数，CPU 提交与 GPU timestamp 分开计时）
import {writeFileSync} from 'node:fs';
import {launchChrome} from '../browser.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const POINTS = [
    {draws: 2, frames: 120},
    {draws: 1000, frames: 120},
    {draws: 5000, frames: 80},
    {draws: 10000, frames: 60},
    {draws: 20000, frames: 40},
    {draws: 50000, frames: 20},
];

const {browser, kill} = await launchChrome({
    headless: true,
    port: 9385,
    args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'],
});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const results = {points: []};

for (const api of ['webgpu', 'webgl2']) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto('http://127.0.0.1:7268/', {waitUntil: 'load'});
    await page.waitForFunction(() => !!window.BENCH);
    console.log('init', api, JSON.stringify(await page.evaluate((a) => window.BENCH.init(a, 'instanced'), api)));

    for (const p of POINTS) {
        try {
            const r = await page.evaluate(([d, f]) => window.BENCH.sweep(d, f), [p.draws, p.frames]);
            results.points.push({api, ...r});
            console.log(api, JSON.stringify(r));
        } catch (e) {
            results.points.push({api, draws: p.draws, error: String(e)});
            console.log(api, p.draws, 'ERROR', e.message);
        }
    }
    if (logs.length) console.log(api, 'logs:', logs.slice(0, 6).join('\n'));
    results[`${api}Info`] = await page.evaluate(() => window.BENCH.info());
    await page.close();
}

writeFileSync(`${OUT}/micro-sweep.json`, JSON.stringify(results, null, 2));
await kill();
