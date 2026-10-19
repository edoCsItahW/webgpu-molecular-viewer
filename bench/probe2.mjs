// 探针：store 可从页面上下文访问 / CDN 是否可达 / 引擎适配器信息
import {launchChrome} from './browser.mjs';

const {browser, kill} = await launchChrome({headless: true, port: 9351});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:7265/', {waitUntil: 'load', timeout: 120000});
await page.waitForTimeout(3000);

const storeProbe = await page.evaluate(async () => {
    const mod = await import('/src/stores/molecule.store.ts');
    const store = mod.useMoleculeStore();
    return {atoms: store.atomCount, bonds: store.bondCount, name: store.name, mode: store.displayMode};
});

const net = await page.evaluate(async () => {
    const out = {};
    for (const url of [
        'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js',
        'https://unpkg.com/3dmol@2.5.4/build/3Dmol-min.js',
    ]) {
        const t0 = performance.now();
        try {
            const r = await fetch(url, {method: 'GET', mode: 'cors'});
            out[url] = {status: r.status, ms: Math.round(performance.now() - t0)};
        } catch (e) {
            out[url] = {error: String(e), ms: Math.round(performance.now() - t0)};
        }
    }
    return out;
});

const adapter = await page.evaluate(async () => {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return null;
    return {
        info: {...a.info},
        features: [...a.features],
        limits: {maxTextureDimension2D: a.limits.maxTextureDimension2D, maxBufferSize: a.limits.maxBufferSize, maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize},
    };
});

console.log('store:', JSON.stringify(storeProbe));
console.log('net:', JSON.stringify(net, null, 2));
console.log('adapter:', JSON.stringify(adapter, null, 2));
await kill();
