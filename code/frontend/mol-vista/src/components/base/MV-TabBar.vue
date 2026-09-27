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

.mv-tab-bar
    display: flex
    height: 34px
    border-bottom: 1px solid var(--line)
    background: var(--bg-panel)

.mv-tab
    position: relative
    flex: 1
    font-size: 11.5px
    color: var(--fg-faint)
    transition: color .14s cubic-bezier(.2, .7, .3, 1), background .14s cubic-bezier(.2, .7, .3, 1)

    &:hover
        color: var(--fg-muted)
        background: var(--bg-hover)

    &.is-active
        color: var(--fg)
        font-weight: 550

        &::after
            content: ''
            position: absolute
            left: 0
            right: 0
            bottom: -1px
            height: 2px
            background: var(--accent)
</style>
