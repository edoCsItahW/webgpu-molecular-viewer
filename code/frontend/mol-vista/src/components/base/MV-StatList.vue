<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <dl class="mv-stat-list mvsl-list">
        <div
            v-for="row in rows"
            :key="row.label"
            class="mvsl-row"
        >
            <span class="mvsl-label">{{ row.label }}</span>
            <i class="mvsl-leader" />
            <b class="mvsl-value mv-mono">{{ row.value }}</b>
        </div>
    </dl>
</template>

<script setup lang="ts">
/**
 * @file MV-StatList.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:00
 * @desc 统计列表。每行 label / 点线引导 / 等宽值。用于分子统计、能量等。
 * @copyright CC BY-NC-SA
 * */

interface StatRow {
    label: string;
    value: string | number;
}

defineProps<{
    /** 统计行 */
    rows: StatRow[];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-stat-list
    display: flex
    flex-direction: column

.mvsl-row
    display: flex
    align-items: baseline
    gap: 7px
    padding: 3px 0
    font-size: 11.5px

.mvsl-label
    color: var(--fg-muted)
    white-space: nowrap

.mvsl-leader
    flex: 1
    border-bottom: 1px dotted var(--line-strong)
    transform: translateY(-3px)

.mvsl-value
    font-family: $font-mono
    font-size: 11.5px
    font-weight: 500
    font-variant-numeric: tabular-nums
</style>
