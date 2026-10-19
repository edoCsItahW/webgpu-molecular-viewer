// PDB 真实链路（带重试）：jsdelivr 在本机网络下时通时断，逐次重试直到成功或放弃
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {openApp, waitEngine, readHud, measureFps, takeLongTasks, installLongTaskObserver} from './lib.mjs';

const OUT = 'E:/code/webgpu-molecular-viewer/bench/out';
const SHOTS = join(OUT, 'shots');
mkdirSync(SHOTS, {recursive: true});

const PDB_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets';
const CASES = [
    {id: 'real-pdb-1crn', file: '小蛋白-1CRN.pdb'},
    {id: 'real-pdb-1ubq', file: '泛素-1UBQ.pdb'},
    {id: 'real-pdb-1aki', file: '溶菌酶-1AKI.pdb'},
    {id: 'real-pdb-4hhb', file: '血红蛋白-4HHB.pdb'},
];

const results = {cases: [], attempts: []};
const save = () => writeFileSync(join(OUT, 'measure-pdb-real.json'), JSON.stringify(results, null, 2));

const {h, page, logs} = await openApp({headless: true, port: 9374});
await waitEngine(page);

async function tryImport(text, name, maxAttempts = 12) {
    for (let i = 1; i <= maxAttempts; i++) {
        const r = await page.evaluate(async ({text, name}) => {
            const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
            const store = useMoleculeStore();
            store.selectAtom(null);
            const t0 = performance.now();
            let error = null;
            try {
                await store.loadFromFile(new File([text], name));
            } catch (e) {
                error = String(e && e.message ? e.message : e);
            }
            return {ms: +(performance.now() - t0).toFixed(0), error, atoms: store.atomCount, bonds: store.bondCount};
        }, {text, name});
        results.attempts.push({name, attempt: i, ...r});
        save();
        if (!r.error) return {...r, attempts: i};
        await page.waitForTimeout(300);
    }
    return null;
}

for (const c of CASES) {
    const text = readFileSync(join(PDB_DIR, c.file), 'utf8');
    await installLongTaskObserver(page);
    const imp = await tryImport(text, c.file);
    if (!imp) {
        results.cases.push({id: c.id, file: c.file, failed: true});
        console.log(c.id, 'FAILED after retries');
        continue;
    }

    const t1 = Date.now();
    await page.waitForTimeout(500);
    const hud = await readHud(page);
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

    await page.evaluate(async () => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();
        store.selectAtom(null);
        window.__pick = {t0: 0, ms: null, id: null};
        window.__pick.t0 = performance.now();
        const tick = () => {
            if (store.selectedAtomId !== null) {
                window.__pick.ms = +(performance.now() - window.__pick.t0).toFixed(1);
                window.__pick.id = store.selectedAtomId;
            } else if (performance.now() - window.__pick.t0 < 15000) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
    await page.mouse.click(cx, cy);
    await page.waitForFunction(() => window.__pick.ms !== null, null, {timeout: 16000}).catch(() => {});
    const pick = await page.evaluate(() => window.__pick);

    await page.screenshot({path: join(SHOTS, `${c.id}.png`)});
    const entry = {id: c.id, file: c.file, import: imp, hud, idle, drag, pick, longTasks: await takeLongTasks(page)};
    results.cases.push(entry);
    save();
    console.log(c.id, JSON.stringify({atoms: imp.atoms, bonds: imp.bonds, importMs: imp.ms, attempts: imp.attempts, settleAfter: Date.now() - t1, idle: idle.fps, drag: drag.fps, pick: pick.ms}));
}

results.resources = await page.evaluate(() =>
    performance.getEntriesByType('resource')
        .filter((r) => /pyodide|biopython|jsdelivr/i.test(r.name))
        .map((r) => ({name: r.name.replace(/^https?:\/\/[^/]+/, ''), kb: +((r.transferSize || r.encodedBodySize || 0) / 1024).toFixed(0), ms: +r.duration.toFixed(0)}))
);
results.console = logs.filter((l) => l.type !== 'debug').slice(0, 30);
save();
console.log('resources:', JSON.stringify(results.resources, null, 1));
await h.kill();
