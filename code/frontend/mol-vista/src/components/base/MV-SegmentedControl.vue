<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-segmented-control mvsc-seg">
        <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="mvsc-btn"
            :class="{ 'is-active': modelValue === opt.value }"
            @click="$emit('update:modelValue', opt.value)"
        >
            <slot
                name="option"
                :option="opt"
            >
                {{ opt.label }}
            </slot>
        </button>
    </div>
</template>

<script setup lang="ts" generic="T extends string">
/**
 * @file MV-SegmentedControl.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:00
 * @desc 分段单选。泛型 + 插槽（如显示模式可用图标 + 文字混合）。
 * @copyright CC BY-NC-SA
 * */

interface Option<T extends string> {
    value: T;
    label: string;
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

.mv-segmented-control
    display: flex
    gap: 2px
    padding: 2px
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 4px

.mvsc-btn
    flex: 1
    padding: 3px 9px
    border-radius: 2px
    font-size: 11px
    color: var(--fg-muted)
    transition: background .14s cubic-bezier(.2, .7, .3, 1), color .14s cubic-bezier(.2, .7, .3, 1)

    &:hover
        color: var(--fg)
        background: var(--bg-hover)

    &.is-active
        background: var(--bg-panel)
        color: var(--fg)
        font-weight: 550
        box-shadow: 0 1px 2px rgba(0, 0, 0, .14)
</style>
