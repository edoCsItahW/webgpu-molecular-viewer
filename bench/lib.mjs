// 基准测试公共库：打开原型、注入结构、测帧率/拾取
import {launchChrome} from './browser.mjs';

export const APP_URL = 'http://127.0.0.1:7265/';

export async function openApp({headless = true, port = 9360, initScript} = {}) {
    const h = await launchChrome({headless, port});
    const ctx = h.browser.contexts()[0] ?? (await h.browser.newContext());
    if (initScript) await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    page.setDefaultTimeout(120000);

    const logs = [];
    page.on('console', (m) => logs.push({type: m.type(), text: m.text()}));
    page.on('pageerror', (e) => logs.push({type: 'pageerror', text: e.message}));
    page.on('crash', () => logs.push({type: 'crash', text: 'page crashed'}));

    await page.goto(APP_URL, {waitUntil: 'load', timeout: 120000});
    return {h, page, logs};
}

export async function waitEngine(page, timeoutMs = 60000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        const ready = await page.evaluate(async () => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            const hud = document.querySelector('.mv-viewport-hud')?.textContent ?? '';
            const inst = Number(hud.match(/(\d+)\s*inst/)?.[1] ?? 0);
            return {atoms: store.atomCount, inst, hasGpu: 'gpu' in navigator};
        }).catch(() => null);
        if (ready && ready.atoms > 0 && ready.inst > 0) return {ms: Date.now() - t0, ...ready};
        await page.waitForTimeout(250);
    }
    throw new Error('engine not ready');
}

/** 页面内：统计一段时间内的 rAF 帧间隔（真实帧率，不受应用自报 HUD 影响） */
export async function measureFps(page, durationMs) {
    return page.evaluate((ms) => new Promise((resolve) => {
        const t0 = performance.now();
        const stamps = [];
        const loop = (t) => {
            stamps.push(t);
            if (t - t0 < ms) requestAnimationFrame(loop);
            else {
                const iv = [];
                for (let i = 1; i < stamps.length; i++) iv.push(stamps[i] - stamps[i - 1]);
                iv.sort((a, b) => a - b);
                const span = stamps[stamps.length - 1] - stamps[0];
                resolve({
                    frames: stamps.length,
                    spanMs: Math.round(span),
                    fps: +((stamps.length - 1) / (span / 1000)).toFixed(1),
                    p50: +iv[Math.floor(iv.length * 0.5)].toFixed(1),
                    p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1),
                    max: +iv[iv.length - 1].toFixed(1),
                });
            }
        };
        requestAnimationFrame(loop);
    }), durationMs);
}

/** 用应用自己的解析链路加载 SDF（RDKit WASM） */
export async function loadSdf(page, text, filename) {
    return page.evaluate(async ({text, filename}) => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();
        store.selectAtom(null);
        const heap0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const t0 = performance.now();
        let error = null;
        try {
            await store.loadFromFile(new File([text], filename));
        } catch (e) {
            error = String(e && e.message ? e.message : e);
        }
        const parseMs = performance.now() - t0;
        const t1 = performance.now();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const settleMs = performance.now() - t1;
        return {
            parseMs: +parseMs.toFixed(1),
            settleMs: +settleMs.toFixed(1),
            atoms: store.atomCount,
            bonds: store.bondCount,
            residues: store.residueCount,
            chains: store.chainCount,
            name: store.name,
            error,
            heapMb: performance.memory ? +((performance.memory.usedJSHeapSize - heap0) / 1048576).toFixed(1) : null,
        };
    }, {text, filename});
}

/**
 * 绕过 Pyodide 的 PDB 注入：用应用自己的 bond-perception + 元素表 + 表示重建链路。
 * atoms 已由 Node 侧解析（字段与 usePyodide 的返回一致）。
 */
export async function injectPdb(page, {atoms, explicit, name}) {
    return page.evaluate(async ({atoms, explicit, name}) => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const {perceiveBonds, normalizeBonds} = await import('/src/utils/bond-perception.ts');
        const {getElementColor, getElementRadius} = await import('/src/data/demo-molecule.ts');
        const store = useMoleculeStore();
        store.selectAtom(null);

        const t0 = performance.now();
        let bonds = [];
        let bondsMs = 0;
        try {
            const tB = performance.now();
            bonds = normalizeBonds(perceiveBonds(atoms, {explicit}), atoms.length);
            bondsMs = performance.now() - tB;
        } catch (e) {
            return {error: 'bond perception: ' + String(e)};
        }

        const mapped = atoms.map((a, i) => ({
            id: i,
            symbol: a.symbol,
            position: a.position,
            color: getElementColor(a.symbol),
            radius: getElementRadius(a.symbol),
            residue: a.residue,
            chain: a.chain,
            bfactor: a.bfactor,
            occupancy: a.occupancy,
        }));

        store.name = name;
        store.atoms = mapped;
        store.bonds = bonds;

        const appliedMs = performance.now() - t0;
        const t1 = performance.now();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const settleMs = performance.now() - t1;
        return {
            bondsMs: +bondsMs.toFixed(1),
            appliedMs: +appliedMs.toFixed(1),
            settleMs: +settleMs.toFixed(1),
            atoms: store.atomCount,
            bonds: store.bondCount,
            residues: store.residueCount,
            chains: store.chainCount,
            error: null,
        };
    }, {atoms, explicit, name});
}

/** 读 HUD / 状态栏文本（用于核对界面自报的性能数字） */
export async function readHud(page) {
    return page.evaluate(() => ({
        hud: document.querySelector('.mv-viewport-hud')?.innerText?.replace(/\s+/g, ' ') ?? '',
        status: document.querySelector('.mv-app-status-bar')?.innerText?.replace(/\s+/g, ' ') ?? '',
        placeholder: !!document.querySelector('svg.mev-molecule'),
        canvas: (() => {
            const c = document.querySelector('canvas');
            return c ? {cssW: c.clientWidth, cssH: c.clientHeight, w: c.width, h: c.height} : null;
        })(),
    }));
}

/** 在页面内安装长任务观察器 */
export async function installLongTaskObserver(page) {
    await page.evaluate(() => {
        window.__long = [];
        try {
            new PerformanceObserver((list) => {
                for (const e of list.getEntries()) window.__long.push({start: +e.startTime.toFixed(0), dur: +e.duration.toFixed(0)});
            }).observe({type: 'longtask', buffered: true});
        } catch {
            /* 不支持 longtask */
        }
    });
}

export async function takeLongTasks(page) {
    return page.evaluate(() => window.__long ?? []);
}
