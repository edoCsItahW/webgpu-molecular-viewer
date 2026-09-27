<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-simulate-tab">
        <!-- 传输控制 -->
        <mv-panel-section :title="t('inspector.simulate.md.title')">
            <div class="mst-status">
                <span class="mst-status-dot" :class="`is-${store.simStatus}`" />
                <span class="mst-status-text">{{ statusLabel }}</span>
            </div>
            <div class="mst-transport">
                <button
                    v-if="store.simStatus !== 'running'"
                    class="mst-btn mst-btn-primary"
                    @click="store.play()"
                >
                    {{ t('inspector.simulate.transport.play') }}
                </button>
                <button
                    v-else
                    class="mst-btn"
                    @click="store.pause()"
                >
                    {{ t('inspector.simulate.transport.pause') }}
                </button>
                <button class="mst-btn" @click="store.step()">
                    {{ t('inspector.simulate.transport.step') }}
                </button>
                <button class="mst-btn" @click="store.reset()">
                    {{ t('inspector.simulate.transport.reset') }}
                </button>
            </div>
            <div class="mst-step-count">
                {{ t('inspector.simulate.transport.steps', { count: store.simStep }) }}
            </div>
        </mv-panel-section>

        <!-- 参数 -->
        <mv-panel-section :title="t('inspector.simulate.params.title')">
            <mv-slider-row
                v-model="temperature"
                :label="t('inspector.simulate.params.temperature')"
                :min="0"
                :max="1000"
                :step="1"
                :format="(v) => `${v} K`"
            />
            <mv-slider-row
                v-model="timestep"
                :label="t('inspector.simulate.params.timestep')"
                :min="0.1"
                :max="10"
                :step="0.1"
                :format="(v) => `${v.toFixed(1)} fs`"
            />
            <mv-slider-row
                v-model="damping"
                :label="t('inspector.simulate.params.damping')"
                :min="0"
                :max="100"
                :step="1"
                :format="(v) => `${(v / 100).toFixed(2)}`"
            />
            <mv-slider-row
                v-model="cutoff"
                :label="t('inspector.simulate.params.cutoff')"
                :min="1"
                :max="20"
                :step="0.5"
                :format="(v) => `${v.toFixed(1)} Å`"
            />
        </mv-panel-section>

        <!-- 能量 -->
        <mv-panel-section :title="`${t('inspector.simulate.energy.title')} (${t('inspector.simulate.energy.unit')})`">
            <mv-stat-list :rows="energyRows" />
        </mv-panel-section>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-SimulateTab.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:45
 * @desc 模拟标签页。MD 传输控制 / 参数 / 能量读数。
 *       状态写入 molecule store；真正的模拟步进由 @wmv/physics 引擎驱动（TODO）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import MvPanelSection from '@/components/base/MV-PanelSection.vue';
import MvSliderRow from '@/components/base/MV-SliderRow.vue';
import MvStatList from '@/components/base/MV-StatList.vue';
import { useMoleculeStore } from '@/stores/molecule.store';

const { t } = useI18n();
const store = useMoleculeStore();

const statusLabel = computed(() => {
    const map = {
        idle: t('inspector.simulate.md.status.idle'),
        paused: t('inspector.simulate.md.status.paused'),
        running: t('inspector.simulate.md.status.running'),
    } as const;
    return map[store.simStatus];
});

const temperature = computed({
    get: () => store.simParams.temperature,
    set: (v) => { store.simParams.temperature = v; },
});

const timestep = computed({
    get: () => store.simParams.timestep,
    set: (v) => { store.simParams.timestep = v; },
});

const damping = computed({
    get: () => Math.round(store.simParams.damping * 100),
    set: (v) => { store.simParams.damping = v / 100; },
});

const cutoff = computed({
    get: () => store.simParams.cutoff,
    set: (v) => { store.simParams.cutoff = v; },
});

const energyRows = computed(() => [
    { label: t('inspector.simulate.energy.potential'), value: store.energy.potential.toFixed(2) },
    { label: t('inspector.simulate.energy.kinetic'), value: store.energy.kinetic.toFixed(2) },
    { label: t('inspector.simulate.energy.total'), value: store.energy.total.toFixed(2) },
    { label: t('inspector.simulate.energy.drift'), value: `${store.energy.temperature.toFixed(1)} K` },
]);
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mst-status
    display: flex
    align-items: center
    gap: 8px
    margin-bottom: 10px

.mst-status-dot
    width: 8px
    height: 8px
    border-radius: 50%
    background: var(--fg-faint)

    &.is-running
        background: var(--accent-green, #4ade80)

    &.is-paused
        background: var(--accent-amber, #fbbf24)

.mst-status-text
    font-size: 12px
    color: var(--fg-muted)

.mst-transport
    display: grid
    grid-template-columns: 1fr 1fr 1fr 1fr
    gap: 6px

.mst-btn
    padding: 6px 0
    font-size: 11px
    color: var(--fg-muted)
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 4px
    cursor: pointer
    transition: all .14s

    &:hover
        color: var(--fg)
        border-color: var(--line-strong)

.mst-btn-primary
    color: var(--fg-on-accent)
    background: var(--accent)
    border-color: var(--accent)

    &:hover
        filter: brightness(1.1)

.mst-step-count
    margin-top: 8px
    font-size: 11px
    font-family: var(--font-mono)
    color: var(--fg-faint)
    text-align: center
</style>
