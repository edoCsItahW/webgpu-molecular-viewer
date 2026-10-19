// 诊断：jsdelivr / unpkg 的 script 与 fetch 可用性（Pyodide 依赖 jsdelivr）
import {launchChrome} from './browser.mjs';

const {browser, kill} = await launchChrome({headless: true, port: 9373});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:7265/', {waitUntil: 'load', timeout: 60000});

const result = await page.evaluate(async () => {
    const testScript = (src, timeout = 15000) => new Promise((resolve) => {
        const s = document.createElement('script');
        let done = false;
        const finish = (v) => { if (!done) { done = true; s.remove(); resolve(v); } };
        s.onload = () => finish({ok: true});
        s.onerror = () => finish({ok: false});
        s.src = src;
        document.head.appendChild(s);
        setTimeout(() => finish({ok: false, timeout: true}), timeout);
    });
    const testFetch = async (url) => {
        const t0 = performance.now();
        try {
            const r = await fetch(url, {cache: 'no-store'});
            return {status: r.status, ms: Math.round(performance.now() - t0)};
        } catch (e) {
            return {error: String(e), ms: Math.round(performance.now() - t0)};
        }
    };
    const out = {};
    out.scriptJsdelivr = await testScript('https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js');
    out.scriptUnpkgPyodide = await testScript('https://unpkg.com/pyodide@0.29.5/pyodide.js');
    out.fetchJsdelivr = await testFetch('https://cdn.jsdelivr.net/pyodide/v0.29.5/full/pyodide.js');
    out.fetchUnpkgPyodide = await testFetch('https://unpkg.com/pyodide@0.29.5/pyodide.js');
    out.fetchUnpkgLock = await testFetch('https://unpkg.com/pyodide@0.29.5/pyodide-lock.json');
    return out;
});

console.log(JSON.stringify(result, null, 2));
await kill();
