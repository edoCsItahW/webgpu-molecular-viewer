<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>

    <!-- 左侧编排块-结构面板: 拖放区 + 链列表 + 元素图例 -->
    <aside class="mv-app-structure-panel masp">

        <!-- 头部：标题 + 操作按钮 -->
        <div class="masp-head">

            <h2 class="masp-title">{{ $t('structure.title') }}</h2>

            <div class="masp-actions">
                <!-- 展示全部 -->
                <mv-icon-button name="target" :label="$t('structure.showAll')" @click="onShowAll" />
                <!-- 导入 -->
                <mv-icon-button name="upload" :label="$t('structure.import')" @click="onImport" />
            </div>

        </div>

        <!-- 隐藏的文件选择器 -->
        <input
            ref="fileInputRef"
            type="file"
            class="masp-file-input"
            accept=".smi,.smiles,.mol,.sdf,.pdb,.xyz,.mol2"
            @change="onFileSelected"
        >

        <div class="masp-body">
            <!-- 拖放区 -->
            <mv-dropzone
                icon="upload"
                :hint="dropzoneHint"
                @click="onImport"
                @drop="onDrop"
            >
                <span v-html="dropPromptHtml" />
            </mv-dropzone>

            <!-- 解析错误提示 -->
            <p v-if="store.parseError" class="masp-error">
                {{ store.parseError }}
            </p>

            <!-- 链列表 -->
            <mv-panel-section :title="$t('structure.chains.title')">
                <template #meta>
                    <span class="masp-meta mono">{{ $t('structure.chains.count', { shown: chainsShown, total: chainsTotal }) }}</span>
                </template>
                <div v-if="chains.length" class="masp-chain-list">
                    <button
                        v-for="c in chains"
                        :key="c.id"
                        type="button"
                        class="masp-chain-row"
                        :class="{ 'is-active': c.active }"
                        @click="toggleChain(c.id)"
                    >
                        <span class="masp-chain-chip" :style="{ '--c': c.color }">{{ c.id }}</span>
                        <span class="masp-chain-name">{{ c.name }}</span>
                        <span class="masp-chain-count mono">{{ c.count }}</span>
                        <span class="masp-vis-dot" :class="{ 'is-on': c.visible }" />
                    </button>
                </div>
                <p v-else class="masp-empty">{{ $t('structure.chains.empty') }}</p>
            </mv-panel-section>

            <!-- 元素图例 -->
            <mv-panel-section :title="$t('structure.legend.title')">
                <template #meta>
                    <span class="masp-meta mono">{{ $t('structure.legend.scheme') }}</span>
                </template>
                <div v-if="legend.length" class="masp-legend">
                    <div
                        v-for="el in legend"
                        :key="el.symbol"
                        class="masp-legend-item"
                    >
                        <span class="masp-legend-dot" :style="{ '--c': el.color }" />
                        {{ el.symbol }}<b class="mono">{{ el.count }}</b>
                    </div>
                </div>
                <p v-else class="masp-empty">{{ $t('structure.legend.empty') }}</p>
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
 *       数据来自 molecule store（结构数据，非 GPU 对象）。
 *       交互（导入/切换链可见性）只发命令，不直接操作领域对象。
 * @copyright CC BY-NC-SA
 * */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MvDropzone from '@/components/base/MV-DropZone.vue';
import MvPanelSection from '@/components/base/MV-PanelSection.vue';
import MvIconButton from '@/components/widget/MV-IconButton.vue';
import { useMoleculeStore } from '@/stores/molecule.store';

const { t } = useI18n();
const store = useMoleculeStore();

const fileInputRef = ref<HTMLInputElement | null>(null);

// 拖放区主文案含 <b> 强调，需 v-html 渲染
const dropPromptHtml = computed(() => t('structure.dropzone.prompt'));

// 拖放区提示：解析中显示加载状态
const dropzoneHint = computed(() => {
    if (store.parsing) return t('structure.dropzone.parsing');
    return t('structure.dropzone.hint');
});

/** 链可见性状态（按 chain id 记录） */
const chainVisibility = ref<Record<string, boolean>>({});
const activeChainId = ref<string | null>(null);

const chains = computed(() => {
    const map = new Map<string, { id: string; count: number; color: string }>();
    for (const a of store.atoms) {
        const id = a.chain ?? '?';
        if (!map.has(id)) {
            map.set(id, { id, count: 0, color: chainColor(id) });
        }
        map.get(id)!.count += 1;
    }
    return Array.from(map.values()).map((c) => ({
        ...c,
        name: c.id === '?' ? t('structure.chains.unknown') : t('structure.chains.peptide', { id: c.id }),
        active: activeChainId.value === c.id,
        visible: chainVisibility.value[c.id] ?? true,
    }));
});

const chainsShown = computed(() => chains.value.filter((c) => c.visible).length);
const chainsTotal = computed(() => chains.value.length);

const legend = computed(() => {
    const map = new Map<string, { symbol: string; count: number; color: string }>();
    for (const a of store.atoms) {
        if (!map.has(a.symbol)) {
            map.set(a.symbol, { symbol: a.symbol, count: 0, color: rgbToHex(a.color) });
        }
        map.get(a.symbol)!.count += 1;
    }
    return Array.from(map.values());
});

function chainColor(id: string): string {
    const palette = ['#5b9bff', '#3fbf8f', '#e0a33a', '#e05b8f', '#9b5bff', '#5bc0e0'];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length] ?? '#5b9bff';
}

function rgbToHex(rgb: [number, number, number]): string {
    const toHex = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
    return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

const emit = defineEmits<{
    /** 用户请求导入结构文件 */
    import: [];
    /** 切换某条链的可见性 */
    toggleChain: [id: string];
    /** 全部显示 */
    showAll: [];
    /** 拖放落下的文件列表 */
    drop: [files: File[]];
}>();

function onImport() {
    if (store.parsing) return;
    // 触发隐藏的文件选择器
    fileInputRef.value?.click();
    emit('import');
}

function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
        void loadFile(file);
    }
    // 重置 input 以便重复选择同一文件
    input.value = '';
}

async function onDrop(files: File[]) {
    if (store.parsing) return;
    emit('drop', files);
    const file = files[0];
    if (file) {
        await loadFile(file);
    }
}

async function loadFile(file: File) {
    try {
        await store.loadFromFile(file);
    } catch {
        // 错误已记录在 store.parseError，UI 会显示
    }
}

/** 暴露给父组件：触发文件选择器（供顶栏 import 按钮调用） */
function triggerFileSelect() {
    if (!store.parsing) {
        fileInputRef.value?.click();
    }
}

defineExpose({ triggerFileSelect });

function toggleChain(id: string) {
    activeChainId.value = id === activeChainId.value ? null : id;
    chainVisibility.value = {
        ...chainVisibility.value,
        [id]: !(chainVisibility.value[id] ?? true),
    };
    emit('toggleChain', id);
}

function onShowAll() {
    for (const c of chains.value) {
        chainVisibility.value[c.id] = true;
    }
    emit('showAll');
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.masp
    display: flex
    flex-direction: column
    min-height: 0
    background: var(--bg-panel)
    border-right: 1px solid var(--line)

    +below(940px)
        display: none

    &-file-input
        display: none

    &-error
        margin: 0 12px 8px
        padding: 8px 10px
        font-size: 11px
        color: var(--danger, #e04a3a)
        background: var(--danger-soft, rgba(224, 74, 58, 0.1))
        border: 1px solid var(--danger, #e04a3a)
        border-radius: 4px
        word-break: break-all

    &-head
        display: flex
        align-items: center
        justify-content: space-between
        height: 34px
        padding: 0 10px 0 12px
        flex: none
        border-bottom: 1px solid var(--line)

    &-title
        font-size: 10px
        font-weight: 600
        letter-spacing: .12em
        text-transform: uppercase
        color: var(--fg-faint)

    &-actions
        display: flex
        gap: 2px

        :deep(.mv-icon-button)
            width: 22px
            height: 22px

    &-body
        flex: 1
        min-height: 0
        overflow-y: auto
        +thin-scrollbar()

    &-meta
        font-size: 10px
        color: var(--fg-faint)

    &-chain-list
        display: flex
        flex-direction: column
        gap: 1px

    &-chain
        &-row
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

        &-chip
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

        &-name
            +ellipsis()

        &-count
            font-size: 10.5px
            color: var(--fg-faint)

    &-vis-dot
        width: 8px
        height: 8px
        border-radius: 50%
        border: 1px solid var(--line-strong)

        &.is-on
            background: var(--accent)
            border-color: var(--accent)

    &-legend
        display: grid
        grid-template-columns: 1fr 1fr
        gap: 5px 12px

        &-item
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

        &-dot
            width: 9px
            height: 9px
            border-radius: 50%
            background: var(--c)
            box-shadow: inset 0 0 0 1px var(--atom-stroke)
</style>
