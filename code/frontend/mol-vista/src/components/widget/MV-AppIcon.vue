<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <svg
        v-if="paths.length"
        class="mv-app-icon mvai-ico"
        viewBox="0 0 16 16"
        :class="$attrs.class"
        aria-hidden="true"
    >
        <path
            v-for="(d, i) in paths"
            :key="i"
            :d="d"
            :fill="kind === 'logo' ? 'none' : 'none'"
            :stroke="'currentColor'"
            :stroke-width="kind === 'logo' ? 1.6 : 1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
        />
    </svg>
</template>

<script setup lang="ts">
/**
 * @file MV-AppIcon.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 15:30
 * @desc 应用图标库。根据 name 内联渲染 SVG path，避免 <symbol>+<use> 在 scoped 样式下失效的问题。
 *       维护约定：新增图标时在此处追加 name→path[] 映射，不要在外部组件里写裸 SVG。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';

type IconName =
    | 'logo'
    | 'upload'
    | 'fit'
    | 'target'
    | 'rotate'
    | 'pan'
    | 'pick'
    | 'measure'
    | 'grid'
    | 'play'
    | 'step'
    | 'reset'
    | 'sun'
    | 'moon'
    | 'auto';

const props = defineProps<{
    /** 图标名称 */
    name: IconName;
}>();

const kind = computed(() => props.name);

const catalog: Record<IconName, string[]> = {
    logo: [
        // 三原子 + 三键（简化 logo，在 24×24 viewBox 里绘制，但这里复用 16×16 缩放）
        // 这里复用 rotate 的占位 path —— 真实 logo 在 MV-AppTopBar 内联渲染（带 brand mark 风格）
        'M12 4a4 4 0 1 1-1.5 3.1', 'M12 1.4v3.3h-3.3'
    ],
    upload: [
        'M8 10.4V2.6',
        'M5.2 5.2 8 2.4l2.8 2.8',
        'M2.6 10v2.5a1 1 0 0 0 1 1h8.8a1 1 0 0 0 1-1V10'
    ],
    fit: [
        'M2 5.6V2.4h3.2M14 5.6V2.4h-3.2M2 10.4v3.2h3.2M14 10.4v3.2h-3.2'
    ],
    target: [
        'M8 1.2v2.2M8 12.6v2.2M1.2 8h2.2M12.6 8h2.2', 'M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9'
    ],
    rotate: ['M13.4 8a5.4 5.4 0 1 1-1.9-4.1', 'M13.4 1.9v3.3h-3.3'],
    pan: [
        'M8 1.6v12.8M1.6 8h12.8',
        'M8 1.6 6.3 3.4M8 1.6l1.7 1.8M8 14.4l-1.7-1.8M8 14.4l1.7-1.8M1.6 8l1.8-1.7M1.6 8l1.8 1.7M14.4 8l-1.8-1.7M14.4 8l-1.8 1.7'
    ],
    pick: ['M3.2 2.2 12 7.4l-3.9.8-1.6 3.6z'],
    measure: [
        'M1.4 5.6h13.2v4.8H1.4z', 'M4.6 5.6v1.8M7.2 5.6v2.6M9.8 5.6v1.8M12.4 5.6v2.6'
    ],
    grid: ['M2.2 2.2h11.6v11.6H2.2z', 'M6.1 2.2v11.6M9.9 2.2v11.6M2.2 6.1h11.6M2.2 9.9h11.6'],
    play: ['M5 3.4 12.4 8 5 12.6z'],
    step: ['M4 3.4 10.6 8 4 12.6z', 'M12.4 3.4v9.2'],
    reset: ['M2.6 8a5.4 5.4 0 1 0 1.9-4.1', 'M2.6 1.9v3.3h3.3'],
    sun: [
        'M8 4.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z',
        'M8 1.4v1.8M8 12.8v1.8M1.4 8h1.8M12.8 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3'
    ],
    moon: ['M13.2 9.8A5.6 5.6 0 0 1 6.2 2.8a5.6 5.6 0 1 0 7 7z'],
    auto: ['M1.8 3.2h12.4v9.6H1.8z', 'M1.8 6.4h12.4']
};

const paths = computed(() => catalog[props.name] ?? []);
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-app-icon
    width: 15px
    height: 15px
    fill: none
    stroke: currentColor
    stroke-width: 1.4
    stroke-linecap: round
    stroke-linejoin: round
</style>
