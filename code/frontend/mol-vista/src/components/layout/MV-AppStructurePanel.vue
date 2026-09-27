<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <aside class="mv-app-structure-panel msp-panel">
        <div class="msp-head">
            <h2 class="msp-title">{{ t('structure.title') }}</h2>
            <div class="msp-actions">
                <mv-icon-button name="target" :label="t('structure.showAll')" @click="emit('showAll')" />
                <mv-icon-button name="upload" :label="t('structure.import')" @click="emit('import')" />
            </div>
        </div>

        <div class="msp-body">
            <!-- 拖放区：包装 MV-DropZone，accept/hint 走文案 -->
            <mv-dropzone
                icon="upload"
                :hint="t('structure.dropzone.hint')"
                @click="emit('import')"
                @drop="onDrop"
            >
                <span v-html="dropPromptHtml" />
            </mv-dropzone>

            <!-- 链列表：占位数据，后续由 MV-ChainList 组件注入 -->
            <mv-panel-section :title="t('structure.chains.title')">
                <template #meta>
                    <span class="msp-meta mono">{{ t('structure.chains.count', { shown: chainsShown, total: chainsTotal }) }}</span>
                </template>
                <div class="msp-chain-list">
                    <button
                        v-for="c in chains"
                        :key="c.id"
                        type="button"
                        class="msp-chain-row"
                        :class="{ 'is-active': c.active }"
                        @click="emit('toggleChain', c.id)"
                    >
                        <span class="msp-chain-chip" :style="{ '--c': c.color }">{{ c.id }}</span>
                        <span class="msp-chain-name">{{ c.name }}</span>
                        <span class="msp-chain-count mono">{{ c.count }}</span>
                        <span class="msp-vis-dot" :class="{ 'is-on': c.visible }" />
                    </button>
                </div>
            </mv-panel-section>

            <!-- 元素图例：占位数据，后续由 MV-ElementLegend 组件注入 -->
            <mv-panel-section :title="t('structure.legend.title')">
                <template #meta>
                    <span class="msp-meta mono">{{ t('structure.legend.scheme') }}</span>
                </template>
                <div class="msp-legend">
                    <div
                        v-for="el in legend"
                        :key="el.symbol"
                        class="msp-legend-item"
                    >
                        <span class="msp-legend-dot" :style="{ '--c': el.color }" />
                        {{ el.symbol }}<b class="mono">{{ el.count }}</b>
                    </div>
                </div>
            </mv-panel-section>
        </div>
    </aside>
</template>

<script setup lang="ts">
/**
 * @file MV-AppStructurePanel.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:00
 * @desc 左栏编排块。三段：拖放区 / 链列表 / 元素图例。
 *       当前为静态占位阶段：链与图例数据由本组件内联，后续接入 Workbench 只读镜像后
 *       改为 props 注入并迁移到 MV-ChainList / MV-ElementLegend 业务组件（ui.md §3.3 ⬜）。
 *       交互（导入/切换链可见性）只发命令（ui.md §四），不直接操作领域对象。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MvDropzone from '@/components/base/MV-DropZone.vue';
import MvPanelSection from '@/components/base/MV-PanelSection.vue';
import MvIconButton from '@/components/widget/MV-IconButton.vue';

const { t } = useI18n();

// 拖放区主文案含 <b> 强调，需 v-html 渲染
const dropPromptHtml = computed(() => t('structure.dropzone.prompt'));

// 占位数据 —— Workbench 接入后替换
const chains = [
    { id: 'A', name: t('structure.chains.peptide', { id: 'A' }), count: 46, color: '#5b9bff', active: true, visible: true },
    { id: 'B', name: t('structure.chains.peptide', { id: 'B' }), count: 46, color: '#3fbf8f', active: true, visible: true },
    { id: 'W', name: t('structure.chains.water'), count: 84, color: '#e0a33a', active: false, visible: false }
];
const chainsShown = chains.filter(c => c.visible).length;
const chainsTotal = chains.length;

const legend = [
    { symbol: 'C', count: 201, color: '#414855' },
    { symbol: 'O', count: 62, color: '#e04a3a' },
    { symbol: 'N', count: 48, color: '#3b6fe0' },
    { symbol: 'S', count: 3, color: '#e0b040' },
    { symbol: 'H', count: 13, color: '#d8dbe0' }
];

const emit = defineEmits<{
    /** 用户请求导入结构文件（点击拖放区或顶栏导入按钮） */
    import: [];
    /** 切换某条链的可见性 */
    toggleChain: [id: string];
    /** 全部显示 */
    showAll: [];
    /** 拖放落下的文件列表 */
    drop: [files: File[]];
}>();

function onDrop(files: File[]) {
    emit('drop', files);
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-app-structure-panel
    display: flex
    flex-direction: column
    min-height: 0
    background: var(--bg-panel)
    border-right: 1px solid var(--line)

    +below(940px)
        display: none

.msp-head
    display: flex
    align-items: center
    justify-content: space-between
    height: 34px
    padding: 0 10px 0 12px
    flex: none
    border-bottom: 1px solid var(--line)

.msp-title
    font-size: 10px
    font-weight: 600
    letter-spacing: .12em
    text-transform: uppercase
    color: var(--fg-faint)

.msp-actions
    display: flex
    gap: 2px

    :deep(.mv-icon-button)
        width: 22px
        height: 22px

.msp-body
    flex: 1
    min-height: 0
    overflow-y: auto
    +thin-scrollbar()

.msp-meta
    font-size: 10px
    color: var(--fg-faint)

.msp-chain-list
    display: flex
    flex-direction: column
    gap: 1px

.msp-chain-row
    display: grid
    grid-template-columns: 20px minmax(0, 1fr) auto 10px
    align-items: center
    gap: 8px
    width: 100%
    padding: 5px 7px
    border-radius: 4px
    font-size: 12px
    text-align: left
    color: var(--fg-muted)
    transition: background .14s cubic-bezier(.2, .7, .3, 1), color .14s cubic-bezier(.2, .7, .3, 1)

    &:hover
        background: var(--bg-hover)
        color: var(--fg)

    &.is-active
        background: var(--accent-soft)
        color: var(--fg)

.msp-chain-chip
    width: 18px
    height: 18px
    border-radius: 2px
    display: grid
    place-items: center
    font-family: var(--font-mono)
    font-size: 10px
    font-weight: 600
    color: #fff
    background: var(--c, #5b9bff)

.msp-chain-name
    +ellipsis()

.msp-chain-count
    font-size: 10.5px
    color: var(--fg-faint)

.msp-vis-dot
    width: 8px
    height: 8px
    border-radius: 50%
    border: 1px solid var(--line-strong)

    &.is-on
        background: var(--accent)
        border-color: var(--accent)

.msp-legend
    display: grid
    grid-template-columns: 1fr 1fr
    gap: 5px 12px

.msp-legend-item
    display: grid
    grid-template-columns: 9px 1fr auto
    align-items: center
    gap: 7px
    font-size: 11.5px
    color: var(--fg-muted)

    b
        font-family: var(--font-mono)
        font-size: 10.5px
        font-weight: 500
        color: var(--fg-faint)

.msp-legend-dot
    width: 9px
    height: 9px
    border-radius: 50%
    background: var(--c)
    box-shadow: inset 0 0 0 1px var(--atom-stroke)
</style>
