<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <button
        type="button"
        class="mv-icon-button mvib-btn"
        :class="{ 'is-active': active, 'is-disabled': disabled }"
        :disabled="disabled"
        :aria-label="label"
        :title="label"
        @click="onClick"
    >
        <mv-app-icon :name="name" />
    </button>
</template>

<script setup lang="ts">
/**
 * @file MV-IconButton.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:30
 * @desc 图标按钮。统一图标尺寸、悬浮态、键盘可访问性（aria-label 必填，ui.md §八）。
 * @copyright CC BY-NC-SA
 * */
import MvAppIcon from './MV-AppIcon.vue';

type IconName = 'upload' | 'fit' | 'target' | 'rotate' | 'pan' | 'pick' | 'measure' | 'grid' | 'play' | 'step' | 'reset';

const props = withDefaults(defineProps<{
    /** 图标名 */
    name: IconName;
    /** 鼠标悬浮 + 屏幕阅读器标签（必填） */
    label: string;
    /** 选中态（如工具条互斥激活） */
    active?: boolean;
    /** 禁用态 */
    disabled?: boolean;
}>(), {
    active: false,
    disabled: false
});

const emit = defineEmits<{
    /** 点击事件 */
    click: [event: MouseEvent];
}>();

function onClick(e: MouseEvent) {
    if (props.disabled) return;
    emit('click', e);
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-icon-button
    width: 28px
    height: 28px
    border-radius: 4px
    +center()

    color: var(--fg-muted)
    transition: background .14s cubic-bezier(.2, .7, .3, 1), color .14s cubic-bezier(.2, .7, .3, 1)

    &:hover
        background: var(--bg-hover)
        color: var(--fg)

    &.is-active
        background: var(--accent-soft)
        color: var(--accent)

    &.is-disabled
        opacity: .5
        cursor: not-allowed
</style>
