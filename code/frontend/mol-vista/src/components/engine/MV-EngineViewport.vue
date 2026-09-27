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

            <!-- 静态 SVG 占位：引擎未就绪时显示示意分子结构 -->
            <svg
                v-if="!engineReady"
                class="mev-molecule"
                viewBox="0 0 600 400"
                preserveAspectRatio="xMidYMid meet"
                aria-label="分子结构预览"
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
 * @desc 引擎视口容器。当前为静态占位阶段：保留 canvas（ui.md §五：视口唯一契约）
 *       + 内联 SVG 示意分子。@mol/engine 接入后，canvas 由 Renderer 驱动，
 *       SVG 占位在 engineReady=true 时移除。GPU 对象将通过 provide(InjectionKey) 透传，
 *       绝不进 Pinia（ui.md §六）。
 * @copyright CC BY-NC-SA
 * */
import { ref, provide } from 'vue';
import type { Optional } from '@/types';
import { ENGINE_KEY, type EngineContext } from '@/utils/constants';

const canvasRef = ref<Optional<HTMLCanvasElement>>(null);
const engineReady = ref(false);

const ctx: EngineContext = { ready: engineReady };
provide(ENGINE_KEY, ctx);

defineExpose({ canvasRef, engineReady });
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-engine-viewport
    position: relative
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
    display: grid
    place-items: center
    padding: 24px

.mev-canvas
    width: 100%
    height: 100%
    display: block

.mev-molecule
    position: absolute
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
