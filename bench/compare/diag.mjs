import {writeFileSync} from 'node:fs';
import {launchChrome} from '../browser.mjs';

const {browser, kill} = await launchChrome({headless: true, port: 9379});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:7267/', {waitUntil: 'load'});
await page.waitForFunction(() => window.__ready === true);
console.log(await page.evaluate(() => window.loadMolecule('pdb', '小蛋白-1CRN.pdb')));
await page.waitForTimeout(300);

const uri = await page.evaluate(() => window.__viewer.pngURI());
console.log('uri length', uri.length, uri.slice(0, 30));
writeFileSync('E:/code/webgpu-molecular-viewer/bench/out/diag-3dmol-png.png', Buffer.from(uri.split(',')[1], 'base64'));

// 连续渲染下的帧率
const fps = await page.evaluate(() => new Promise((resolve) => {
    const v = window.__viewer;
    let running = true;
    const loop = () => { if (running) { v.render(); requestAnimationFrame(loop); } };
    requestAnimationFrame(loop);
    const t0 = performance.now(); const stamps = [];
    const measure = (t) => { stamps.push(t); if (t - t0 < 1500) requestAnimationFrame(measure); else { running = false; const iv=[]; for(let i=1;i<stamps.length;i++) iv.push(stamps[i]-stamps[i-1]); iv.sort((a,b)=>a-b); resolve({frames: stamps.length, fps:+((stamps.length-1)/((stamps[stamps.length-1]-stamps[0])/1000)).toFixed(1), p50: iv[Math.floor(iv.length/2)], p95: iv[Math.floor(iv.length*0.95)]}); } };
    requestAnimationFrame(measure);
}));
console.log('render loop fps', JSON.stringify(fps));
await kill();
