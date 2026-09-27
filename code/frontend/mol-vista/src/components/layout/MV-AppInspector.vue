<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <aside class="mv-app-inspector mai-panel">
        <mv-tab-bar v-model="activeTab" :tabs="tabs" />

        <div class="mai-body">
            <!-- 三个 tabpanel：检查 / 渲染 / 模拟 -->
            <section v-show="activeTab === 'inspect'" class="mai-tabpanel">
                <mv-inspect-tab />
            </section>

            <section v-show="activeTab === 'render'" class="mai-tabpanel">
                <mv-render-tab />
            </section>

            <section v-show="activeTab === 'simulate'" class="mai-tabpanel">
                <mv-simulate-tab />
            </section>
        </div>
    </aside>
</template>

<script setup lang="ts">
/**
 * @file MV-AppInspector.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:00
 * @desc 右栏编排块。Tab 切换：检查 / 渲染 / 模拟（ui.md §二）。
 *       各 tab 的业务内容由 molecule 层子组件填充（MV-InspectTab / MV-RenderTab / MV-SimulateTab）。
 * @copyright CC BY-NC-SA
 * */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MvTabBar from '@/components/base/MV-TabBar.vue';
import MvInspectTab from '@/components/molecule/MV-InspectTab.vue';
import MvRenderTab from '@/components/molecule/MV-RenderTab.vue';
import MvSimulateTab from '@/components/molecule/MV-SimulateTab.vue';

const { t } = useI18n();

type InspectorTab = 'inspect' | 'render' | 'simulate';

const activeTab = ref<InspectorTab>('inspect');

const tabs = [
    { value: 'inspect' as const, label: t('inspector.tabs.inspect') },
    { value: 'render' as const, label: t('inspector.tabs.render') },
    { value: 'simulate' as const, label: t('inspector.tabs.simulate') }
];
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-app-inspector
    display: flex
    flex-direction: column
    min-height: 0
    background: var(--bg-panel)
    border-left: 1px solid var(--line)

.mai-body
    flex: 1
    min-height: 0
    overflow-y: auto
    +thin-scrollbar()

.mai-tabpanel
    padding: 12px

.mai-empty
    margin: 0
    padding: 24px 12px
    text-align: center
    font-size: 11.5px
    color: var(--fg-faint)
</style>
