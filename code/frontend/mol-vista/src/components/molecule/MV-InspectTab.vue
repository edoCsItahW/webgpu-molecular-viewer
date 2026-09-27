<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-inspect-tab">
        <!-- 选中原子卡片 -->
        <mv-panel-section v-if="atom" :title="t('inspector.atomCard.atomNumber', { id: atom.id })">
            <mv-key-value-list :rows="atomRows" />
            <button class="mit-focus-btn" @click="onFocus">
                {{ t('inspector.atomCard.focusAtom') }}
            </button>
        </mv-panel-section>
        <p v-else class="mit-empty">{{ t('inspector.empty.inspect') }}</p>

        <!-- 分子统计 -->
        <mv-panel-section :title="t('inspector.stats.title')">
            <mv-stat-list :rows="statsRows" />
        </mv-panel-section>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-InspectTab.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:40
 * @desc 检查标签页。展示选中原子的属性卡片 + 分子统计。
 *       数据来自 molecule store（结构数据，非 GPU 对象）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MvPanelSection from '@/components/base/MV-PanelSection.vue';
import MvKeyValueList from '@/components/base/MV-KeyValueList.vue';
import MvStatList from '@/components/base/MV-StatList.vue';
import { useMoleculeStore } from '@/stores/molecule.store';

const { t } = useI18n();
const store = useMoleculeStore();

const atom = computed(() => store.selectedAtom);

const atomRows = computed(() => {
    if (!atom.value) return [];
    const a = atom.value;
    return [
        { key: t('inspector.atomCard.residue'), value: a.residue ?? '—' },
        { key: t('inspector.atomCard.chain'), value: a.chain ?? '—' },
        { key: t('inspector.coord.x'), value: a.position[0].toFixed(3), mono: true },
        { key: t('inspector.coord.y'), value: a.position[1].toFixed(3), mono: true },
        { key: t('inspector.coord.z'), value: a.position[2].toFixed(3), mono: true },
        { key: t('inspector.atomCard.bfactor'), value: (a.bfactor ?? 0).toFixed(2), mono: true },
        { key: t('inspector.atomCard.occupancy'), value: (a.occupancy ?? 1).toFixed(2), mono: true },
        { key: t('inspector.atomCard.partialCharge'), value: (a.charge ?? 0).toFixed(3), mono: true },
    ];
});

const statsRows = computed(() => [
    { label: t('inspector.stats.atoms'), value: store.atomCount },
    { label: t('inspector.stats.bonds'), value: store.bondCount },
    { label: t('inspector.stats.residues'), value: store.residueCount },
    { label: t('inspector.stats.netCharge'), value: '0' },
    { label: t('inspector.stats.mass'), value: `${store.mass.toFixed(1)} u` },
]);

function onFocus() {
    // TODO: 引擎拾取后，调用 engine.focusAtom(atom.id)
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mit-empty
    margin: 0
    padding: 24px 12px
    text-align: center
    font-size: 11.5px
    color: var(--fg-faint)

.mit-focus-btn
    margin-top: 10px
    width: 100%
    padding: 6px 10px
    font-size: 11px
    color: var(--accent)
    background: var(--accent-soft)
    border: 1px solid var(--accent)
    border-radius: 4px
    cursor: pointer
    transition: background .14s

    &:hover
        background: var(--accent)
        color: var(--fg-on-accent)
</style>
