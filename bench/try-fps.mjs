// 试跑 2：帧率 + 拖拽 + 拾取
import {openApp, waitEngine, injectPdb, readHud, measureFps} from './lib.mjs';
import {readPdbFile} from './pdb.mjs';

const PDB = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets/泛素-1UBQ.pdb';

const {h, page, logs} = await openApp({headless: true, port: 9362});
console.log('engine ready:', (await waitEngine(page)).ms, 'ms');

const pdb = readPdbFile(PDB);
console.log('inject:', JSON.stringify(await injectPdb(page, {atoms: pdb.atoms, explicit: pdb.explicit, name: '1UBQ'})));

console.log('fps idle:', JSON.stringify(await measureFps(page, 2000)));

const box = await page.locator('canvas').boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

await page.mouse.move(cx, cy);
await page.mouse.down();
const dragPromise = measureFps(page, 3000);
for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    await page.mouse.move(cx + Math.cos(a) * 160, cy + Math.sin(a) * 100);
    await page.waitForTimeout(40);
}
console.log('fps drag:', JSON.stringify(await dragPromise));
await page.mouse.up();

// 拾取：先装观察器，再点击
await page.evaluate(async () => {
    const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
    const store = useMoleculeStore();
    store.selectAtom(null);
    window.__pick = {t0: performance.now(), ms: null, id: null};
    const tick = () => {
        if (store.selectedAtomId !== null) {
            window.__pick.ms = +(performance.now() - window.__pick.t0).toFixed(1);
            window.__pick.id = store.selectedAtomId;
        } else if (performance.now() - window.__pick.t0 < 5000) {
            requestAnimationFrame(tick);
        }
    };
    requestAnimationFrame(tick);
});
await page.mouse.click(cx, cy);
await page.waitForFunction(() => window.__pick.ms !== null, null, {timeout: 6000}).catch(() => {});
console.log('pick:', JSON.stringify(await page.evaluate(() => window.__pick)));
console.log('hud:', JSON.stringify(await readHud(page)));
console.log('logs:', JSON.stringify(logs.filter((l) => l.type !== 'debug').slice(0, 10)));
await h.kill();
