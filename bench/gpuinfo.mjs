import {launchChrome} from './browser.mjs';

const {browser, version, kill} = await launchChrome({headless: !process.argv.includes('--headed')});
const ctx = browser.contexts()[0] ?? (await browser.newContext());
const page = await ctx.newPage();
await page.goto('chrome://gpu');
await page.waitForTimeout(1500);
const text = await page.evaluate(() => document.body.innerText);
const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
const keep = lines.filter((l) =>
    /WebGPU|Vulkan|D3D12|Direct3D|OpenGL|ANGLE|Canvas|Graphics Feature|GPU0|Driver|Problems|Disabled|Unavailable|Hardware/i.test(l)
);
console.log('chrome', version.Browser);
console.log(keep.slice(0, 120).join('\n'));
await page.screenshot({path: 'E:/code/webgpu-molecular-viewer/bench/out/gpu.png', fullPage: true}).catch(() => {});
await kill();
