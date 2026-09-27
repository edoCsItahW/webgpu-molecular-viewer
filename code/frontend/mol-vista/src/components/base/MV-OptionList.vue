<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-option-list mvol-list">
        <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="mvol-opt"
            :class="{ 'is-active': modelValue === opt.value }"
            @click="$emit('update:modelValue', opt.value)"
        >
            <span
                v-if="opt.swatches?.length"
                class="mvol-dots"
            >
                <i
                    v-for="(c, i) in opt.swatches"
                    :key="i"
                    class="mvol-dot"
                    :style="{ '--c': c }"
                />
            </span>
            <span class="mvol-label">{{ opt.label }}</span>
            <span class="mvol-check" />
        </button>
    </div>
</template>

<script setup lang="ts" generic="T extends string">
/**
 * @file MV-OptionList.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:55
 * @desc 单选列表。每项可带色板（如着色方案的元素颜色组）。
 * @copyright CC BY-NC-SA
 * */

interface Option<T extends string> {
    value: T;
    label: string;
    /** 可选色板（CSS 颜色值数组） */
    swatches?: string[];
}

defineProps<{
    /** 当前值（v-model） */
    modelValue: T;
    /** 选项列表 */
    options: Option<T>[];
}>();

defineEmits<{
    'update:modelValue': [value: T];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-option-list
    display: flex
    flex-direction: column
    gap: 1px

.mvol-opt
    display: flex
    align-items: center
    gap: 9px
    width: 100%
    padding: 6px 8px
    border-radius: 4px
    font-size: 12px
    color: var(--fg-muted)
    text-align: left
    transition: background .14s cubic-bezier(.2, .7, .3, 1), color .14s cubic-bezier(.2, .7, .3, 1)

    &:hover
        background: var(--bg-hover)
        color: var(--fg)

    &.is-active
        background: var(--accent-soft)
        color: var(--fg)

.mvol-dots
    display: flex
    gap: 2px

.mvol-dot
    width: 8px
    height: 8px
    border-radius: 50%
    background: var(--c)
    box-shadow: inset 0 0 0 1px var(--atom-stroke)

.mvol-label
    flex: 1

.mvol-check
    margin-left: auto
    flex: none
    width: 13px
    height: 13px
    border-radius: 50%
    border: 1px solid var(--line-strong)

    .mvol-opt.is-active &
        border-color: var(--accent)
        background: radial-gradient(circle, var(--accent) 0 3.2px, transparent 3.8px)
</style>
