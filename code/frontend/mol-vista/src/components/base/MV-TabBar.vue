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
        class="mv-tab-bar mvtb-tabs"
        role="tablist"
    >
        <button
            v-for="t in tabs"
            :key="t.value"
            type="button"
            class="mvtb-tab"
            :class="{ 'is-active': modelValue === t.value }"
            role="tab"
            :aria-selected="modelValue === t.value"
            @click="$emit('update:modelValue', t.value)"
        >
            {{ t.label }}
        </button>
    </div>
</template>

<script setup lang="ts" generic="T extends string">
/**
 * @file MV-TabBar.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:50
 * @desc 选项卡条。泛型 v-model，支持任意 string 枚举。
 * @copyright CC BY-NC-SA
 * */

defineProps<{
    /** 当前激活值（v-model） */
    modelValue: T;
    /** 选项列表 */
    tabs: { value: T; label: string }[];
}>();

defineEmits<{
    'update:modelValue': [value: T];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mvtb-tabs
    display: grid
    grid-auto-flow: column
    grid-auto-columns: 1fr
    gap: 2px
    height: auto
    padding: 10px 12px
    border-bottom: 1px solid rgba(255, 255, 255, .06)
    background: transparent

.mvtb-tab
    position: relative
    padding: 7px 4px
    font-size: 11px
    color: rgba(244, 247, 249, .42)
    background: transparent
    border: 0
    border-radius: 8px
    cursor: pointer
    transition: color .14s, background .14s

    &:hover
        color: rgba(244, 247, 249, .7)
        background: rgba(255, 255, 255, .04)

    &.is-active
        color: var(--accent)
        font-weight: 550
        background: var(--accent-soft)
</style>
