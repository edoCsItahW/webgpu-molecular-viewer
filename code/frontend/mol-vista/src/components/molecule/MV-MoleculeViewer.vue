<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <main class="mv-molecule-viewer mmv-stage">
        <mv-engine-viewport ref="viewportRef">
            <!-- 左上工具条 -->
            <mv-overlay-corner corner="tl">
                <mv-viewport-toolbar
                    v-model:exclusive="toolExclusive"
                    :toggle-state="toggleState"
                    :aria-label="t('mainView.viewport.toolbar.ariaLabel')"
                    @toggle="onToggle"
                />
            </mv-overlay-corner>

            <!-- 右上 HUD -->
            <mv-overlay-corner corner="tr">
                <mv-viewport-hud
                    :ready="hudReady"
                    :metrics="hudMetrics"
                    :aria-label="t('mainView.viewport.hud.ariaLabel')"
                />
            </mv-overlay-corner>

            <!-- 左下坐标轴 -->
            <mv-overlay-corner corner="bl">
                <mv-axis-gizmo />
            </mv-overlay-corner>

            <!-- 右下比例尺 -->
            <mv-overlay-corner corner="br">
                <mv-scale-bar
                    :width="scale.width"
                    :label="scale.label"
                />
            </mv-overlay-corner>
        </mv-engine-viewport>

        <!-- 口袋接触残基标注：屏幕空间 overlay，不参与拾取 -->
        <div v-if="labels.length" class="mmv-labels" aria-hidden="true">
            <div
                v-for="label in labels"
                :key="label.text"
                class="mmv-label"
                :style="{transform: `translate(${label.x}px, ${label.y}px)`}"
            >
                <span class="mmv-label-dot" />
                <span class="mmv-label-text">{{ label.text }}</span>
            </div>
        </div>

        <!-- 测距/测角 -->
        <div v-if="store.measureMode" class="mmv-measure-switch">
            <button
                type="button"
                :class="{'is-active': store.measureKind === 'distance'}"
                @click="store.setMeasureKind('distance')"
            >
                {{ t('measure.distance') }}
            </button>
            <button
                type="button"
                :class="{'is-active': store.measureKind === 'angle'}"
                @click="store.setMeasureKind('angle')"
            >
                {{ t('measure.angle') }}
            </button>
            <button
                type="button"
                :class="{'is-active': store.measureKind === 'dihedral'}"
                @click="store.setMeasureKind('dihedral')"
            >
                {{ t('measure.dihedral') }}
            </button>
        </div>

        <svg v-if="measure" class="mmv-measure" aria-hidden="true">
            <polyline :points="pointsAttr(measure.points)" />
            <path v-if="measure.arc" :d="measure.arc" />
            <circle v-for="(point, i) in measure.points" :key="i" :cx="point.x" :cy="point.y" r="3" />
            <g :transform="`translate(${measure.labelX}, ${measure.labelY})`">
                <rect x="-24" y="-9" width="48" height="18" rx="9" />
                <text x="0" y="3.5" text-anchor="middle">{{ measure.label }}</text>
            </g>
        </svg>

        <div v-if="measureHint" class="mmv-measure-hint">{{ measureHint }}</div>
    </main>
</template>

<script setup lang="ts">
/**
 * @file MV-MoleculeViewer.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:50
 * @desc 分子业务层一站式组件。组合引擎视口 + 四角浮层（ui.md §九开发顺序）。
 *       HUD 指标从引擎视口的 onFrame 回调同步（500ms 节流）；工具条命令
 *       （fit / grid）转发到引擎视口。本组件是整个应用唯一的视口宿主（ui.md §五）。
 * @copyright CC BY-NC-SA
 * */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { elementByZ } from '@wmv/structure';
import MvEngineViewport from '@/components/engine/MV-EngineViewport.vue';
import MvOverlayCorner from '@/components/base/MV-OverlayCorner.vue';
import MvViewportToolbar, { type ExclusiveTool, type ToggleTool } from '@/components/engine/MV-ViewportToolbar.vue';
import MvViewportHud, { type Metric } from '@/components/engine/MV-ViewportHud.vue';
import MvAxisGizmo from '@/components/engine/MV-AxisGizmo.vue';
import MvScaleBar from '@/components/engine/MV-ScaleBar.vue';
import type { Optional } from '@/types';
import type { CameraPose } from '@/composables/useEngine';
import { useMoleculeStore } from '@/stores/molecule.store';

const store = useMoleculeStore();

const { t } = useI18n();

defineProps<{
    /** 数据源（路径或文件）；引擎就绪后用于加载分子 */
    source?: Optional<string | File>;
}>();

const viewportRef = ref<Optional<InstanceType<typeof MvEngineViewport>>>();

// 视口工具状态
const toolExclusive = ref<ExclusiveTool>('rotate');
const toggleState = ref<Partial<Record<ToggleTool, boolean>>>({ fit: false, grid: false });

function onToggle(name: ToggleTool) {
    const next = !toggleState.value[name];
    toggleState.value = { ...toggleState.value, [name]: next };

    if (name === 'fit') {
        viewportRef.value?.fit();
    } else if (name === 'grid') {
        viewportRef.value?.toggleGrid();
    }
}

// 测距工具：进入/退出与 store 同步
watch(toolExclusive, (tool) => {
    store.setMeasureMode(tool === 'measure');
});

interface ScreenPoint {
    x: number;
    y: number;
}

const measure = ref<{
    points: ScreenPoint[];
    label: string;
    labelX: number;
    labelY: number;
    arc?: string;
} | null>(null);

const measureHint = computed(() => {
    if (!store.measureMode || measure.value) return '';

    const target = store.measureKind === 'dihedral' ? 4 : store.measureKind === 'angle' ? 3 : 2;
    const picked = store.measurement?.points.length ?? 0;

    if (picked === 0)
        if (store.measureKind === 'dihedral') return t('measure.pickFour');

        return t(store.measureKind === 'angle' ? 'measure.pickThree' : 'measure.pickTwo');

    return t('measure.need', {n: target - picked});
});

function pointsAttr(points: ScreenPoint[]): string {
    return points.map(point => `${point.x},${point.y}`).join(' ');
}

// HUD 状态（从引擎视口同步）
const hudReady = ref(false);
const hudMetrics = ref<Metric[]>([
    { key: 'fps',  value: '0.0', unit: 'fps' },
    { key: 'ms',   value: '0.00', unit: 'ms'  },
    { key: 'inst', value: '0', unit: 'inst' }
]);

// 比例尺（占位 —— 引擎接入后由相机距离换算）
const scale = ref({ width: 64, label: '10 Å' });

/** 口袋接触残基标注（屏幕坐标，每帧跟随相机） */
const labels = ref<Array<{text: string; x: number; y: number}>>([]);

// 从引擎视口轮询同步 HUD 指标
let rafId = 0;
function syncHud() {
    const vp = viewportRef.value;
    if (vp) {
        hudReady.value = vp.engineReady;
        const m = vp.metrics;
        hudMetrics.value = [
            { key: 'fps',  value: m.fps,  unit: 'fps' },
            { key: 'ms',   value: m.ms,   unit: 'ms'  },
            { key: 'inst', value: m.inst, unit: 'inst' }
        ];

        const projected: Array<{text: string; x: number; y: number}> = [];

        const addLabel = (text: string, position: readonly [number, number, number]): void => {
            const screen = vp.projectPoint?.(position);

            if (screen) projected.push({text, x: screen.x, y: screen.y});
        };

        const atomText = (index: number): string => {
            const data = store.structure;
            const residues = data?.residues;

            if (!data || !residues) return '';

            const r = data.atoms.residueIndex?.[index] ?? -1;
            const symbol = elementByZ(data.atoms.element[index] ?? 0).symbol;

            if (r < 0) return symbol;

            return `${symbol} ${residues.name[r]}${residues.seqNumber[r] ?? ''}`;
        };

        if (store.showLabels) {
            for (const label of store.focusLabels) addLabel(label.text, label.position);

            const selected = store.selectedAtom;

            if (selected) addLabel(atomText(selected.index), selected.position);

            for (const atom of store.measurement?.points ?? []) {
                const data = store.structure;
                const p = data?.atoms.positions;

                if (!p) continue;

                addLabel(atomText(atom), [
                    p[atom * 3]!, p[atom * 3 + 1]!, p[atom * 3 + 2]!,
                ]);
            }
        }

        labels.value = projected;

        const current = store.measurement;
        const data = store.structure;
        const atoms = current?.points ?? [];
        const screens: ScreenPoint[] = [];

        if (data) {
            const p = data.atoms.positions;

            for (const atom of atoms) {
                const screen = vp.projectPoint?.([
                    p[atom * 3]!, p[atom * 3 + 1]!, p[atom * 3 + 2]!,
                ]);

                if (screen) screens.push(screen);
            }
        }

        if (screens.length !== atoms.length || atoms.length < 2) {
            measure.value = null;
        } else if (store.measureKind === 'distance' && screens.length === 2) {
            const [a, b] = screens as [ScreenPoint, ScreenPoint];

            measure.value = {
                points: [a, b],
                label: `${store.measureDistance?.toFixed(2) ?? '—'} Å`,
                labelX: (a.x + b.x) / 2,
                labelY: (a.y + b.y) / 2,
            };
        } else if (store.measureKind === 'angle' && screens.length === 3) {
            const [a, b, c] = screens as [ScreenPoint, ScreenPoint, ScreenPoint];
            const a1 = Math.atan2(a.y - b.y, a.x - b.x);
            const a2 = Math.atan2(c.y - b.y, c.x - b.x);
            let delta = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            const radius = 26;
            const sx = b.x + Math.cos(a1) * radius;
            const sy = b.y + Math.sin(a1) * radius;
            const ex = b.x + Math.cos(a1 + delta) * radius;
            const ey = b.y + Math.sin(a1 + delta) * radius;
            const mid = a1 + delta / 2;

            measure.value = {
                points: [a, b, c],
                label: `${store.measureAngle?.toFixed(1) ?? '—'}°`,
                labelX: b.x + Math.cos(mid) * 42,
                labelY: b.y + Math.sin(mid) * 42,
                arc: `M ${sx} ${sy} A ${radius} ${radius} 0 0 ${delta > 0 ? 1 : 0} ${ex} ${ey}`,
            };
        } else if (store.measureKind === 'dihedral' && screens.length === 4) {
            const [a, b, c, d] = screens as [ScreenPoint, ScreenPoint, ScreenPoint, ScreenPoint];

            measure.value = {
                points: [a, b, c, d],
                label: `${store.measureDihedral?.toFixed(1) ?? '—'}°`,
                labelX: (b.x + c.x) / 2,
                labelY: (b.y + c.y) / 2,
            };
        } else {
            measure.value = null;
        }
    }
    rafId = requestAnimationFrame(syncHud);
}

onMounted(() => {
    syncHud();
});

defineExpose({
    viewportRef,
    fit: () => viewportRef.value?.fit(),
    cameraPose: () => viewportRef.value?.cameraPose(),
    setCameraPose: (pose: CameraPose) => viewportRef.value?.setCameraPose(pose),
    animateCameraPose: (pose: CameraPose, durationMs?: number) => viewportRef.value?.animateCameraPose(pose, durationMs),
    projectPoint: (position: readonly [number, number, number]) => viewportRef.value?.projectPoint(position),
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-molecule-viewer
    position: relative
    display: flex
    flex: 1
    min-width: 0
    min-height: 0

.mmv-labels
    position: absolute
    inset: 0
    pointer-events: none
    overflow: hidden
    z-index: 2

.mmv-label
    position: absolute
    top: 0
    left: 0
    display: flex
    align-items: center
    gap: 6px
    transform-origin: 0 0
    margin: -10px 0 0 10px

.mmv-label-dot
    width: 5px
    height: 5px
    border-radius: 50%
    background: var(--accent)
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent)

.mmv-label-text
    padding: 2px 7px
    font-family: var(--font-mono)
    font-size: 10px
    color: var(--fg)
    background: color-mix(in srgb, var(--bg-panel) 82%, transparent)
    border: 1px solid var(--line)
    border-radius: 999px
    backdrop-filter: blur(6px)
    white-space: nowrap

.mmv-measure
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    pointer-events: none
    overflow: visible

    line, polyline, path
        fill: none
        stroke: var(--accent)
        stroke-width: 1.3
        stroke-dasharray: 5 3

    circle
        fill: var(--accent)
        stroke: var(--bg-panel)
        stroke-width: 1.5

    rect
        fill: color-mix(in srgb, var(--bg-panel) 90%, transparent)
        stroke: var(--line)
        stroke-width: 1

    text
        font-family: var(--font-mono)
        font-size: 10px
        fill: var(--fg)

.mmv-measure-switch
    position: absolute
    top: 12px
    left: 50%
    transform: translateX(-50%)
    display: flex
    gap: 2px
    padding: 2px
    background: color-mix(in srgb, var(--bg-panel) 86%, transparent)
    border: 1px solid var(--line)
    border-radius: 999px
    backdrop-filter: blur(6px)
    z-index: 3

    button
        padding: 3px 10px
        font-size: 10.5px
        color: var(--fg-muted)
        background: transparent
        border: 0
        border-radius: 999px
        cursor: pointer

        &.is-active
            color: var(--fg)
            background: var(--accent-soft)

.mmv-measure-hint
    position: absolute
    left: 50%
    bottom: 44px
    transform: translateX(-50%)
    padding: 6px 12px
    font-size: 11px
    color: var(--fg-muted)
    background: color-mix(in srgb, var(--bg-panel) 84%, transparent)
    border: 1px solid var(--line)
    border-radius: 999px
    pointer-events: none
    backdrop-filter: blur(6px)
    z-index: 2
</style>








