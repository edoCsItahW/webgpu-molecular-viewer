// 中间规模：6LU7(2500 原子) 与 1IEP(4710 原子) 的真实导入 + 帧率，补全规模曲线
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {openApp, waitEngine, measureFps, readHud} from './lib.mjs';

const PDB_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets';
const CASES = [
    {id: 'pdb-6lu7', file: 'SARS-CoV-2 主蛋白酶 + 抑制剂 N3-6LU7.pdb'},
    {id: 'pdb-1iep', file: 'Abl 激酶 + 伊马替尼-1IEP.pdb'},
];

const results = [];
const {h, page} = await openApp({headless: true, port: 9380});
await waitEngine(page);

for (const c of CASES) {
    const text = readFileSync(join(PDB_DIR, c.file), 'utf8');
    let imp = null;
    for (let i = 0; i < 6 && !imp; i++) {
        imp = await page.evaluate(async ({text, name}) => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            const t0 = performance.now();
            try {
                await store.loadFromFile(new File([text], name));
                return {ms: +(performance.now() - t0).toFixed(0), atoms: store.atomCount, bonds: store.bondCount};
            } catch (e) {
                return {error: String(e && e.message ? e.message : e)};
            }
        }, {text, name: c.file});
        if (imp.error) {
            imp = null;
            await page.waitForTimeout(400);
        }
    }
    if (!imp) {
        console.log(c.id, 'FAILED');
        continue;
    }
    await page.waitForTimeout(600);
    const idle = await measureFps(page, 1500);
    const box = await page.locator('canvas').boundingBox();
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
    const hud = await readHud(page);
    results.push({id: c.id, file: c.file, import: imp, idle, drag, hud: hud.hud});
    console.log(c.id, JSON.stringify({atoms: imp.atoms, bonds: imp.bonds, importMs: imp.ms, idle: idle.fps, drag: drag.fps, p95: drag.p95, hud: hud.hud}));
    await page.screenshot({path: `E:/code/webgpu-molecular-viewer/bench/out/shots/${c.id}.png`});
}

writeFileSync('E:/code/webgpu-molecular-viewer/bench/out/measure-mid.json', JSON.stringify(results, null, 2));
await h.kill();
