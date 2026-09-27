<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <svg
        class="mv-axis-gizmo mvag-gizmo"
        viewBox="0 0 64 64"
        aria-hidden="true"
    >
        <!-- 底盘 -->
        <circle cx="32" cy="36" r="16" fill="none" stroke="var(--line-strong)" stroke-width="1" />
        <!-- Y 轴（红，向上） -->
        <line x1="32" y1="36" x2="32" y2="13" stroke="#e0574a" stroke-width="1.6" stroke-linecap="round" />
        <!-- X 轴（绿，向右） -->
        <line x1="32" y1="36" x2="52" y2="47" stroke="#3fbf8f" stroke-width="1.6" stroke-linecap="round" />
        <!-- Z 轴（蓝，向左） -->
        <line x1="32" y1="36" x2="12" y2="47" stroke="#5b9bff" stroke-width="1.6" stroke-linecap="round" />
        <!-- 标签 -->
        <text x="32" y="9" text-anchor="middle">Y</text>
        <text x="57" y="53" text-anchor="middle">X</text>
        <text x="7" y="53" text-anchor="middle">Z</text>
    </svg>
</template>

<script setup lang="ts">
/**
 * @file MV-AxisGizmo.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:20
 * @desc 视口坐标轴指示器（左下浮层）。当前为静态占位 —— 引擎接入后由相机四元数驱动旋转。
 * @copyright CC BY-NC-SA
 * */
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-axis-gizmo
    width: 60px
    height: 60px

    text
        font-family: var(--font-mono)
        font-variant-numeric: tabular-nums
        font-size: 9px
        fill: var(--fg-faint)
</style>
