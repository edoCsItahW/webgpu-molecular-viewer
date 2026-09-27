<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <footer class="mv-app-status-bar msb-bar">
        <!-- 左：会话状态（文件名 / 格式 / 摘要） -->
        <span class="msb-doc-name mono">{{ docName }}</span>
        <span class="msb-sep" />
        <span>{{ format }}</span>
        <span class="msb-sep" />
        <span class="mono">{{ summary }}</span>

        <span class="msb-spacer" />

        <!-- 右：能力 / 问题 / 性能 -->
        <span class="msb-item">
            <span class="msb-led" :class="{ 'is-off': !webgpuReady }" />
            {{ capabilityLabel }}
        </span>
        <span class="msb-sep" />
        <span class="mono">{{ fpsLabel }}</span>
        <span class="msb-sep" />
        <span class="mono">{{ msLabel }}</span>
    </footer>
</template>

<script setup lang="ts">
/**
 * @file MV-AppStatusBar.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:00
 * @desc 状态栏编排块。四段：会话状态 / 能力 / 问题徽标 / 性能摘要（ui.md §二）。
 *       约定：后端不可用时不弹错误对话框，只在此处标注"已使用内置解析器"（ui.md §七）。
 *       数据来源 Workbench 只读镜像 + HUD 500ms 节流快照（ui.md §八）。
 *       当前为静态占位，待 Workbench 接入后由 props 注入。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// 占位数据 —— Workbench 接入后替换为 props
const docName = '1crn.pdb';
const format = t('statusbar.format');
const atomCount = 327;
const bondCount = 334;
const residueCount = 46;
const webgpuReady = true;
const fps = 60;
const cpuMs = 0.42;

const summary = computed(() =>
    t('statusbar.summary', { atoms: atomCount, bonds: bondCount, residues: residueCount })
);

const capabilityLabel = computed(() =>
    webgpuReady ? t('statusbar.capability.ready') : t('statusbar.capability.unavailable')
);

const fpsLabel = computed(() => `${fps.toFixed(1)} ${t('statusbar.perf.fps')}`);
const msLabel = computed(() => `${cpuMs.toFixed(2)} ${t('statusbar.perf.ms')}`);
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-app-status-bar
    display: flex
    align-items: center
    gap: 10px
    padding: 0 12px
    height: 26px
    flex: none
    background: var(--bg-panel)
    border-top: 1px solid var(--line)
    font-size: 10.5px
    color: var(--fg-faint)

.msb-doc-name
    color: var(--fg-muted)

.msb-sep
    width: 2px
    height: 2px
    border-radius: 50%
    background: var(--line-strong)

.msb-spacer
    flex: 1

.msb-item
    display: flex
    align-items: center
    gap: 6px

.msb-led
    width: 6px
    height: 6px
    border-radius: 50%
    background: var(--ok)
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 18%, transparent)

    &.is-off
        background: var(--warn)
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 18%, transparent)
</style>
