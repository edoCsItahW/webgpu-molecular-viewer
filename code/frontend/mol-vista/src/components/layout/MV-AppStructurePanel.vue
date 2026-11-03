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
                    <template v-for="c in chains" :key="c.id">
                        <button
                            type="button"
                            class="masp-chain-row"
                            :class="{ 'is-active': c.active }"
                            @click="onChainClick(c)"
                        >
                            <span class="masp-chain-chip" :style="{ '--c': c.color }">{{ c.id }}</span>
                            <span class="masp-chain-name">{{ c.name }}</span>
                            <span class="masp-chain-count mono">{{ c.count }}</span>
                            <span
                                role="button"
                                tabindex="0"
                                class="masp-vis-dot"
                                :class="{ 'is-on': c.visible }"
                                :aria-label="$t('structure.chains.visibility')"
                                @click.stop="toggleChain(c.id)"
                                @keydown.enter.stop="toggleChain(c.id)"
                                @keydown.space.prevent.stop="toggleChain(c.id)"
                            />
                        </button>

                        <div v-if="expandedChains.has(c.id)" class="masp-residue-list">
                            <button
                                v-for="r in residuesByChain.get(c.index) ?? []"
                                :key="r.index"
                                type="button"
                                class="masp-residue-row"
                                :class="{
                                    'is-active': store.selection?.kind === 'residue'
                                        && store.selection.index === r.index,
                                }"
                                @click="selectResidue(r.index)"
                            >
                                <span class="masp-residue-name">{{ r.name }}{{ r.seq }}</span>
                                <span class="masp-residue-count mono">{{ r.count }}</span>
                            </button>
                        </div>
                    </template>
                </div>
                <p v-else class="masp-empty">{{ $t('structure.chains.empty') }}</p>

                <!-- 配体：HETATM 非水残基 -->
                <div v-if="ligands.length" class="masp-ligand-list">
                    <p class="masp-subtitle">{{ $t('structure.chains.ligands.title') }}</p>
                    <button
                        v-for="ligand in ligands"
                        :key="ligand.index"
                        type="button"
                        class="masp-residue-row masp-ligand-row"
                        @click="selectLigand(ligand.index)"
                    >
                        <span class="masp-residue-name">{{ ligand.name }}{{ ligand.seq }} · {{ ligand.chain }}</span>
                        <span class="masp-residue-count mono">{{ ligand.count }}</span>
                    </button>
                </div>
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
import { elementByZ } from '@wmv/structure';

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
    const data = store.structure;
    const chainsCsv = data?.chains;

    if (!data || !chainsCsv) return [];

    // 每个链的原子数（按 chainIndex 统计一次，不建对象数组）
    const counts = new Uint32Array(chainsCsv.id.length);
    const chainIndex = data.atoms.chainIndex;

    if (chainIndex) {
        for (let i = 0; i < data.meta.atomCount; i++) {
            const c = chainIndex[i]!;

            if (c >= 0 && c < counts.length) counts[c] = counts[c]! + 1;
        }
    }

    return chainsCsv.id.map((id, index) => ({
        index,
        id,
        count: counts[index] ?? 0,
        color: chainColor(id),
        name: id === '' ? t('structure.chains.unknown') : t('structure.chains.peptide', { id }),
        active: activeChainId.value === id
            || (store.selection?.kind === 'chain' && store.selection.index === index),
        visible: chainVisibility.value[id] ?? true,
    }));
});

const chainsShown = computed(() => chains.value.filter((c) => c.visible).length);
const chainsTotal = computed(() => chains.value.length);

// ---- 残基树（懒展开：只对展开的链渲染残基行） ----
interface ResidueItem {
    index: number;
    name: string;
    seq: number;
    count: number;
    chain: string;
}

const expandedChains = ref<Set<string>>(new Set());

const residuesByChain = computed(() => {
    const data = store.structure;
    const residues = data?.residues;
    const map = new Map<number, ResidueItem[]>();

    if (!residues) return map;

    const chainIds = data?.chains?.id;
    const water = new Set(["HOH", "WAT", "H2O", "DOD", "SOL"]);

    for (let r = 0; r < residues.name.length; r++) {
        const name = residues.name[r]!;

        if (water.has(name)) continue;

        const chain = residues.chainIndex[r] ?? 0;
        const list = map.get(chain);

        const item: ResidueItem = {
            index: r,
            name,
            seq: residues.seqNumber[r] ?? 0,
            count: residues.count[r] ?? 0,
            chain: chainIds?.[chain] ?? "",
        };

        if (list) list.push(item);
        else map.set(chain, [item]);
    }

    return map;
});

/** HETATM 非水残基：配体快捷入口 */
const ligands = computed<ResidueItem[]>(() => {
    const data = store.structure;
    const residues = data?.residues;
    const flags = data?.atoms.flags;
    const residueIndex = data?.atoms.residueIndex;

    if (!residues || !flags || !residueIndex) return [];

    const seen = new Set<number>();

    for (let i = 0; i < data.meta.atomCount; i++) {
        const flag = flags[i]!;

        if ((flag & 1) === 0 || (flag & 2) !== 0) continue;

        const r = residueIndex[i] ?? -1;

        if (r >= 0) seen.add(r);
    }

    return [...seen].map(r => ({
        index: r,
        name: residues.name[r]!,
        seq: residues.seqNumber[r] ?? 0,
        count: residues.count[r] ?? 0,
        chain: data.chains?.id[residues.chainIndex[r] ?? 0] ?? "",
    }));
});

const legend = computed(() => {
    const data = store.structure;
    if (!data) return [];

    const map = new Map<number, { symbol: string; count: number; color: string }>();
    const elements = data.atoms.element;

    for (let i = 0; i < data.meta.atomCount; i++) {
        const z = elements[i] ?? 0;
        const existing = map.get(z);

        if (existing) existing.count += 1;
        else {
            const element = elementByZ(z);

            map.set(z, {symbol: element.symbol, count: 1, color: element.cpkColor});
        }
    }

    return [...map.values()];
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
    chainVisibility.value = {
        ...chainVisibility.value,
        [id]: !(chainVisibility.value[id] ?? true),
    };
    emit('toggleChain', id);
}

/** 点击链行：选中整条链（引擎重建时高亮） */
function selectChain(index: number) {
    const chain = chains.value.find((c) => c.index === index);

    activeChainId.value = activeChainId.value === chain?.id ? null : (chain?.id ?? null);
    store.selectChain(store.selection?.kind === 'chain' && store.selection.index === index ? null : index);
}

/** 链行：选中整链 + 展开/收起残基 */
function onChainClick(chain: {index: number; id: string}) {
    selectChain(chain.index);

    const next = new Set(expandedChains.value);

    if (next.has(chain.id)) next.delete(chain.id);
    else next.add(chain.id);

    expandedChains.value = next;
}

function selectResidue(index: number) {
    store.selectResidue(index);
}

/** 配体：选中该残基并把口袋焦点切到它 */
function selectLigand(index: number) {
    store.selectResidue(index);
    store.setFocus({residueIndexes: [index], radius: 6});
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

    &-residue-list
        display: flex
        flex-direction: column
        gap: 1px
        max-height: 210px
        overflow: auto
        margin: 0 0 4px 20px
        padding-left: 6px
        border-left: 1px solid var(--line)

    &-residue-row
        display: flex
        align-items: center
        justify-content: space-between
        gap: 8px
        padding: 3px 7px
        font-size: 11px
        text-align: left
        color: var(--fg-faint)
        border-radius: 3px

        &:hover
            color: var(--fg)
            background: var(--bg-hover)

        &.is-active
            color: var(--fg)
            background: var(--accent-soft)

    &-residue-name
        +ellipsis()

    &-residue-count
        font-size: 9.5px
        color: var(--fg-faint)

    &-ligand-list
        display: flex
        flex-direction: column
        gap: 1px
        margin-top: 8px
        padding-top: 6px
        border-top: 1px solid var(--line)

    &-ligand-row
        color: var(--fg-muted)

    &-subtitle
        margin: 0 0 3px
        padding: 0 7px
        font-size: 10px
        letter-spacing: .08em
        text-transform: uppercase
        color: var(--fg-faint)

    &-vis-dot
        width: 8px
        height: 8px
        padding: 0
        border-radius: 50%
        border: 1px solid var(--line-strong)
        background: transparent
        cursor: pointer

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



