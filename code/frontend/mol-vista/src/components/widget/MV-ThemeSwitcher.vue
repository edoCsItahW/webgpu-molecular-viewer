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
        class="mv-theme-switcher mvts-seg"
        role="group"
        :aria-label="$t('topbar.themeAria')"
    >
        <button
            v-for="opt in options"
            :key="opt.value"
            type="button"
            class="mvts-btn"
            :class="{ 'is-active': mode === opt.value }"
            :aria-pressed="mode === opt.value"
            :title="$t(`topbar.theme.${opt.value}`)"
            @click="setMode(opt.value)"
        >
            <mv-app-icon :name="opt.icon" />
        </button>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ThemeSwitcher.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:30
 * @desc 主题切换器。三段：浅色 / 深色 / 跟随系统。
 *       状态只写 <html data-theme>，不进 Pinia（与 ui.md §六 一致：UI 偏好可序列化，
 *       但主题切换是低风险、本地副作用，先内联；如需持久化可后续接入 store）。
 * @copyright CC BY-NC-SA
 * */
import { ref, onMounted, onBeforeUnmount } from 'vue';
import MvAppIcon from './MV-AppIcon.vue';

type ThemeMode = 'light' | 'dark' | 'auto';

const options: { value: ThemeMode; icon: 'sun' | 'moon' | 'auto' }[] = [
    { value: 'light', icon: 'sun' },
    { value: 'dark', icon: 'moon' },
    { value: 'auto', icon: 'auto' }
];

const mode = ref<ThemeMode>('dark');
let media: MediaQueryList | null = null;

function resolveAuto(): 'light' | 'dark' {
    return media?.matches ? 'dark' : 'light';
}

function apply(m: ThemeMode) {
    const resolved = m === 'auto' ? resolveAuto() : m;
    document.documentElement.setAttribute('data-theme', resolved);
    mode.value = m;
}

function setMode(m: ThemeMode) {
    apply(m);
}

function onMediaChange() {
    if (mode.value === 'auto') apply('auto');
}

onMounted(() => {
    // 初始从 <html> 读取，避免与 main.ts 的初始设置冲突
    const current = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' | null;
    mode.value = current ?? 'dark';

    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', onMediaChange);
});

onBeforeUnmount(() => {
    media?.removeEventListener('change', onMediaChange);
    media = null;
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-theme-switcher
    display: flex
    gap: 2px
    padding: 2px
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 4px

.mvts-btn
    padding: 3px 9px
    border-radius: 2px
    color: var(--fg-muted)
    display: inline-flex
    align-items: center
    justify-content: center
    transition: background .14s cubic-bezier(.2, .7, .3, 1), color .14s cubic-bezier(.2, .7, .3, 1)

    :deep(.mv-app-icon)
        width: 12px
        height: 12px

    &:hover
        color: var(--fg)
        background: var(--bg-hover)

    &.is-active
        background: var(--bg-panel)
        color: var(--fg)
        font-weight: 550
        box-shadow: 0 1px 2px rgba(0, 0, 0, .14)
</style>
