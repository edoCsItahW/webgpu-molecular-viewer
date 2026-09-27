<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <label class="mv-slider-row mvsr-row">
        <span class="mvsr-label">{{ label }}</span>
        <input
            type="range"
            class="mvsr-input"
            :min="min"
            :max="max"
            :step="step"
            :value="modelValue"
            @input="onInput"
        >
        <output class="mvsr-output mv-mono">{{ display }}</output>
    </label>
</template>

<script setup lang="ts">
/**
 * @file MV-SliderRow.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:55
 * @desc 滑块行。标签 + range + 数值回显。数值格式化由 format 回调决定（ui.md §八：单位显示由 UI 负责）。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    /** 当前值（v-model） */
    modelValue: number;
    /** 标签 */
    label: string;
    /** 最小值 */
    min: number;
    /** 最大值 */
    max: number;
    /** 步长，默认 1 */
    step?: number;
    /**
     * 数值显示格式化回调。返回字符串。
     * 默认按比例显示 0.00× 形式。
     */
    format?: (value: number) => string;
}>(), {
    step: 1,
    format: (v: number) => `${(v / 100).toFixed(2)}×`
});

const emit = defineEmits<{
    'update:modelValue': [value: number];
}>();

const display = computed(() => props.format(props.modelValue));

function onInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = Number(target.value);
    emit('update:modelValue', value);
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-slider-row
    display: grid
    grid-template-columns: 58px minmax(0, 1fr) 60px
    align-items: center
    gap: 10px
    padding: 6px 0
    font-size: 11.5px

.mvsr-label
    color: var(--fg-muted)

.mvsr-output
    text-align: right
    font-family: $font-mono
    font-size: 11px
    color: var(--fg)

.mvsr-input
    -webkit-appearance: none
    appearance: none
    width: 100%
    height: 14px
    background: transparent
    cursor: pointer

    &::-webkit-slider-runnable-track
        height: 2px
        border-radius: 99px
        background: var(--line-strong)

    &::-webkit-slider-thumb
        -webkit-appearance: none
        width: 10px
        height: 10px
        margin-top: -4px
        border-radius: 50%
        background: var(--accent)
        box-shadow: 0 0 0 3px var(--bg-panel)

    &::-moz-range-track
        height: 2px
        border-radius: 99px
        background: var(--line-strong)

    &::-moz-range-thumb
        width: 10px
        height: 10px
        border: 0
        border-radius: 50%
        background: var(--accent)
</style>
