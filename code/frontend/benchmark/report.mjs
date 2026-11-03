// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file report.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准报告生成：Markdown 表格 + 历史基线对比 + 口径说明。
 * */
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {BENCH_ROOT, OUT_ROOT} from './env.mjs';

const baseline = JSON.parse(readFileSync(join(BENCH_ROOT, 'baseline.json'), 'utf8'));

function findRow(rows, scenario, testCase) {
    return rows.find(row => row.scenario === scenario && row.case === testCase);
}

function pct(current, base) {
    if (current === null || current === undefined || !Number.isFinite(current)) return '—';

    const value = ((current - base) / base) * 100;

    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function table(headers, rows) {
    const head = `| ${headers.join(' | ')} |`;
    const sep = `| ${headers.map(() => '---').join(' | ')} |`;

    return [head, sep, ...rows].join('\n');
}

function compare(rows) {
    const tests = [
        {label: 'Node 解析 4HHB', scenario: 'parser', case: '4hhb', key: 'medianMs', metric: 'parser.4hhb.medianMs', unit: 'ms'},
        {label: 'Node 解析 5A9Z (150k)', scenario: 'parser', case: '5a9z', key: 'medianMs', metric: 'parser.5a9z.medianMs', unit: 'ms'},
        {label: '加载 5A9Z → 首帧', scenario: 'load', case: '5a9z', key: 'totalMs', metric: 'load.5a9z.totalMs', unit: 'ms'},
        {label: '4HHB 球棍帧率', scenario: 'render', case: '4hhb.ballStick', key: 'fps', metric: 'render.4hhb.ballStick.fps', unit: 'fps'},
        {label: '4HHB MD 2× 步/秒', scenario: 'md', case: '4hhb.speed2', key: 'stepsPerSec', metric: 'md.4hhb.speed2.stepsPerSec', unit: 'steps/s'}
    ];

    const lines = ['| 指标 | 历史 | 本次 | 变化 | 口径 |', '| --- | ---: | ---: | ---: | --- |'];

    for (const test of tests) {
        const row = findRow(rows, test.scenario, test.case);
        const current = row?.metrics?.[test.key] ?? null;
        const base = baseline.metrics[test.metric];

        lines.push(
            `| ${test.label} | ${base} ${test.unit} | ${current ?? '—'} ${test.unit} | ${pct(current, base)} | ${test.unit === 'fps' ? '历史 vsync / 当前 uncapped，仅参考' : '同机同数据'} |`
        );
    }

    return lines.join('\n');
}

/**
 * @param {{rows: object[], meta: object, startedAt: string, durationMs: number}} result
 */
export function renderReport(result) {
    const {rows, meta: runMeta} = result;
    const byScenario = new Map();

    for (const row of rows) {
        if (!byScenario.has(row.scenario)) byScenario.set(row.scenario, []);
        byScenario.get(row.scenario).push(row);
    }

    const sections = [];

    sections.push(`# MolVista 性能基准报告

- 生成时间：${result.startedAt}
- 运行时长：${(result.durationMs / 1000).toFixed(1)} s
- 提交：\`${runMeta.commit}\`
- 机器：${runMeta.cpu} · ${runMeta.memoryGb} GB
- 系统：${runMeta.platform}
- Chrome：${runMeta.chrome}
- GPU：${runMeta.gpu?.vendor ?? '—'} ${runMeta.gpu?.architecture ?? ''}
- 口径：Chrome 关闭帧率限制后采样 \`requestAnimationFrame\`（uncapped）；加载包含 90 ms 引擎防抖后的 settle。

## 1. 与历史基线对比

${compare(rows)}

> 当前 Chrome 以 \`--disable-frame-rate-limit --disable-gpu-vsync\` 启动，帧率不再被 vsync 截断；
> 历史 165 fps 是 vsync 口径，两者不能直接横比。解析/加载/MS 为同机同数据。

## 2. 解析（Node）

${table(
    ['数据集', '中位 ms', 'min', 'max', '原子', '键', '残基'],
    (byScenario.get('parser') ?? []).map(row => [
        row.case,
        row.metrics.medianMs,
        row.metrics.minMs,
        row.metrics.maxMs,
        row.metrics.atoms,
        row.metrics.bonds,
        row.metrics.residues,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 3. 浏览器加载

${table(
    ['数据集', '解析 ms', 'settle ms', '合计 ms', '原子', '堆增量 MB', 'MB'],
    (byScenario.get('load') ?? []).map(row => [
        row.case,
        row.metrics.parseMs,
        row.metrics.settledMs,
        row.metrics.totalMs,
        row.metrics.atoms,
        row.metrics.heapMb === null ? '—' : Number(row.metrics.heapMb).toFixed(1),
        row.metrics.mb,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 4. 渲染（rAF）

${table(
    ['用例', 'FPS', 'p95 帧 ms', 'inst', '备注'],
    (byScenario.get('render') ?? []).map(row => [
        row.case,
        row.metrics.fps,
        row.metrics.frameP95,
        row.metrics.inst,
        row.notes,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 5. GPU MD

${table(
    ['用例', '步/秒', 'FPS', 'p95 ms', '总能量'],
    (byScenario.get('md') ?? []).map(row => [
        row.case,
        row.metrics.stepsPerSec,
        row.metrics.fps,
        row.metrics.frameP95,
        row.metrics.total,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 6. 拾取

${table(
    ['用例', '中位 ms', '最大 ms', '命中数', '备注'],
    (byScenario.get('picking') ?? []).map(row => [
        row.case,
        row.metrics.medianMs ?? '—',
        row.metrics.maxMs ?? '—',
        row.metrics.samples,
        row.notes,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 7. UI 首屏

${table(
    ['用例', 'FPS', 'p95 ms', '备注'],
    (byScenario.get('ui') ?? []).map(row => [
        row.case,
        row.metrics.fps,
        row.metrics.frameP95,
        row.notes,
    ].join(' | ')).map(line => `| ${line} |`)
)}

## 8. 方法与限制

- 浏览器：独立 Chrome + CDP，WebGPU flags 开启；每个场景复用页面但重新导航。
- 帧率：页面内 rAF 采样 1.5–2.4 s；Chrome 关闭帧率限制，反映软件调度/渲染吞吐，不是 GPU timestamp。
- 加载：\`store.loadFromText\`（Worker + MDR）+ 180 ms settle + 两帧；不是冷启动首字节时间。
- 解析：Node 直接 import \`@wmv/parser/dist\`，预热后 3–5 次取中位数。
- MD 为教学简化模型；能量/温度只用于相对比较。
- 原始数据：\`out/results.json\`；截图：\`out/screenshots/\`。
`);

    const markdown = sections.join('\n\n');

    writeFileSync(join(OUT_ROOT, 'report.md'), markdown);
    writeFileSync(join(OUT_ROOT, 'results.json'), JSON.stringify(result, null, 2));

    return markdown;
}

