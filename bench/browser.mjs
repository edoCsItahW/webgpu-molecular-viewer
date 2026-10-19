// 启动器：独立 Chrome 进程 + CDP（Playwright 自带的 pipe 调试通道在受限环境下不可用）
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';

const require = createRequire('E:/code/webgpu-molecular-viewer/code/frontend/mol-vista/package.json');
const {chromium} = require('@playwright/test');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export const WORK = 'E:\\code\\webgpu-molecular-viewer\\bench';

/**
 * @param {object} opts
 * @param {boolean} [opts.headless]
 * @param {number} [opts.port]
 * @param {string[]} [opts.args]
 */
export async function launchChrome({headless = true, port = 9333, args = []} = {}) {
    const profileDir = join(WORK, `.chrome-profile-${port}`);
    rmSync(profileDir, {recursive: true, force: true});
    mkdirSync(profileDir, {recursive: true});

    const chromeArgs = [
        headless ? '--headless=new' : '--start-maximized',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--window-size=1600,1000',
        ...args,
        'about:blank',
    ];

    const proc = spawn(CHROME, chromeArgs, {stdio: 'ignore', windowsHide: true});

    let version = null;
    for (let i = 0; i < 100; i++) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) {
                version = await res.json();
                break;
            }
        } catch {
            /* not up yet */
        }
        await new Promise((r) => setTimeout(r, 200));
    }
    if (!version) throw new Error('Chrome DevTools endpoint did not come up');

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    return {
        browser,
        version,
        kill: async () => {
            try {
                await browser.close();
            } catch {
                /* ignore */
            }
            try {
                spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], {stdio: 'ignore'});
            } catch {
                /* ignore */
            }
        },
    };
}
