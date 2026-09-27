<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-toggle-row mvtr-row">
        <span class="mvtr-label">{{ label }}</span>
        <button
            type="button"
            class="mvtr-switch"
            :class="{ 'is-on': modelValue }"
            role="switch"
            :aria-checked="modelValue"
            :aria-label="label"
            @click="$emit('update:modelValue', !modelValue)"
        />
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ToggleRow.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:55
 * @desc 开关行。标签 + 自定义滑块开关。可访问性：role="switch" + aria-checked。
 * @copyright CC BY-NC-SA
 * */

defineProps<{
    /** 当前值（v-model） */
    modelValue: boolean;
    /** 标签 */
    label: string;
}>();

defineEmits<{
    'update:modelValue': [value: boolean];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-toggle-row
    display: flex
    align-items: center
    justify-content: space-between
    gap: 10px
    padding: 5px 0
    font-size: 12px
    color: var(--fg-muted)

.mvtr-label
    color: var(--fg-muted)

.mvtr-switch
    position: relative
    flex: none
    width: 28px
    height: 16px
    border-radius: 99px
    background: var(--bg-sunken)
    border: 1px solid var(--line-strong)
    transition: background .14s cubic-bezier(.2, .7, .3, 1), border-color .14s cubic-bezier(.2, .7, .3, 1)

    &::after
        content: ''
        position: absolute
        top: 2px
        left: 2px
        width: 10px
        height: 10px
        border-radius: 50%
        background: var(--fg-faint)
        transition: transform .14s cubic-bezier(.2, .7, .3, 1), background .14s cubic-bezier(.2, .7, .3, 1)

    &.is-on
        background: var(--accent-soft)
        border-color: var(--accent)

        &::after
            transform: translateX(12px)
            background: var(--accent)
</style>
