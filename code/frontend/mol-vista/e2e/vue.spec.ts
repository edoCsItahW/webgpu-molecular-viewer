// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

import { test, expect } from '@playwright/test';

/**
 * MolVista 主应用端到端测试。
 * 验证：应用骨架（顶栏 / 左栏 / 视口 / 右栏 / 状态栏）正常渲染，
 *       inspector 三 tab 可切换，结构面板导入按钮可加载演示分子。
 */
test('app shell renders with structure panel and inspector', async ({ page }) => {
    await page.goto('/');

    // 顶栏存在
    await expect(page.locator('.mv-app-top-bar')).toBeVisible();

    // 左栏结构面板存在，标题为"结构"
    const structurePanel = page.locator('.mv-app-structure-panel');
    await expect(structurePanel).toBeVisible();
    await expect(structurePanel.locator('.msp-title')).toHaveText('结构');

    // 视口 canvas 存在（唯一视口契约）
    await expect(page.locator('.mv-engine-viewport canvas')).toBeVisible();

    // 右栏 inspector 存在，三个 tab
    const inspector = page.locator('.mv-app-inspector');
    await expect(inspector).toBeVisible();
    const tabs = inspector.locator('.mv-tab-bar button');
    await expect(tabs).toHaveCount(3);
});

test('inspector tabs switch content', async ({ page }) => {
    await page.goto('/');

    const inspector = page.locator('.mv-app-inspector');

    // 默认在 inspect tab
    await expect(inspector.locator('.mv-inspect-tab')).toBeVisible();

    // 切换到 render tab
    await inspector.getByText('渲染').click();
    await expect(inspector.locator('.mv-render-tab')).toBeVisible();

    // 切换到 simulate tab
    await inspector.getByText('模拟').click();
    await expect(inspector.locator('.mv-simulate-tab')).toBeVisible();
});

test('import button loads demo molecule into structure panel', async ({ page }) => {
    await page.goto('/');

    // 点击导入按钮
    await page.locator('.mv-app-structure-panel .mv-icon-button').last().click();

    // 结构面板应显示链列表（演示分子含链 A）
    const chainList = page.locator('.msp-chain-list');
    await expect(chainList).toBeVisible();
});
