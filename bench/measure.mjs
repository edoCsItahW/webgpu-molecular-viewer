// 主基准：SDF（真实 RDKit 链路）+ PDB（绕过 Pyodide 的注入链路）+ 降级路径
// 输出 bench/out/measure.json 与截图
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {openApp, waitEngine, loadSdf, injectPdb, readHud, measureFps, installLongTaskObserver, takeLongTasks} from './lib.mjs';
import {readPdbFile} from './pdb.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, {recursive: true});

const SDF_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/SDF/assets';
const PDB_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets';

const SDF_CASES = [
    {id: 'sdf-ethanol', file: '乙醇-702.sdf'},
    {id: 'sdf-aspirin', file: '阿司匹林-2244.sdf'},
    {id: 'sdf-caffeine', file: '咖啡因-2519.sdf'},
    {id: 'sdf-atp', file: 'ATP-5957.sdf'},
    {id: 'sdf-imatinib', file: '伊马替尼-5291.sdf'},
];

const PDB_CASES = [
    {id: 'pdb-1crn', file: '小蛋白-1CRN.pdb'},
    {id: 'pdb-1ubq', file: '泛素-1UBQ.pdb'},
    {id: 'pdb-1aki', file: '溶菌酶-1AKI.pdb'},
    {id: 'pdb-4hhb', file: '血红蛋白-4HHB.pdb'},
];

const results = {meta: {}, sdf: [], pdb: [], fallback: {}, notes: []};

function save() {
    writeFileSync(join(OUT, 'measure.json'), JSON.stringify(results, null, 2));
}

function withTimeout(promise, ms, label) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms}ms: ${label}`)), ms)),
    ]);
}

async function dragAndMeasure(page, durationMs = 2500) {
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const p = measureFps(page, durationMs);
    const steps = Math.floor(durationMs / 40);
    for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        await page.mouse.move(cx + Math.cos(a) * 180, cy + Math.sin(a) * 120);
        await page.waitForTimeout(40);
    }
    const fps = await p;
    await page.mouse.up();
    return fps;
}

async function pickAtCenter(page) {
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const points = [
        [0, 0], [0.04, -0.03], [-0.04, 0.03], [0.08, 0.05], [0, -0.08],
    ];

    for (const [dx, dy] of points) {
        const res = await page.evaluate(async () => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            store.selectAtom(null);
            window.__pick = {t0: 0, ms: null, id: null};
            const start = () => {
                window.__pick.t0 = performance.now();
                const tick = () => {
                    if (store.selectedAtomId !== null) {
                        window.__pick.ms = +(performance.now() - window.__pick.t0).toFixed(1);
                        window.__pick.id = store.selectedAtomId;
                    } else if (performance.now() - window.__pick.t0 < 8000) requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            };
            start();
        });
        await page.mouse.click(cx + dx * box.width, cy + dy * box.height);
        await page.waitForFunction(() => window.__pick.ms !== null, null, {timeout: 9000}).catch(() => {});
        const r = await page.evaluate(() => window.__pick);
        if (r.ms !== null) return r;
    }
    return {ms: null, id: null};
}

async function runSdfCase(page, c) {
    const text = readFileSync(join(SDF_DIR, c.file), 'utf8');
    await installLongTaskObserver(page);
    const load = await loadSdf(page, text, c.file);
    const tasks = await takeLongTasks(page);
    await page.waitForTimeout(700);
    const hud = await readHud(page);
    const idle = await measureFps(page, 1500);
    const drag = await dragAndMeasure(page, 2000);
    const pick = await pickAtCenter(page);
    await page.screenshot({path: join(SHOTS, `${c.id}.png`)});
    return {id: c.id, file: c.file, load, idle, drag, pick, hud, longTasks: tasks};
}

async function runPdbCase(page, c) {
    const pdb = readPdbFile(join(PDB_DIR, c.file));
    await installLongTaskObserver(page);
    const load = await injectPdb(page, {atoms: pdb.atoms, explicit: pdb.explicit, name: c.file.replace(/\.pdb$/, '')});
    const tasks = await takeLongTasks(page);
    await page.waitForTimeout(700);
    const hud = await readHud(page);
    const idle = await measureFps(page, 1500);
    const drag = await dragAndMeasure(page, 2000);
    const pick = await pickAtCenter(page);
    await page.screenshot({path: join(SHOTS, `${c.id}.png`)});
    return {id: c.id, file: c.file, atoms: pdb.atoms.length, conect: pdb.explicit.length, load, idle, drag, pick, hud, longTasks: tasks};
}

// ---- SDF ----
{
    const {h, page, logs} = await openApp({headless: true, port: 9370});
    const tNav = Date.now();
    const ready = await waitEngine(page);
    results.meta = {
        ...results.meta,
        engineReadyMs: ready.ms,
        navToReadyMs: Date.now() - tNav,
        webgpu: await page.evaluate(async () => {
            const a = await navigator.gpu.requestAdapter();
            return {hasGpu: 'gpu' in navigator, adapter: a ? (a.info?.description || a.info?.vendor || 'gpu') : null};
        }),
        pageResources: await page.evaluate(() => {
            const res = performance.getEntriesByType('resource');
            return {count: res.length, transferKB: +(res.reduce((s, r) => s + (r.transferSize || 0), 0) / 1024).toFixed(0)};
        }),
    };

    for (const c of SDF_CASES) {
        try {
            const r = await runSdfCase(page, c);
            results.sdf.push(r); save();
            console.log('SDF', c.id, JSON.stringify({parse: r.load.parseMs, settle: r.load.settleMs, atoms: r.load.atoms, bonds: r.load.bonds, idle: r.idle.fps, drag: r.drag.fps, pick: r.pick.ms}));
        } catch (e) {
            results.sdf.push({id: c.id, error: String(e)});
            console.log('SDF', c.id, 'ERROR', e.message);
        }
    }

    // 表示切换（球棍 → 空间填充 → 线框 → 球棍），在 ATP 上测
    try {
        const modes = [];
        for (const mode of ['spaceFill', 'wireframe', 'ballStick']) {
            const r = await page.evaluate(async (m) => {
                const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
                const store = useMoleculeStore();
                const t0 = performance.now();
                store.setDisplayMode(m);
                await new Promise((res) => setTimeout(res, 120));
                await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
                return {ms: +(performance.now() - t0).toFixed(0), inst: Number((document.querySelector('.mv-viewport-hud')?.textContent ?? '').match(/(\d+)\s*inst/)?.[1] ?? 0)};
            }, mode);
            const idle = await measureFps(page, 1200);
            modes.push({mode, ...r, fps: idle.fps});
            await page.screenshot({path: join(SHOTS, `sdf-atp-${mode}.png`)});
        }
        results.modes = modes;
        console.log('modes', JSON.stringify(modes));
    } catch (e) {
        results.modes = {error: String(e)};
    }

    results.meta.console = logs.filter((l) => l.type !== 'debug').slice(0, 30);
    await h.kill();
}

// ---- PDB ----
{
    const {h, page, logs} = await openApp({headless: true, port: 9371});
    await waitEngine(page);
    for (const c of PDB_CASES) {
        try {
            const r = await withTimeout(runPdbCase(page, c), 300000, c.id);
            results.pdb.push(r); save();
            console.log('PDB', c.id, JSON.stringify({atoms: r.atoms, bonds: r.load.bonds, bondsMs: r.load.bondsMs, settle: r.load.settleMs, idle: r.idle.fps, drag: r.drag.fps, pick: r.pick.ms}));
        } catch (e) {
            results.pdb.push({id: c.id, error: String(e)});
            console.log('PDB', c.id, 'ERROR', e.message);
        }
    }

    // PDB 真实导入（Pyodide/CDN）失败路径：记录耗时与错误信息
    try {
        const pdbText = readFileSync(join(PDB_DIR, '小蛋白-1CRN.pdb'), 'utf8');
        const t0 = Date.now();
        const r = await page.evaluate(async (text) => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            const t = performance.now();
            let error = null;
            try {
                await store.loadFromFile(new File([text], '1CRN.pdb'));
            } catch (e) {
                error = String(e && e.message ? e.message : e);
            }
            return {ms: +(performance.now() - t).toFixed(0), error, atoms: store.atomCount};
        }, pdbText);
        results.pdbImport = {...r, wallMs: Date.now() - t0};
        console.log('PDB import (Pyodide path):', JSON.stringify(results.pdbImport));
    } catch (e) {
        results.pdbImport = {error: String(e)};
    }

    results.meta.pdbConsole = logs.filter((l) => l.type !== 'debug').slice(0, 40);
    await h.kill();
}

writeFileSync(join(OUT, 'measure.json'), JSON.stringify(results, null, 2));
console.log('written', join(OUT, 'measure.json'));

