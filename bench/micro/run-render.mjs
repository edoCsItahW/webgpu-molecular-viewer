// 微基准 A/D：渲染模式与 API 对比，每种配置重复 3 次取中位数
import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {launchChrome} from '../browser.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
mkdirSync(join(OUT, 'shots'), {recursive: true});

const {browser, kill} = await launchChrome({headless: true, port: 9382});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const results = {};

async function open() {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto('http://127.0.0.1:7268/', {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction(() => !!window.BENCH, null, {timeout: 30000});
    return {page, logs};
}

for (const [api, mode] of [['webgpu', 'instanced'], ['webgpu', 'perObject'], ['webgl2', 'instanced'], ['webgl2', 'perObject'], ['webgpu', 'perObjectStatic']]) {
    const key = `${api}-${mode}`;
    const {page, logs} = await open();
    try {
        const t0 = Date.now();
        const info = await page.evaluate(([a, m]) => window.BENCH.init(a, m), [api, mode]);
        const initMs = Date.now() - t0;
        const samples = [];
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => window.BENCH.start());
            await page.waitForTimeout(2500);
            samples.push(await page.evaluate(() => window.BENCH.stats(2000)));
            await page.evaluate(() => window.BENCH.stop());
            await page.waitForTimeout(150);
        }
        const med = (arr, f) => arr.map(f).sort((a, b) => a - b)[1];
        results[key] = {
            info, initMs, samples,
            fps: med(samples, (s) => s.fps),
            p95: med(samples, (s) => s.p95),
            cpuMs: med(samples, (s) => s.cpuMs),
        };
        console.log(key, JSON.stringify({initMs, fps: results[key].fps, p95: results[key].p95, cpuMs: results[key].cpuMs, samples: samples.map((s) => s.fps)}));
        await page.screenshot({path: join(OUT, 'shots', `micro-${api}-${mode}.png`)}).catch(() => {});
        if (logs.length) console.log(logs.slice(0, 6).join('\n'));
    } catch (e) {
        results[key] = {error: String(e)};
        console.log(key, 'ERROR', e.message);
        console.log(logs.slice(0, 10).join('\n'));
    }
    await page.close();
}

writeFileSync(join(OUT, 'micro-render.json'), JSON.stringify(results, null, 2));
await kill();


