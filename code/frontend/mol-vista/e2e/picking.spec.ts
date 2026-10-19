// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

import {test, expect, type Page} from '@playwright/test';

/**
 * 点击拾取的端到端回归测试。
 *
 * 为什么需要它：拾取是一条很长的链路（picking 选项 → 声明 pick-id 与深度纹理 → Mesh.objectId 写入
 * uniform 第 19 槽 → 指针事件 → requestPick → pass 绘制 id → afterSubmit 里回读 → 反解成原子索引 → 选中高亮）。
 * 其中任何一环缺失的表现都是"点击没反应且不报错"，只看单测很难发现（`issues.md` #35/#36）。
 */

/** 等到引擎真的开始渲染（HUD 报到非零实例数） */
async function waitForEngine(page: Page): Promise<boolean> {
    for (let i = 0; i < 50; i++) {
        const text = (await page.locator('.mv-viewport-hud').textContent().catch(() => '')) ?? '';
        const match = text.match(/(\d+)\s*inst/);

        if (match && Number(match[1]) > 0) return true;

        await page.waitForTimeout(400);
    }

    return false;
}

test('clicking an atom selects it and clicking empty space clears it', async ({page}) => {
    await page.goto('/');

    const hasWebGPU = await page.evaluate(async () => {
        const gpu = (navigator as Navigator & {gpu?: {requestAdapter(): Promise<unknown>}}).gpu;

        return !!gpu && !!(await gpu.requestAdapter());
    });
    test.skip(!hasWebGPU, '当前环境没有可用的 WebGPU 适配器');

    expect(await waitForEngine(page)).toBe(true);

    const canvas = page.locator('.mv-engine-viewport canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();

    // 选中后"检查"标签页会出现原子卡片（只有选中时才渲染，含 B-factor 行）
    const atomCard = page.locator('.mv-inspect-tab').getByText('B-factor');
    const width = box!.width;
    const height = box!.height;

    // reset() 用 setMousePosition 会把 pointerdown/click 一起派发到 canvas 上
    const mouse = page.mouse;
    const candidates: Array<[number, number]> = [
        [0.5, 0.5], [0.5, 0.45], [0.55, 0.5], [0.45, 0.5], [0.5, 0.55], [0.58, 0.42], [0.42, 0.58]
    ];

    let selected = false;

    for (const [fx, fy] of candidates) {
        await mouse.click(box!.x + width * fx, box!.y + height * fy);

        // 拾取至少延迟一帧，再用一次 mapAsync 回读
        await page.waitForTimeout(500);

        if (await atomCard.isVisible().catch(() => false)) {
            selected = true;
            break;
        }
    }

    expect(selected, '点击分子上的原子后应出现原子信息卡片').toBe(true);

    // 点左上角空白处应清除选择
    await mouse.click(box!.x + 6, box!.y + 6);
    await page.waitForTimeout(500);
    await expect(atomCard).toBeHidden();
});
