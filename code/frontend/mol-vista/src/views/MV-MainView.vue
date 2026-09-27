<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>

    <div class="mv-main-view mmv">

        <mv-app-top-bar
            @import="onImport"
            @fit="onFit"
        />

        <div class="mmv-workspace">

            <mv-app-structure-panel
                ref="structurePanelRef"
                @import="onImport"
                @show-all="onShowAll"
                @toggle-chain="onToggleChain"
                @drop="onDrop"
            />

            <!-- 唯一视口宿主（ui.md §二/§五）：顶栏不再嵌套 molecule-viewer -->
            <mv-molecule-viewer ref="viewerRef"/>

            <mv-app-inspector/>

        </div>

        <mv-app-status-bar/>

    </div>

</template>

<script setup lang="ts">
/**
 * @file MV-MainView.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:30
 * @desc 应用主视图。拼装四块编排（顶栏 / 左栏 / 视口 / 右栏 / 状态栏）。
 *       约定（ui.md §二）：整个应用只能有一个 <canvas> 视口，由 components/molecule/
 *       MV-MoleculeViewer 提供；顶栏与状态栏均不再嵌套 viewer（历史缺陷：两份 GPU 上下文）。
 *       当前为静态占位：编排块的命令（import/fit/showAll…）先空实现，Workbench 接入后
 *       转发到 useWorkbench 命令（ui.md §四：UI 只发命令）。
 * @copyright CC BY-NC-SA
 * */
import MvAppStructurePanel from '@/components/layout/MV-AppStructurePanel.vue';
import MvMoleculeViewer from '@/components/molecule/MV-MoleculeViewer.vue';
import MvAppInspector from '@/components/layout/MV-AppInspector.vue';
import MvAppStatusBar from '@/components/layout/MV-AppStatusBar.vue';
import MvAppTopBar from '@/components/layout/MV-AppTopBar.vue';

import type {Optional} from '@/types';
import {ref} from 'vue';


const viewerRef = ref<Optional<InstanceType<typeof MvMoleculeViewer>>>();
const structurePanelRef = ref<Optional<InstanceType<typeof MvAppStructurePanel>>>();

function onImport(): void {
    // 顶栏 import 按钮：委托给结构面板打开文件选择器
    structurePanelRef.value?.triggerFileSelect();
}

function onFit(): void {
    viewerRef.value?.fit();
}

function onShowAll(): void {
    // TODO: 由 store 统一管理链可见性后，重置所有链为可见
}

function onToggleChain(_id: string): void {
    // TODO: 由 store 统一管理链可见性
}

function onDrop(_files: File[]): void {
    // 结构面板内部已处理文件解析，此处仅作事件占位
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mmv
    display: grid
    grid-template-rows: 46px minmax(0, 1fr) 26px
    height: 100%

    &-workspace
        display: grid
        grid-template-columns: 268px minmax(0, 1fr) 330px
        min-height: 0

        +below(1180px)
            grid-template-columns: 232px minmax(0, 1fr) 300px

        +below(940px)
            grid-template-columns: 1fr 330px
</style>
