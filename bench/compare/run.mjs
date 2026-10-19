// 3Dmol.js 基线：同一浏览器、同一视口、同一分子，测加载与"每帧都重绘"下的真实帧率
// 说明：3Dmol 默认是按需渲染；为了让对比与原型（每帧重绘）同口径，这里驱动它每帧 render()。
import {writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {launchChrome} from '../browser.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, {recursive: true});

const CASES = [
    {id: '3dmol-1crn', kind: 'pdb', file: '小蛋白-1CRN.pdb'},
    {id: '3dmol-1ubq', kind: 'pdb', file: '泛素-1UBQ.pdb'},
    {id: '3dmol-1aki', kind: 'pdb', file: '溶菌酶-1AKI.pdb'},
    {id: '3dmol-4hhb', kind: 'pdb', file: '血红蛋白-4HHB.pdb'},
    {id: '3dmol-atp', kind: 'sdf', file: 'ATP-5957.sdf'},
    {id: '3dmol-imatinib', kind: 'sdf', file: '伊马替尼-5291.sdf'},
];

const results = {cases: []};
const save = () => writeFileSync(join(OUT, 'compare-3dmol.json'), JSON.stringify(results, null, 2));

const {browser, kill} = await launchChrome({headless: true, port: 9375});
const ctx = browser.contexts()[0] ?? (await browser.newContext());

const measureFps = (page, ms) => page.evaluate((duration) => new Promise((resolve) => {
    const t0 = performance.now();
    const stamps = [];
    const loop = (t) => {
        stamps.push(t);
        if (t - t0 < duration) requestAnimationFrame(loop);
        else {
            const iv = [];
            for (let i = 1; i < stamps.length; i++) iv.push(stamps[i] - stamps[i - 1]);
            iv.sort((a, b) => a - b);
            const span = stamps[stamps.length - 1] - stamps[0];
            resolve({
                frames: stamps.length,
                fps: +((stamps.length - 1) / (span / 1000)).toFixed(1),
                p50: +iv[Math.floor(iv.length * 0.5)].toFixed(1),
                p95: +iv[Math.floor(iv.length * 0.95)].toFixed(1),
            });
        }
    };
    requestAnimationFrame(loop);
}), ms);

for (const c of CASES) {
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

    await page.goto('http://127.0.0.1:7267/', {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction(() => window.__ready === true, null, {timeout: 30000});

    const load = await page.evaluate(({kind, file}) => window.loadMolecule(kind, file), {kind: c.kind, file: c.file});
    await page.waitForTimeout(300);

    // 与原型的"每帧重绘"同口径
    await page.evaluate(() => {
        window.__running = true;
        const v = window.__viewer;
        const loop = () => {
            if (!window.__running) return;
            v.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    });

    const idle = await measureFps(page, 1500);

    const box = await page.locator('#container').boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    const p = measureFps(page, 2000);
    for (let i = 0; i < 50; i++) {
        const a = (i / 50) * Math.PI * 2;
        await page.mouse.move(cx + Math.cos(a) * 180, cy + Math.sin(a) * 120);
        await page.waitForTimeout(40);
    }
    const drag = await p;
    await page.mouse.up();

    await page.evaluate(() => {
        window.__running = false;
    });

    const uri = await page.evaluate(() => window.__viewer.pngURI());
    const png = Buffer.from(uri.split(',')[1], 'base64');
    writeFileSync(join(SHOTS, `${c.id}.png`), png);

    const entry = {id: c.id, file: c.file, load, idle, drag, pngBytes: png.length, logs: logs.slice(0, 10)};
    results.cases.push(entry);
    save();
    console.log(c.id, JSON.stringify({atoms: load.atoms, loadMs: load.ms, idle: idle.fps, drag: drag.fps, p95: drag.p95}));
    await page.close();
}

// 卡通表示（现有方案对蛋白的常规画法；原型的"卡通"当前是禁用状态）
{
    const page = await ctx.newPage();
    await page.goto('http://127.0.0.1:7267/', {waitUntil: 'load'});
    await page.waitForFunction(() => window.__ready === true);
    const r = await page.evaluate(() => window.loadCartoon('pdb', '血红蛋白-4HHB.pdb'));
    await page.evaluate(() => {
        window.__running = true;
        const v = window.__viewer;
        const loop = () => {
            if (!window.__running) return;
            v.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    });
    const idle = await measureFps(page, 1500);
    const uri = await page.evaluate(() => window.__viewer.pngURI());
    writeFileSync(join(SHOTS, '3dmol-4hhb-cartoon.png'), Buffer.from(uri.split(',')[1], 'base64'));
    results.cartoon = {id: '3dmol-4hhb-cartoon', load: r, idle};
    console.log('cartoon', JSON.stringify({loadMs: r.ms, atoms: r.atoms, idle: idle.fps}));
    save();
    await page.close();
}

await kill();
