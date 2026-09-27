// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

import {test, expect} from '@playwright/test';

/**
 * 视口尺寸回归测试。
 *
 * 为什么需要它（两个真实踩过的坑，表现都是"主视口一片黑"）：
 *   1. `.mv-engine-viewport` 是 `.mv-molecule-viewer`（display: flex）的 flex item，
 *      而在流内容只有绝对定位的浮层 → 不写 flex 主轴尺寸时宽度塌成 0 → canvas 只有 1px 宽、整块区域什么都看不见。
 *   2. canvas 是 replaced element：只写 `position:absolute; inset:0` 不会被拉伸（仍按固有 300×150 摆放）；
 *      而把它的百分比尺寸放在 auto 尺寸的 grid 轨道上，会让"布局尺寸 ←→ 固有尺寸"互相决定，
 *      backbuffer 自我放大到 772×526504，超过 maxTextureDimension2D → 每帧 GPUValidationError → 画面全黑。
 *
 * 这两个坑的共同可观测特征是"canvas 的布局尺寸/backbuffer 尺寸异常"，所以这里把尺寸钉住。
 */

test('viewport canvas has a non-zero layout box', async ({page}) => {
    await page.goto('/');

    const canvas = page.locator('.mv-engine-viewport canvas');
    await expect(canvas).toBeVisible();

    const box = await canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return {cssWidth: c.clientWidth, cssHeight: c.clientHeight};
    });

    // 视口必须真的占据中间那一列（而不是塌成 0 宽）
    expect(box.cssWidth).toBeGreaterThan(320);
    expect(box.cssHeight).toBeGreaterThan(240);
});

test('engine keeps the canvas backbuffer in sync with its CSS size', async ({page}) => {
    await page.goto('/');

    // WebGPU 不可用时引擎不会接管 canvas（显示静态占位），尺寸断言在此环境没有意义
    // 注意：app 包没有引入 @webgpu/types，这里用结构化类型探测，避免依赖全局 GPU 类型
    const hasWebGPU = await page.evaluate(async () => {
        const gpu = (navigator as Navigator & {gpu?: {requestAdapter(): Promise<unknown>}}).gpu;

        return !!gpu && !!(await gpu.requestAdapter());
    });
    test.skip(!hasWebGPU, '当前环境没有可用的 WebGPU 适配器');

    const canvas = page.locator('.mv-engine-viewport canvas');

    // 等引擎接管：HUD 报到非零实例数
    await expect(page.locator('.mv-viewport-hud')).toContainText(/[1-9]\d*inst/, {timeout: 20000});

    const size = await canvas.evaluate((el) => {
        const c = el as HTMLCanvasElement;
        return {
            cssWidth: c.clientWidth,
            cssHeight: c.clientHeight,
            backingWidth: c.width,
            backingHeight: c.height,
            dpr: window.devicePixelRatio || 1
        };
    });

    // backbuffer = CSS 尺寸 × dpr（既不是默认的 300×150，也不是被放大到 10^5 量级）
    expect(size.backingWidth).toBeGreaterThanOrEqual(Math.floor(size.cssWidth * size.dpr) - 1);
    expect(size.backingWidth).toBeLessThanOrEqual(Math.ceil(size.cssWidth * size.dpr) + 1);
    expect(size.backingHeight).toBeGreaterThanOrEqual(Math.floor(size.cssHeight * size.dpr) - 1);

    // 超过 8192 就会触发 maxTextureDimension2D 校验错误（历史故障的特征值）
    expect(size.backingHeight).toBeLessThan(8192);
});
