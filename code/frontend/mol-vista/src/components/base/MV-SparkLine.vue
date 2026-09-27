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
        class="mv-spark-line mvsl-graph"
        viewBox="0 0 200 44"
        preserveAspectRatio="none"
        aria-hidden="true"
    >
        <polygon
            v-if="areaPath"
            class="mvsl-area"
            :points="areaPath"
        />
        <polyline
            class="mvsl-line"
            :points="linePath"
        />
    </svg>
</template>

<script setup lang="ts">
/**
 * @file MV-SparkLine.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:00
 * @desc 迷你折线（能量曲线等）。SVG 实现，避免每帧分配大量 DOM（ui.md §八：性能）。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
    /** 数据点。横轴等距分布在 [0, width] 上，纵轴按 max/min 标准化 */
    values: number[];
    /** 容器宽度（viewBox 单位） */
    width?: number;
    /** 容器高度（viewBox 单位） */
    height?: number;
    /** y 轴上界，缺省自动取 max */
    yMax?: number;
    /** y 轴下界，缺省自动取 min */
    yMin?: number;
    /** 是否绘制填充区域 */
    area?: boolean;
}>(), {
    width: 200,
    height: 44,
    area: true
});

const linePath = computed(() => {
    const v = props.values;
    if (v.length === 0) return '';
    const max = props.yMax ?? Math.max(...v);
    const min = props.yMin ?? Math.min(...v);
    const range = max - min || 1;
    const step = props.width / (v.length - 1 || 1);
    return v.map((y, i) => {
        const x = i * step;
        const ny = props.height - ((y - min) / range) * props.height;
        return `${x.toFixed(1)},${ny.toFixed(1)}`;
    }).join(' ');
});

const areaPath = computed(() => {
    if (!props.area) return '';
    const v = props.values;
    if (v.length === 0) return '';
    const max = props.yMax ?? Math.max(...v);
    const min = props.yMin ?? Math.min(...v);
    const range = max - min || 1;
    const step = props.width / (v.length - 1 || 1);
    const top = v.map((y, i) => {
        const x = i * step;
        const ny = props.height - ((y - min) / range) * props.height;
        return `${x.toFixed(1)},${ny.toFixed(1)}`;
    }).join(' ');
    return `0,${props.height} ${top} ${props.width},${props.height}`;
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-spark-line
    width: 100%
    height: 44px
    margin-top: 10px
    display: block

.mvsl-line
    fill: none
    stroke: var(--accent)
    stroke-width: 1.5
    stroke-linejoin: round
    stroke-linecap: round

.mvsl-area
    fill: var(--accent-soft)
    stroke: none
</style>
