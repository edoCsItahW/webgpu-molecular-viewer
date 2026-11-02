// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file cli.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准 CLI：
 *   node cli.mjs --scenario all
 *   node cli.mjs --scenario load,render --headed
 *   node cli.mjs --scenario md --no-screenshots
 * */
import {runBenchmarks, SCENARIO_IDS} from './runner.mjs';

const argv = process.argv.slice(2);

function option(name, fallback = null) {
    const index = argv.indexOf(`--${name}`);

    if (index < 0) return fallback;

    const value = argv[index + 1];

    return value && !value.startsWith('--') ? value : true;
}

const requested = option('scenario', 'all');
const scenarios = requested === 'all'
    ? SCENARIO_IDS
    : String(requested).split(',').map(value => value.trim()).filter(Boolean);

const port = Number(option('port', 7271));
const headless = !argv.includes('--headed');
const screenshots = !argv.includes('--no-screenshots');

console.log(`[bench] scenarios=${scenarios.join(',')} port=${port} headless=${headless}`);

try {
    const results = await runBenchmarks({scenarios, port, headless, screenshots});

    for (const row of results.rows) {
        const metrics = Object.entries(row.metrics)
            .map(([key, value]) => `${key}=${value}`)
            .join(' ');

        console.log(`${row.scenario.padEnd(8)} ${row.case.padEnd(30)} ${metrics}`);
    }

    console.log(`[bench] done in ${(results.durationMs / 1000).toFixed(1)}s`);
} catch (error) {
    console.error('[bench] failed:', error);
    process.exitCode = 1;
}
