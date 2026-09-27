<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <section class="mv-panel-section mvps-section">
        <header class="mvps-head">
            <h3 class="mvps-title">{{ title }}</h3>
            <div class="mvps-meta">
                <slot name="meta" />
            </div>
        </header>
        <div class="mvps-body">
            <slot />
        </div>
    </section>
</template>

<script setup lang="ts">
/**
 * @file MV-PanelSection.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:50
 * @desc 面板内分区。标题 + 可选 meta + 内容。左栏/右栏的所有 section 都用它包。
 * @copyright CC BY-NC-SA
 * */

defineProps<{
    /** 分区标题 */
    title: string;
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-panel-section
    padding: 12px
    border-bottom: 1px solid var(--line)

    &:last-child
        border-bottom: 0

.mvps-head
    display: flex
    align-items: center
    justify-content: space-between
    margin-bottom: 9px

.mvps-title
    font-size: 10px
    font-weight: 600
    letter-spacing: .12em
    text-transform: uppercase
    color: var(--fg-faint)

.mvps-meta
    font-size: 10px
    color: var(--fg-faint)
</style>
