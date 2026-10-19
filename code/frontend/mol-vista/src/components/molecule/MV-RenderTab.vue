<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-render-tab">
        <!-- 显示模式 -->
        <mv-panel-section :title="t('inspector.render.displayMode')">
            <mv-segmented-control v-model="displayMode" :options="displayModeOptions" />
        </mv-panel-section>

        <!-- 着色方案 -->
        <mv-panel-section :title="t('inspector.render.colorScheme')">
            <mv-segmented-control v-model="colorScheme" :options="colorSchemeOptions" />
        </mv-panel-section>

        <!-- 画质开关 -->
        <mv-panel-section :title="t('inspector.render.quality')">
            <mv-toggle-row v-model="showSsao" :label="t('inspector.render.qualityToggles.ssao')" />
            <mv-toggle-row v-model="showOutline" :label="t('inspector.render.qualityToggles.outline')" />
            <mv-toggle-row v-model="showGrid" :label="t('inspector.render.qualityToggles.grid')" />
            <mv-toggle-row v-model="showHydrogens" :label="t('inspector.render.qualityToggles.hydrogens')" />
        </mv-panel-section>

        <!-- 原子半径缩放 -->
        <mv-panel-section :title="t('inspector.render.radius.title')">
            <mv-slider-row
                v-model="ballRadiusScale"
                :label="t('inspector.render.radius.ball')"
                :min="20"
                :max="200"
                :step="1"
            />
            <mv-slider-row
                v-model="bondRadiusScale"
                :label="t('inspector.render.radius.bond')"
                :min="20"
                :max="200"
                :step="1"
            />
        </mv-panel-section>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-RenderTab.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:42
 * @desc 渲染标签页。显示模式 / 着色方案 / 画质开关 / 原子半径缩放。
 *       所有设置写入 molecule store，引擎在下一帧读取。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MvPanelSection from '@/components/base/MV-PanelSection.vue';
import MvSegmentedControl from '@/components/base/MV-SegmentedControl.vue';
import MvToggleRow from '@/components/base/MV-ToggleRow.vue';
import MvSliderRow from '@/components/base/MV-SliderRow.vue';
import { useMoleculeStore, type DisplayMode, type ColorScheme } from '@/stores/molecule.store';

const { t } = useI18n();
const store = useMoleculeStore();

/**
 * 能力探测：缺数据的功能必须"禁用 + 说明原因"，而不是让它看起来能用却没效果。
 * 演示数据既没有电荷列也没有二级结构；接入解析器后这里会自然变成数据驱动（docs/architecture/04 §6）。
 */
const hasCharges = computed(() => store.atoms.some((a) => typeof a.charge === 'number'));
const hasSecondaryStructure = computed(() => false);

const displayModeOptions = computed(() => ([
    { value: 'ballStick' as DisplayMode, label: t('inspector.render.displayModes.ballStick') },
    { value: 'spaceFill' as DisplayMode, label: t('inspector.render.displayModes.spaceFill') },
    { value: 'wireframe' as DisplayMode, label: t('inspector.render.displayModes.wireframe') },
    {
        value: 'cartoon' as DisplayMode,
        label: t('inspector.render.displayModes.cartoon'),
        disabled: !hasSecondaryStructure.value,
        hint: t('inspector.render.capability.cartoon'),
    },
]));

const colorSchemeOptions = computed(() => ([
    { value: 'element' as ColorScheme, label: t('inspector.render.colorSchemes.element') },
    { value: 'chain' as ColorScheme, label: t('inspector.render.colorSchemes.chain') },
    {
        value: 'charge' as ColorScheme,
        label: t('inspector.render.colorSchemes.charge'),
        disabled: !hasCharges.value,
        hint: t('inspector.render.capability.charge'),
    },
    {
        value: 'secondary' as ColorScheme,
        label: t('inspector.render.colorSchemes.secondary'),
        disabled: !hasSecondaryStructure.value,
        hint: t('inspector.render.capability.secondary'),
    },
]));

const displayMode = computed({
    get: () => store.displayMode,
    set: (v) => store.setDisplayMode(v),
});

const colorScheme = computed({
    get: () => store.colorScheme,
    set: (v) => store.setColorScheme(v),
});

const showSsao = computed({
    get: () => store.showSsao,
    set: (v) => { store.showSsao = v; },
});

const showOutline = computed({
    get: () => store.showOutline,
    set: (v) => { store.showOutline = v; },
});

const showGrid = computed({
    get: () => store.showGrid,
    set: () => store.toggleGrid(),
});

const showHydrogens = computed({
    get: () => store.showHydrogens,
    set: () => store.toggleHydrogens(),
});

const ballRadiusScale = computed({
    get: () => store.ballRadiusScale,
    set: (v) => store.setBallRadius(v),
});

const bondRadiusScale = computed({
    get: () => store.bondRadiusScale,
    set: (v) => store.setBondRadius(v),
});
</script>
