// 微基准 G：重光栅化（overdraw 1/8/32/128），比较两 API 的光栅化吞吐
import {writeFileSync} from 'node:fs';
import {launchChrome} from '../browser.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const POINTS = [1, 8, 32, 128];
const FRAMES = 20;

const {browser, kill} = await launchChrome({
    headless: true,
    port: 9386,
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
    await page.evaluate((a) => window.BENCH.init(a, 'instanced'), api);

    for (const n of POINTS) {
        try {
            const r = await page.evaluate(([o, f]) => window.BENCH.overdraw(o, f), [n, FRAMES]);
            results.points.push({api, ...r});
            console.log(api, JSON.stringify(r));
        } catch (e) {
            results.points.push({api, overdraw: n, error: String(e)});
            console.log(api, n, 'ERROR', e.message);
        }
    }
    if (logs.length) console.log(api, 'logs:', logs.slice(0, 5).join('\n'));
    await page.close();
}

writeFileSync(`${OUT}/micro-overdraw.json`, JSON.stringify(results, null, 2));
await kill();
