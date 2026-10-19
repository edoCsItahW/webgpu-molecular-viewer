<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-viewport-toolbar mvt-bar" role="toolbar" :aria-label="ariaLabel">
        <!-- 互斥工具组：rotate / pan / pick / measure -->
        <mv-icon-button
            v-for="t in exclusiveTools"
            :key="t.name"
            :name="t.name"
            :label="t.label"
            :active="exclusive === t.name"
            @click="setExclusive(t.name)"
        />
        <span class="mvt-sep" aria-hidden="true" />
        <!-- 独立切换组：fit / grid -->
        <mv-icon-button
            v-for="t in toggleTools"
            :key="t.name"
            :name="t.name"
            :label="t.label"
            :active="!!toggleState[t.name]"
            @click="emitToggle(t.name)"
        />
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ViewportToolbar.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:20
 * @desc 视口工具条（左上浮层）。两类工具：
 *         - 互斥工具（rotate / pan / pick / measure）—— 单选，写入 v-model:exclusive
 *         - 独立切换（fit / grid）—— 多选，通过 toggle 事件派发
 *       工具状态由父级管理，本组件仅做派发，避免与未来 GPU 引擎状态重复（ui.md §六）。
 * @copyright CC BY-NC-SA
 * */
import MvIconButton from '@/components/widget/MV-IconButton.vue';

type IconName = 'upload' | 'fit' | 'target' | 'rotate' | 'pan' | 'pick' | 'measure' | 'grid' | 'play' | 'step' | 'reset';
export type ExclusiveTool = 'rotate' | 'pan' | 'pick' | 'measure';
export type ToggleTool = 'fit' | 'grid';

defineProps<{
    /** 互斥工具当前激活项（v-model:exclusive） */
    exclusive: ExclusiveTool;
    /** 独立切换工具状态映射 */
    toggleState: Partial<Record<ToggleTool, boolean>>;
    /** 工具条无障碍标签 */
    ariaLabel?: string;
}>();

const emit = defineEmits<{
    'update:exclusive': [value: ExclusiveTool];
    /** 独立切换：被点击的工具名 */
    toggle: [name: ToggleTool];
}>();

const exclusiveTools: { name: ExclusiveTool; label: string }[] = [
    { name: 'rotate', label: '旋转' },
    { name: 'pan', label: '平移' },
    { name: 'pick', label: '选择原子' },
    { name: 'measure', label: '测距' }
];

const toggleTools: { name: ToggleTool; label: string }[] = [
    { name: 'fit', label: '适应视图' },
    { name: 'grid', label: '坐标网格' }
];

function setExclusive(name: ExclusiveTool) {
    emit('update:exclusive', name);
}

function emitToggle(name: ToggleTool) {
    emit('toggle', name);
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-viewport-toolbar
    display: flex
    align-items: center
    gap: 2px
    padding: 3px
    border-radius: var(--r-3)
    +glass-surface()

.mvt-sep
    width: 1px
    height: 16px
    margin: 0 3px
    background: var(--line-strong)
</style>
