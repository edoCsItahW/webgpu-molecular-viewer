// 补充测量：4HHB 各表示模式 / 缩放 / 拾取信息，以及 WebGPU 不可用的降级路径
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {openApp, waitEngine, readHud, measureFps} from './lib.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, {recursive: true});

const PDB_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets';
const results = {};
const save = () => writeFileSync(join(OUT, 'measure-extra.json'), JSON.stringify(results, null, 2));

// ---------- A. 4HHB 表示模式与缩放 ----------
{
    const {h, page, logs} = await openApp({headless: true, port: 9376});
    await waitEngine(page);

    const text = readFileSync(join(PDB_DIR, '血红蛋白-4HHB.pdb'), 'utf8');
    let imported = null;
    for (let i = 0; i < 6 && !imported; i++) {
        imported = await page.evaluate(async ({text}) => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            const t0 = performance.now();
            try {
                await store.loadFromFile(new File([text], '4HHB.pdb'));
                return {ms: +(performance.now() - t0).toFixed(0), atoms: store.atomCount, bonds: store.bondCount};
            } catch (e) {
                return {error: String(e && e.message ? e.message : e)};
            }
        }, {text});
        if (imported.error) {
            imported = null;
            await page.waitForTimeout(500);
        }
    }
    results.import4hhb = imported;

    const modes = [];
    for (const mode of ['ballStick', 'spaceFill', 'wireframe']) {
        const sw = await page.evaluate(async (m) => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            const t0 = performance.now();
            store.setDisplayMode(m);
            await new Promise((r) => setTimeout(r, 130));
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            const t1 = performance.now();
            const hud = document.querySelector('.mv-viewport-hud')?.textContent ?? '';
            return {ms: +(t1 - t0).toFixed(0), hud: hud.replace(/\s+/g, ' ')};
        }, mode);
        const idle = await measureFps(page, 1500);
        await page.screenshot({path: join(SHOTS, `4hhb-${mode}.png`)});
        modes.push({mode, ...sw, fps: idle.fps, p95: idle.p95});
        console.log('mode', mode, JSON.stringify({ms: sw.ms, fps: idle.fps, p95: idle.p95, hud: sw.hud}));
    }
    results.modes4hhb = modes;

    // 缩放：滚轮连续 zoom，测帧率
    await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        useMoleculeStore().setDisplayMode('ballStick');
        await new Promise((r) => setTimeout(r, 500));
    });
    const box = await page.locator('canvas').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    const zoomFps = measureFps(page, 2000);
    for (let i = 0; i < 20; i++) {
        await page.mouse.wheel(0, i < 10 ? -120 : 120);
        await page.waitForTimeout(50);
    }
    results.zoom4hhb = await zoomFps;
    console.log('zoom', JSON.stringify(results.zoom4hhb));

    // 选中信息：点击原子后读检查面板
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(600);
    results.inspect = await page.evaluate(() => ({
        text: document.querySelector('.mv-inspect-tab')?.innerText?.replace(/\s+/g, ' ').slice(0, 300) ?? '',
    }));
    console.log('inspect', JSON.stringify(results.inspect));
    await page.screenshot({path: join(SHOTS, '4hhb-selected.png')});

    results.console = logs.filter((l) => l.type !== 'debug').slice(0, 20);
    save();
    await h.kill();
}

// ---------- B. 浏览器无 WebGPU API ----------
{
    const {h, page, logs} = await openApp({
        headless: true,
        port: 9377,
        initScript: () => {
            try {
                delete Navigator.prototype.gpu;
            } catch {
                /* ignore */
            }
            Object.defineProperty(navigator, 'gpu', {value: undefined, configurable: true});
        },
    });
    await page.waitForTimeout(4000);
    results.noGpu = await page.evaluate(() => ({
        hasGpu: 'gpu' in navigator,
        placeholder: !!document.querySelector('svg.mev-molecule'),
        canvas: (() => {
            const c = document.querySelector('canvas');
            return c ? {w: c.width, h: c.height} : null;
        })(),
        status: document.querySelector('.mv-app-status-bar')?.innerText?.replace(/\s+/g, ' ') ?? '',
        hud: document.querySelector('.mv-viewport-hud')?.innerText?.replace(/\s+/g, ' ') ?? '',
        body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    }));
    results.noGpu.console = logs.filter((l) => l.type !== 'debug').slice(0, 20);
    await page.screenshot({path: join(SHOTS, 'fallback-no-webgpu.png')});
    console.log('noGpu', JSON.stringify(results.noGpu));
    save();
    await h.kill();
}

// ---------- C. 有 API 但没有适配器 ----------
{
    const {h, page, logs} = await openApp({
        headless: true,
        port: 9378,
        initScript: () => {
            if (navigator.gpu) {
                navigator.gpu.requestAdapter = async () => null;
            }
        },
    });
    await page.waitForTimeout(4000);
    results.noAdapter = await page.evaluate(() => ({
        placeholder: !!document.querySelector('svg.mev-molecule'),
        status: document.querySelector('.mv-app-status-bar')?.innerText?.replace(/\s+/g, ' ') ?? '',
        hud: document.querySelector('.mv-viewport-hud')?.innerText?.replace(/\s+/g, ' ') ?? '',
        body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
    }));
    results.noAdapter.console = logs.filter((l) => l.type !== 'debug').slice(0, 20);
    await page.screenshot({path: join(SHOTS, 'fallback-no-adapter.png')});
    console.log('noAdapter', JSON.stringify(results.noAdapter));
    save();
    await h.kill();
}
