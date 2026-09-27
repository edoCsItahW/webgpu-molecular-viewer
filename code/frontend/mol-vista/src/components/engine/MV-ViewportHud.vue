<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-viewport-hud mvh-hud" role="status" :aria-label="ariaLabel">
        <span class="mvh-led" :class="{ 'is-ok': ready }" />
        <template v-for="(m, i) in metrics" :key="m.key">
            <span v-if="i > 0" class="mvh-sep" aria-hidden="true" />
            <span class="mv-mono mvh-mono">{{ m.value }}</span>
            <span class="mvh-unit">{{ m.unit }}</span>
        </template>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ViewportHud.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:20
 * @desc 视口 HUD（右上浮层）。显示 GPU 就绪状态 + 性能指标。
 *       父级应每 500ms 更新一次 metrics（ui.md §八：HUD 不每帧更新）。
 * @copyright CC BY-NC-SA
 * */
type Metric = {
    /** 唯一键，便于 diff */
    key: string;
    /** 显示文本（已格式化，如 "60.0" / "3.1k"） */
    value: string;
    /** 单位（fps / ms / inst） */
    unit: string;
};

withDefaults(defineProps<{
    /** WebGPU 设备是否就绪 */
    ready?: boolean;
    /** 性能指标列表 */
    metrics?: Metric[];
    /** 无障碍标签 */
    ariaLabel?: string;
}>(), {
    ready: false,
    metrics: () => [],
    ariaLabel: '视口性能'
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-viewport-hud
    display: flex
    align-items: center
    gap: 5px
    height: 26px
    padding: 0 9px
    border-radius: var(--r-3)
    +glass-surface()
    font-size: 10.5px
    color: var(--fg-muted)

.mvh-led
    width: 6px
    height: 6px
    border-radius: 50%
    background: var(--fg-faint)
    transition: background .2s var(--ease), box-shadow .2s var(--ease)

    &.is-ok
        background: var(--ok)
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 18%, transparent)

.mvh-mono
    font-size: 11px
    color: var(--fg)

.mvh-unit
    color: var(--fg-faint)
    font-size: 9.5px
    letter-spacing: .06em

.mvh-sep
    width: 1px
    height: 11px
    margin: 0 3px
    background: var(--line-strong)
</style>
