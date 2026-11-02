// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file browser.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 独立 Chrome + CDP 启动器。Playwright pipe 在受限环境不可用，故用系统 Chrome。
 *       Chrome 路径可通过 CHROME_PATH 覆盖；默认从常见安装目录探测。
 * */
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {APP_ROOT, CACHE_ROOT, ensureCache} from './env.mjs';

const require = createRequire(join(APP_ROOT, 'package.json'));
const {chromium} = require('@playwright/test');

const CANDIDATES = [
    process.env.CHROME_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google/Chrome/Application/chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google/Chrome/Application/chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].filter(Boolean);

export function findChrome() {
    const found = CANDIDATES.find(candidate => existsSync(candidate));

    if (!found) throw new Error('Chrome not found; set CHROME_PATH');

    return found;
}

/**
 * @param {{headless?: boolean, port?: number, args?: string[]}} [options]
 */
export async function launchChrome({headless = true, port = 9333, args = []} = {}) {
    ensureCache();

    const chrome = findChrome();
    const profileDir = join(CACHE_ROOT, `.chrome-profile-${port}`);

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
        '--disable-frame-rate-limit',
        '--disable-gpu-vsync',
        ...args,
        'about:blank',
    ];

    const proc = spawn(chrome, chromeArgs, {stdio: 'ignore', windowsHide: true});

    let version = null;

    for (let i = 0; i < 100; i++) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/json/version`);

            if (response.ok) {
                version = await response.json();
                break;
            }
        } catch {
            /* not up yet */
        }

        await new Promise(resolve => setTimeout(resolve, 200));
    }

    if (!version) throw new Error('Chrome DevTools endpoint did not come up');

    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);

    return {
        browser,
        version,
        chrome,
        async kill() {
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

export async function openPage(browser) {
    const context = browser.contexts()[0] ?? (await browser.newContext());

    const page = await context.newPage();

    page.setDefaultTimeout(120000);

    return page;
}

