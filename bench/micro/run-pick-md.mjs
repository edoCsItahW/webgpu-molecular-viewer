// 微基准 B（拾取，实例化 vs 逐对象）与 C（MD compute vs CPU）
import {writeFileSync} from 'node:fs';
import {launchChrome} from '../browser.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const {browser, kill} = await launchChrome({headless: true, port: 9383});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const results = {pick: {}, md: []};

async function open(mode) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    await page.goto('http://127.0.0.1:7268/', {waitUntil: 'load'});
    await page.waitForFunction(() => !!window.BENCH);
    console.log('init', mode, JSON.stringify(await page.evaluate((m) => window.BENCH.init('webgpu', m), mode)));
    return {page, logs};
}

// 实例化架构
{
    const {page} = await open('instanced');
    results.pick.instanced = {};
    for (const kind of ['full', 'scissor', 'compute']) {
        await page.evaluate((k) => window.BENCH.pick(k, 3), kind);
        const r = await page.evaluate((k) => window.BENCH.pick(k, 20), kind);
        results.pick.instanced[kind] = r;
        console.log('instanced pick', kind, JSON.stringify({n: r.n, hits: r.hits, med: r.medMs, avg: r.avgMs, p95: r.p95Ms}));
    }
    await page.evaluate(() => window.BENCH.start());
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.BENCH.stop());
    await page.screenshot({path: `${OUT}/shots/micro-instanced.png`}).catch(() => {});

    for (const n of [1079, 2500, 4779]) {
        const r = await page.evaluate(([n, steps]) => window.BENCH.md(n, steps), [n, 10]);
        results.md.push(r);
        console.log('md', JSON.stringify(r));
    }
    await page.close();
}

// 逐对象架构（原型当前的做法）
{
    const {page} = await open('perObject');
    results.pick.perObject = {};
    for (const kind of ['full', 'scissor', 'compute']) {
        await page.evaluate((k) => window.BENCH.pick(k, 2), kind);
        const r = await page.evaluate((k) => window.BENCH.pick(k, 10), kind);
        results.pick.perObject[kind] = r;
        console.log('perObject pick', kind, JSON.stringify({n: r.n, hits: r.hits, med: r.medMs, avg: r.avgMs, p95: r.p95Ms}));
    }
    await page.close();
}

writeFileSync(`${OUT}/micro-pick-md.json`, JSON.stringify(results, null, 2));
await kill();
