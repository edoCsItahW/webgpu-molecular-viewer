// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file FrameStats.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 每帧渲染统计快照，供 UI 显示帧号、帧率与渲染循环状态
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */


/**
 * 每帧渲染统计快照。
 * 由 Renderer 在帧末组装并通过 onFrame 回调抛出，调用方只需读取，
 * 平均耗时的采样只在开启统计（enableStats）时累计。
 */
export interface FrameStats {
    /** 帧序号，从 0 开始自增 */
    frameIndex: number;

    /** 距上一帧的秒数（首帧为 0），用于驱动动画与阻尼 */
    deltaTime: number;

    /** 本帧 CPU 侧总耗时（毫秒），即 Renderer 一帧逻辑的耗时 */
    cpuMs: number;

    /** 最近最多 120 帧的滑动平均 CPU 耗时（毫秒）；未开启统计（enableStats）时为 0 */
    averageCpuMs: number;

    /** 渲染循环是否正在运行 */
    isRunning: boolean;
}
