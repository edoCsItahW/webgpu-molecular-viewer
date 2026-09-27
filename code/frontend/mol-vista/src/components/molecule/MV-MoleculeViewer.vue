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
    </main>
</template>

<script setup lang="ts">
/**
 * @file MV-MoleculeViewer.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:50
 * @desc 分子业务层一站式组件。组合引擎视口 + 四角浮层（ui.md §九开发顺序）。
 *       当前为静态占位阶段：所有视口数据由父级以 props 注入，引擎接入后改为
 *       engine frame 事件驱动（ui.md §六：GPU 对象走 provide/inject，不进 Pinia）。
 *       注意（ui.md §五）：本组件是整个应用唯一的视口宿主，顶栏不再嵌套 molecule-viewer。
 * @copyright CC BY-NC-SA
 * */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MvEngineViewport from '@/components/engine/MV-EngineViewport.vue';
import MvOverlayCorner from '@/components/base/MV-OverlayCorner.vue';
import MvViewportToolbar, { type ExclusiveTool, type ToggleTool } from '@/components/engine/MV-ViewportToolbar.vue';
import MvViewportHud, { type Metric } from '@/components/engine/MV-ViewportHud.vue';
import MvAxisGizmo from '@/components/engine/MV-AxisGizmo.vue';
import MvScaleBar from '@/components/engine/MV-ScaleBar.vue';
import type { Optional } from '@/types';

const { t } = useI18n();

defineProps<{
    /** 数据源（路径或文件）；引擎就绪后用于加载分子 */
    source?: Optional<string | File>;
}>();

const viewportRef = ref<Optional<InstanceType<typeof MvEngineViewport>>>();

// 视口工具状态（静态占位 —— 引擎接入后由控制器驱动）
const toolExclusive = ref<ExclusiveTool>('rotate');
const toggleState = ref<Partial<Record<ToggleTool, boolean>>>({ fit: false, grid: false });

function onToggle(name: ToggleTool) {
    toggleState.value = { ...toggleState.value, [name]: !toggleState.value[name] };
}

// HUD 状态（占位数据；引擎就绪后由 onFrame → 500ms 节流更新）
const hudReady = ref(false);
const hudMetrics = ref<Metric[]>([
    { key: 'fps',  value: '60.0', unit: 'fps' },
    { key: 'ms',   value: '0.42', unit: 'ms'  },
    { key: 'inst', value: '3.1k', unit: 'inst' }
]);

// 比例尺（占位 —— 引擎接入后由相机距离换算）
const scale = ref({ width: 64, label: '10 Å' });

defineExpose({ viewportRef });
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-molecule-viewer
    position: relative
    display: flex
    flex: 1
    min-width: 0
    min-height: 0
</style>
