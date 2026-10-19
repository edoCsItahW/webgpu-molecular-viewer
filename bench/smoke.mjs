// 冒烟：打开原型，确认 WebGPU 引擎是否真的初始化、页面有无报错、HUD 读数
import {launchChrome} from './browser.mjs';

const {browser, version, kill} = await launchChrome({headless: true, port: 9350});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));

const t0 = Date.now();
await page.goto('http://127.0.0.1:7265/', {waitUntil: 'load', timeout: 120000});
await page.waitForTimeout(6000);

const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const svg = document.querySelector('svg.mev-molecule');
    const hud = document.querySelector('.mv-viewport-hud')?.innerText ?? '';
    return {
        title: document.title,
        url: location.href,
        hasGpu: 'gpu' in navigator,
        canvas: canvas ? {cssW: canvas.clientWidth, cssH: canvas.clientHeight, w: canvas.width, h: canvas.height} : null,
        placeholderVisible: !!(svg && getComputedStyle(svg).display !== 'none'),
        hud,
        bodyText: document.body.innerText.slice(0, 600),
    };
});

console.log('load ms:', Date.now() - t0);
console.log('chrome:', version.Browser);
console.log(JSON.stringify(state, null, 2));
console.log('--- logs ---');
console.log(logs.slice(0, 60).join('\n'));
await page.screenshot({path: 'E:/code/webgpu-molecular-viewer/bench/out/smoke.png'});
await kill();
