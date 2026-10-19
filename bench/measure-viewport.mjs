// 判断 4HHB 的瓶颈是像素填充还是绘制对象：改视口大小看帧率是否变化
import {readFileSync} from 'node:fs';
import {openApp, waitEngine, measureFps} from './lib.mjs';

const PDB = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets/血红蛋白-4HHB.pdb';
const {h, page} = await openApp({headless: true, port: 9381});
await waitEngine(page);

const text = readFileSync(PDB, 'utf8');
let atoms = 0;
for (let i = 0; i < 75 && atoms !== 4779; i++) {
    const r = await page.evaluate(async ({text}) => {
        const {useMoleculeStore} = await import('/src/stores/molecule.store.ts');
        const store = useMoleculeStore();
        try {
            await store.loadFromFile(new File([text], '4HHB.pdb'));
            return {atoms: store.atomCount, err: null};
        } catch (e) {
            return {atoms: store.atomCount, err: String(e && e.message ? e.message : e)};
        }
    }, {text});
    atoms = r.atoms;
    if (atoms !== 4779) await page.waitForTimeout(400);
}
console.log('loaded atoms', atoms);
if (atoms !== 4779) {
    await h.kill();
    process.exit(1);
}
await page.waitForTimeout(1000);

for (const size of [{width: 1600, height: 1000}, {width: 900, height: 700}, {width: 640, height: 480}, {width: 1600, height: 1000}]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(800);
    const fps = await measureFps(page, 1500);
    const canvas = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        return {cssW: c.clientWidth, cssH: c.clientHeight, w: c.width, h: c.height};
    });
    console.log(JSON.stringify({size, canvas, fps: fps.fps, p95: fps.p95}));
}

await h.kill();
