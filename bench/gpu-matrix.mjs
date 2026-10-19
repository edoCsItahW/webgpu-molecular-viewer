import {launchChrome} from './browser.mjs';

const configs = [
    {name: 'default', args: []},
    {name: 'unsafe-webgpu', args: ['--enable-unsafe-webgpu']},
    {name: 'unsafe+vulkan', args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan']},
    {name: 'unsafe+d3d11', args: ['--enable-unsafe-webgpu', '--use-angle=d3d11']},
    {name: 'unsafe+feature-webgpu', args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU']},
];

const origins = ['http://127.0.0.1:19387/', 'data:text/html,<h1>x</h1>', 'about:blank'];

for (const cfg of configs) {
    let h;
    try {
        h = await launchChrome({headless: true, args: cfg.args, port: 9340 + configs.indexOf(cfg)});
    } catch (e) {
        console.log(cfg.name, 'launch failed', e.message);
        continue;
    }
    const ctx = h.browser.contexts()[0] ?? (await h.browser.newContext());
    const page = await ctx.newPage();
    for (const origin of origins) {
        try {
            await page.goto(origin, {waitUntil: 'domcontentloaded', timeout: 15000});
        } catch {
            /* ignore navigation errors */
        }
        const r = await page.evaluate(async () => {
            const out = {gpu: 'gpu' in navigator, secure: isSecureContext};
            if (!out.gpu) return out;
            try {
                const a = await navigator.gpu.requestAdapter();
                out.adapter = a ? (a.info?.description || a.info?.vendor || 'adapter') : null;
            } catch (e) {
                out.err = String(e);
            }
            return out;
        });
        console.log(cfg.name.padEnd(24), origin.padEnd(32), JSON.stringify(r));
    }
    await page.close();
    await h.kill();
}
