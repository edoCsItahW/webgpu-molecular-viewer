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
        class="mv-dropzone mvdz-zone"
        role="button"
        tabindex="0"
        :class="{ 'is-drag': isDrag }"
        @click="onClick"
        @keydown.enter.prevent="onClick"
        @keydown.space.prevent="onClick"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
    >
        <mv-app-icon class="mvdz-ico" :name="icon" />
        <div class="mvdz-text">
            <slot />
        </div>
        <div v-if="hint" class="mvdz-hint">{{ hint }}</div>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-DropZone.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:10
 * @desc 文件拖放区。统一处理 click + dragenter/over/leave/drop，键盘可访问。
 *       父组件通过 @drop 接收 File[]，业务格式过滤由调用方完成。
 * @copyright CC BY-NC-SA
 * */
import { ref } from 'vue';
import MvAppIcon from '@/components/widget/MV-AppIcon.vue';

type IconName = 'upload' | 'fit' | 'target' | 'rotate' | 'pan' | 'pick' | 'measure' | 'grid' | 'play' | 'step' | 'reset';

const props = withDefaults(defineProps<{
    /** 图标名（默认 upload） */
    icon?: IconName;
    /** 副标题，留空则不渲染 */
    hint?: string;
}>(), {
    icon: 'upload'
});

const emit = defineEmits<{
    /** 用户主动点击或按 Enter/Space 触发 —— 调用方应打开文件选择器 */
    click: [event: MouseEvent | KeyboardEvent];
    /** 拖放完成时派发已落下的文件列表 */
    drop: [files: File[]];
}>();

const isDrag = ref(false);

let dragDepth = 0;

function onClick(e: MouseEvent | KeyboardEvent) {
    emit('click', e);
}

function onDragEnter(e: DragEvent) {
    dragDepth++;
    if (e.dataTransfer?.types?.includes('Files')) isDrag.value = true;
}

function onDragOver(e: DragEvent) {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
}

function onDragLeave() {
    if (--dragDepth <= 0) {
        dragDepth = 0;
        isDrag.value = false;
    }
}

function onDrop(e: DragEvent) {
    dragDepth = 0;
    isDrag.value = false;
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) emit('drop', files);
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-dropzone
    margin: 12px
    padding: 16px 12px
    display: flex
    flex-direction: column
    align-items: center
    gap: 3px
    border: 1px dashed var(--line-strong)
    border-radius: var(--r-3)
    background: var(--bg-sunken)
    color: var(--fg-muted)
    font-size: 11.5px
    text-align: center
    cursor: pointer
    transition: border-color var(--dur) var(--ease), background var(--dur) var(--ease)

    &:hover, &.is-drag
        border-color: var(--accent)
        background: var(--accent-soft)

    &:focus-visible
        outline: 2px solid var(--accent)
        outline-offset: 2px

.mvdz-ico
    width: 18px
    height: 18px
    color: var(--fg-faint)
    margin-bottom: 3px

.mvdz-text
    color: var(--fg-muted)

    :deep(b)
        color: var(--fg)
        font-weight: 600

.mvdz-hint
    font-size: 10.5px
    color: var(--fg-faint)
</style>
