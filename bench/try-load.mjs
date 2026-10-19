// 试跑：一个 SDF + 一个 PDB 注入，确认链路与指标可采集
import {readFileSync} from 'node:fs';
import {openApp, waitEngine, loadSdf, injectPdb, readHud, FPS_FN} from './lib.mjs';
import {readPdbFile} from './pdb.mjs';

const SDF = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/SDF/assets/阿司匹林-2244.sdf';
const PDB = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets/小蛋白-1CRN.pdb';

const {h, page, logs} = await openApp({headless: true, port: 9361});
const ready = await waitEngine(page);
console.log('engine ready:', ready.ms, 'ms');

const t0 = Date.now();
const sdf = await loadSdf(page, readFileSync(SDF, 'utf8'), '阿司匹林-2244.sdf');
console.log('sdf load (cold, incl RDKit):', JSON.stringify(sdf), 'wall', Date.now() - t0);
console.log('hud:', JSON.stringify(await readHud(page)));

const fpsIdle = await page.evaluate(FPS_FN, 1500);
console.log('fps idle:', JSON.stringify(fpsIdle));
await page.screenshot({path: 'E:/code/webgpu-molecular-viewer/bench/out/try-sdf.png'});

const pdb = readPdbFile(PDB);
const inj = await injectPdb(page, {atoms: pdb.atoms, explicit: pdb.explicit, name: '1CRN'});
console.log('pdb inject:', JSON.stringify(inj));
console.log('hud:', JSON.stringify(await readHud(page)));

const fps2 = await page.evaluate(FPS_FN, 1500);
console.log('fps idle pdb:', JSON.stringify(fps2));
await page.screenshot({path: 'E:/code/webgpu-molecular-viewer/bench/out/try-pdb.png'});

console.log('logs:', logs.filter((l) => l.type !== 'debug').slice(0, 20));
await h.kill();
