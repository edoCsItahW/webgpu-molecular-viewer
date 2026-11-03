// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file runner.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准运行器：
 *       - parser 在 Chrome/Server 启动前执行，避免渲染线程干扰；
 *       - 每个浏览器场景使用独立 Page，隔离 150k 场景留下的堆与 GPU 状态；
 *       - 统一输出 JSON/Markdown。
 * */
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {cpus, platform, release, totalmem} from 'node:os';
import {join} from 'node:path';
import {launchChrome, openPage} from './browser.mjs';
import {getDataset} from './datasets.mjs';
import {FRONTEND_ROOT, OUT_ROOT, ensureOut} from './env.mjs';
import {readGpu} from './metrics.mjs';
import {renderReport} from './report.mjs';
import {startServer} from './server.mjs';

import * as load from './scenarios/load.mjs';
import * as md from './scenarios/md.mjs';
import * as parser from './scenarios/parser.mjs';
import * as picking from './scenarios/picking.mjs';
import * as render from './scenarios/render.mjs';
import * as ui from './scenarios/ui.mjs';

const SCENARIOS = {parser, load, render, md, picking, ui};

export const SCENARIO_IDS = Object.keys(SCENARIOS);

function gitCommit() {
    try {
        return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
            cwd: FRONTEND_ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return 'unknown';
    }
}

function scenarioDatasets(scenario) {
    return (scenario.meta.datasets ?? []).map(id => getDataset(id));
}

/**
 * @param {{scenarios?: string[], port?: number, headless?: boolean, screenshots?: boolean}} [options]
 */
export async function runBenchmarks({
    scenarios = SCENARIO_IDS,
    port = 7271,
    headless = true,
    screenshots = true,
} = {}) {
    ensureOut();

    const shots = join(OUT_ROOT, 'screenshots');

    if (screenshots) mkdirSync(shots, {recursive: true});

    const unknown = scenarios.filter(id => !SCENARIOS[id]);

    if (unknown.length) throw new Error(`unknown scenarios: ${unknown.join(', ')}`);

    const startedAt = new Date().toISOString();
    const started = performance.now();
    const rows = [];
    const diagnostics = [];
    const browserScenarios = scenarios.filter(id => id !== 'parser');

    let server = null;
    let chrome = null;
    let gpu = null;

    try {
        // ---- 1. 纯 Node 解析：先于浏览器/渲染线程 ----
        if (scenarios.includes('parser')) {
            const scenario = SCENARIOS.parser;
            const scenarioStarted = performance.now();

            try {
                const resultRows = await scenario.run({datasets: scenarioDatasets(scenario)});

                rows.push(...resultRows.map(row => ({
                    ...row,
                    durationMs: Math.round(performance.now() - scenarioStarted),
                })));
                console.log(`[bench] parser: ${resultRows.length} rows`);
            } catch (error) {
                rows.push({scenario: 'parser', case: 'error', metrics: {}, notes: String(error)});
                console.error('[bench] parser failed:', error);
            }
        }

        // ---- 2. 浏览器场景：每个场景独立 Page ----
        if (browserScenarios.length) {
            server = await startServer({port});
            chrome = await launchChrome({headless, port: port + 100});

            for (const id of browserScenarios) {
                const scenario = SCENARIOS[id];
                const page = await openPage(chrome.browser);
                const seen = diagnostics.length;
                const scenarioStarted = performance.now();

                page.on('console', message => {
                    if (message.type() === 'error') {
                        diagnostics.push({type: 'console', text: message.text().slice(0, 500)});
                    }
                });
                page.on('pageerror', error => {
                    diagnostics.push({type: 'pageerror', text: error.message.slice(0, 500)});
                });

                try {
                    const resultRows = await scenario.run({
                        page,
                        appUrl: server.url,
                        datasets: scenarioDatasets(scenario),
                        screenshot: screenshots
                            ? async (target, name) => target.screenshot({path: join(shots, name)})
                            : undefined,
                    });

                    rows.push(...resultRows.map(row => ({
                        ...row,
                        durationMs: Math.round(performance.now() - scenarioStarted),
                    })));
                    console.log(`[bench] ${id}: ${resultRows.length} rows`);

                    if (diagnostics.length > seen) {
                        rows.push({
                            scenario: id,
                            case: 'diagnostics',
                            metrics: {},
                            notes: diagnostics.slice(seen).map(item => item.text).join(' | '),
                        });
                    }

                    try {
                        gpu = await readGpu(page);
                    } catch {
                        /* adapter info is optional */
                    }
                } catch (error) {
                    rows.push({
                        scenario: id,
                        case: 'error',
                        metrics: {},
                        notes: error instanceof Error ? error.message : String(error),
                    });
                    console.error(`[bench] ${id} failed:`, error);
                } finally {
                    await page.close();
                }
            }
        }

        const results = {
            startedAt,
            durationMs: Math.round(performance.now() - started),
            meta: {
                commit: gitCommit(),
                cpu: cpus()[0]?.model?.trim() ?? 'unknown',
                memoryGb: +(totalmem() / 1073741824).toFixed(1),
                platform: `${platform()} ${release()}`,
                chrome: chrome?.version?.Browser ?? 'not launched',
                gpu,
                scenarios,
                screenshots,
                isolatedPages: true,
            },
            rows,
            diagnostics,
        };

        renderReport(results);

        console.log(`[bench] report: ${join(OUT_ROOT, 'report.md')}`);

        return results;
    } finally {
        await chrome?.kill();
        await server?.close();
    }
}
