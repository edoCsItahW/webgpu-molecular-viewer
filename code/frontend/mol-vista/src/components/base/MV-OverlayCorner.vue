<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div
        class="mv-overlay-corner mvoc-overlay"
        :class="[`is-${corner}`]"
    >
        <slot />
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-OverlayCorner.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:50
 * @desc 视口四角浮层定位。容器本身不拦截指针事件（ui.md §五：overlay 默认 pointer-events: none）。
 *       需要交互的子元素自行显式 pointer-events: auto。
 * @copyright CC BY-NC-SA
 * */

type Corner = 'tl' | 'tr' | 'bl' | 'br';

defineProps<{
    /** 浮层在视口四角中的位置 */
    corner: Corner;
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-overlay-corner
    position: absolute
    z-index: 2
    display: flex
    pointer-events: none

    &.is-tl
        top: 12px
        left: 12px

    &.is-tr
        top: 12px
        right: 12px

    &.is-bl
        bottom: 14px
        left: 14px

    &.is-br
        bottom: 14px
        right: 14px

    // 子元素需要交互时显式打开
    :deep(> *)
        pointer-events: auto
</style>
