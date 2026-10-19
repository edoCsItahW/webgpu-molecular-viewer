// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

import {test, expect, type Page} from '@playwright/test';

/**
 * 显示模式（表示层）回归测试。
 *
 * 背景：球棍模型的"棍"一开始根本没被构建 —— store 里早就有 `displayMode` / `bonds`，
 * 渲染页也早已接好线，但引擎从不读这些状态，于是只有原子球没有化学键（`issues.md` #37）。
 * 这里用"场景里的绘制对象数"把三种模式的几何组成钉死，避免同类问题再次静默发生：
 *   球棍 = 原子 + 键   空间填充 = 只有原子   线框 = 只有键
 */

async function waitForEngine(page: Page): Promise<string> {
    for (let i = 0; i < 50; i++) {
        const text = (await page.locator('.mv-viewport-hud').textContent().catch(() => '')) ?? '';
        const match = text.match(/(\d+)\s*inst/);

        if (match && Number(match[1]) > 0) return match[1];

        await page.waitForTimeout(400);
    }

    return '';
}

/** 从"检查"页的统计里读出原子数与化学键数（与页面显示的数字一致，避免在测试里硬编码数据） */
async function readCounts(page: Page): Promise<{atoms: number; bonds: number}> {
    const text = (await page.locator('.mv-inspect-tab').textContent()) ?? '';
    const atoms = Number(text.match(/原子\s*(\d+)/)?.[1] ?? 0);
    const bonds = Number(text.match(/化学键\s*(\d+)/)?.[1] ?? 0);

    return {atoms, bonds};
}

async function clickOption(page: Page, label: string): Promise<string> {
    const result = await page.evaluate((text) => {
        const tab = document.querySelector('.mv-render-tab');
        const target = tab
            ? [...tab.querySelectorAll<HTMLButtonElement>('.mvsc-btn')].find((b) => b.textContent?.trim() === text)
            : undefined;

        if (!target) return 'not-found';
        if (target.disabled) return 'disabled';

        target.click();

        return 'clicked';
    }, label);

    // 重建有 90ms 防抖
    await page.waitForTimeout(700);

    return result;
}

test('display modes build the right geometry (atoms / bonds / both)', async ({page}) => {
    await page.goto('/');

    const hasWebGPU = await page.evaluate(async () => {
        const gpu = (navigator as Navigator & {gpu?: {requestAdapter(): Promise<unknown>}}).gpu;

        return !!gpu && !!(await gpu.requestAdapter());
    });
    test.skip(!hasWebGPU, '当前环境没有可用的 WebGPU 适配器');

    expect(await waitForEngine(page)).not.toBe('');

    // 打开"渲染"标签页
    await page.locator('.mv-tab-bar button', {hasText: '渲染'}).click();

    const counts = await readCounts(page);
    expect(counts.atoms).toBeGreaterThan(0);
    expect(counts.bonds).toBeGreaterThan(0);

    const objectCount = async () => Number((await page.locator('.mv-viewport-hud').textContent())?.match(/(\d+)\s*inst/)?.[1] ?? 0);

    // 默认：球棍 = 原子 + 键（这是"只有球没有棍"那个 bug 的判据）
    expect(await objectCount()).toBe(counts.atoms + counts.bonds);

    // 空间填充：按化学惯例不画键
    expect(await clickOption(page, '空间填充')).toBe('clicked');
    expect(await objectCount()).toBe(counts.atoms);

    // 线框：不画球，只画键
    expect(await clickOption(page, '线框')).toBe('clicked');
    expect(await objectCount()).toBe(counts.bonds);

    // 切回球棍：几何完整恢复（重建不残留）
    expect(await clickOption(page, '球棍')).toBe('clicked');
    expect(await objectCount()).toBe(counts.atoms + counts.bonds);
});

test('options that the current structure cannot support are disabled with a reason', async ({page}) => {
    await page.goto('/');

    expect(await waitForEngine(page)).not.toBe('');

    await page.locator('.mv-tab-bar button', {hasText: '渲染'}).click();

    // 卡通需要二级结构；演示数据没有 → 必须"禁用 + 说明原因"，而不是点了没反应
    const cartoon = page.locator('.mv-render-tab .mvsc-btn', {hasText: '卡通'});
    await expect(cartoon).toBeDisabled();
    await expect(cartoon).toHaveAttribute('title', /二级结构/);
});
