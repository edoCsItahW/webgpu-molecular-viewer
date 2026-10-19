<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="mv-engine-viewport mev-stage">
        <div class="mev-scene">
            <!-- WebGPU canvas（引擎未接入前为空，仅占位以保持唯一视口契约 ui.md §五） -->
            <canvas ref="canvasRef" class="mev-canvas" />

            <!-- 静态 SVG 占位：引擎未就绪或 WebGPU 不可用时显示示意分子结构 -->
            <svg
                v-if="!engineReady || !webgpuAvailable"
                class="mev-molecule"
                viewBox="0 0 600 400"
                preserveAspectRatio="xMidYMid meet"
                :aria-label="webgpuAvailable ? '分子结构加载中' : 'WebGPU 不可用，显示静态占位'"
            >
                <defs>
                    <radialGradient id="mev-gC" cx="34%" cy="28%" r="78%">
                        <stop offset="0%" stop-color="#8f97a6" />
                        <stop offset="52%" stop-color="#49505d" />
                        <stop offset="100%" stop-color="#232830" />
                    </radialGradient>
                    <radialGradient id="mev-gO" cx="34%" cy="28%" r="78%">
                        <stop offset="0%" stop-color="#ffa79b" />
                        <stop offset="52%" stop-color="#e04a3a" />
                        <stop offset="100%" stop-color="#7d1f16" />
                    </radialGradient>
                    <radialGradient id="mev-gN" cx="34%" cy="28%" r="78%">
                        <stop offset="0%" stop-color="#9dbcff" />
                        <stop offset="52%" stop-color="#3b6fe0" />
                        <stop offset="100%" stop-color="#1a326e" />
                    </radialGradient>
                    <radialGradient id="mev-gH" cx="34%" cy="28%" r="78%">
                        <stop offset="0%" stop-color="#ffffff" />
                        <stop offset="58%" stop-color="#d9dce1" />
                        <stop offset="100%" stop-color="#8d939c" />
                    </radialGradient>
                </defs>

                <g class="mev-bond">
                    <line x1="250" y1="190" x2="320" y2="165" />
                    <line x1="320" y1="165" x2="375" y2="215" />
                    <line x1="375" y1="215" x2="330" y2="268" />
                    <line x1="330" y1="268" x2="258" y2="258" />
                    <line x1="258" y1="258" x2="250" y2="190" />
                    <line x1="375" y1="215" x2="432" y2="180" />
                    <line x1="258" y1="258" x2="188" y2="236" />
                    <line x1="375" y1="215" x2="452" y2="258" />
                    <line x1="452" y1="258" x2="522" y2="236" />
                    <line x1="250" y1="190" x2="222" y2="146" />
                    <line x1="320" y1="165" x2="318" y2="110" />
                    <line x1="330" y1="268" x2="288" y2="316" />
                </g>

                <g class="mev-atom">
                    <circle cx="250" cy="190" r="24" fill="url(#mev-gC)" />
                    <circle cx="320" cy="165" r="24" fill="url(#mev-gC)" />
                    <circle cx="375" cy="215" r="24" fill="url(#mev-gC)" />
                    <circle cx="330" cy="268" r="24" fill="url(#mev-gC)" />
                    <circle cx="258" cy="258" r="24" fill="url(#mev-gC)" />
                    <circle cx="452" cy="258" r="22" fill="url(#mev-gC)" />
                    <circle cx="432" cy="180" r="20" fill="url(#mev-gO)" />
                    <circle cx="522" cy="236" r="20" fill="url(#mev-gO)" />
                    <circle cx="188" cy="236" r="20" fill="url(#mev-gN)" />
                    <circle cx="222" cy="146" r="11" fill="url(#mev-gH)" />
                    <circle cx="318" cy="110" r="11" fill="url(#mev-gH)" />
                    <circle cx="288" cy="316" r="11" fill="url(#mev-gH)" />
                </g>
            </svg>
        </div>

        <!-- 浮层插槽：MoleculeViewer 在这里挂四角的 Toolbar/HUD/Gizmo/ScaleBar -->
        <slot />
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-EngineViewport.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:40
 * @desc 引擎视口容器。绑定 canvas 到 WebGPU Renderer，引擎就绪后渲染真实 3D 分子；
 *       未就绪或浏览器不支持 WebGPU 时显示 SVG 示意占位。GPU 对象由 useEngine 持有，
 *       通过 provide 透传给子组件（HUD / Gizmo 等），绝不进 Pinia（ui.md §六）。
 * @copyright CC BY-NC-SA
 * */
import { onMounted, provide, ref, shallowRef } from 'vue';
import { ENGINE_KEY, type EngineContext } from '@/utils/constants';
import { useEngine, type EngineHandle } from '@/composables/useEngine';

const canvasRef = ref<HTMLCanvasElement | null>(null);
const handle = shallowRef<EngineHandle | null>(null);

const engineReady = ref(false);
const webgpuAvailable = ref(true);
const metrics = ref({ fps: '0.0', ms: '0.00', inst: '0' });

onMounted(() => {
    handle.value = useEngine(canvasRef, (h) => {
        engineReady.value = h.ready.value;
        webgpuAvailable.value = h.webgpuAvailable.value;
    });

    // 响应式同步 ready / metrics 到本地 ref，供模板与 provide 使用
    if (handle.value) {
        engineReady.value = handle.value.ready.value;
        webgpuAvailable.value = handle.value.webgpuAvailable.value;
    }
});

// 轮询同步（ready 是异步置位的）
function syncMetrics() {
    if (handle.value) {
        engineReady.value = handle.value.ready.value;
        webgpuAvailable.value = handle.value.webgpuAvailable.value;
        metrics.value = handle.value.metrics.value;
    }
    requestAnimationFrame(syncMetrics);
}
requestAnimationFrame(syncMetrics);

const ctx: EngineContext = { ready: engineReady };
provide(ENGINE_KEY, ctx);

defineExpose({
    canvasRef,
    engineReady,
    webgpuAvailable,
    metrics,
    fit: () => handle.value?.fit(),
    toggleGrid: () => handle.value?.toggleGrid(),
    toggleHydrogens: () => handle.value?.toggleHydrogens(),
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-engine-viewport
    position: relative
    // 关键：本元素是 .mv-molecule-viewer（display: flex）的 flex item，
    // 而它的在流内容只有绝对定位的浮层（.mev-scene / 四角 overlay），
    // 不写 flex 主轴尺寸时按内容宽度收缩 → 宽度塌成 0 → canvas 只有 1px 宽（视口一片黑的根因）。
    flex: 1 1 auto
    width: 100%
    min-width: 0
    min-height: 0
    overflow: hidden
    background-color: var(--bg-sunken)
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px)
    background-size: 26px 26px
    background-position: center center

    &::after
        content: ''
        position: absolute
        inset: 0
        pointer-events: none
        background: radial-gradient(120% 95% at 50% 44%, transparent 38%, var(--vig) 100%)

.mev-scene
    position: absolute
    inset: 0

// canvas 必须"绝对定位 + 显式 100%"两条一起写：
//   1) canvas 是 replaced element，只写 position:absolute; inset:0 不会拉伸它 —— 它仍按固有尺寸
//      (默认 300×150) 摆放，所以必须显式给 width/height:100%；
//   2) 百分比要相对"尺寸确定"的包含块解析。之前用 display:grid + place-items:center 让 canvas 的
//      百分比高度落在 auto 轨道上，轨道尺寸又取决于 canvas 的固有尺寸（由 GPUContext 按
//      clientWidth/clientHeight 回写 attributes）→ 自我放大反馈，实测 backbuffer 涨到 772×526504，
//      超过 maxTextureDimension2D 后每帧 GPUValidationError、画面全黑且看不出原因。
.mev-canvas
    position: absolute
    inset: 0
    width: 100%
    height: 100%
    display: block

.mev-molecule
    position: absolute
    inset: 0
    margin: auto
    width: 100%
    height: 100%
    max-width: 760px
    max-height: 560px

.mev-bond
    stroke: var(--bond)
    stroke-width: 9
    stroke-linecap: round

.mev-atom
    stroke: var(--atom-stroke)
    stroke-width: 1
</style>
