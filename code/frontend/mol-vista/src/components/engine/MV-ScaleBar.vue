<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-scale-bar mv-mono mvsb-bar" role="meter" :aria-label="`比例尺 ${label}`">
        <span class="mvsb-line" :style="{ width: width + 'px' }" />
        <span class="mvsb-text">{{ label }}</span>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ScaleBar.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:20
 * @desc 视口比例尺（右下浮层）。父级依据当前相机距离计算 width + label 后传入。
 * @copyright CC BY-NC-SA
 * */
withDefaults(defineProps<{
    /** 线段像素宽度 */
    width?: number;
    /** 文本（如 "10 Å"） */
    label?: string;
}>(), {
    width: 64,
    label: ''
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-scale-bar
    display: flex
    flex-direction: column
    align-items: center
    gap: 4px
    font-size: 10px
    color: var(--fg-muted)

.mvsb-line
    position: relative
    height: 1px
    background: currentColor

    &::before,
    &::after
        content: ''
        position: absolute
        top: -3px
        width: 1px
        height: 7px
        background: currentColor

    &::before
        left: 0

    &::after
        right: 0

.mvsb-text
    line-height: 1
</style>
