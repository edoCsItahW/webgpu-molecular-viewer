<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <dl class="mv-key-value-list mvkvl-list">
        <div
            v-for="row in rows"
            :key="row.key"
            class="mvkvl-row"
        >
            <dt>{{ row.key }}</dt>
            <dd :class="{ 'mv-mono': row.mono }">{{ row.value }}</dd>
        </div>
    </dl>
</template>

<script setup lang="ts">
/**
 * @file MV-KeyValueList.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 16:00
 * @desc 键值对列表。原子卡片的属性展示用。
 * @copyright CC BY-NC-SA
 * */

interface KVRow {
    key: string;
    value: string | number;
    /** 数值类用等宽字体（ui.md §八：坐标 3 位、能量 2 位） */
    mono?: boolean;
}

defineProps<{
    /** 行 */
    rows: KVRow[];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mv-key-value-list
    padding-top: 6px

.mvkvl-row
    display: grid
    grid-template-columns: 1fr auto
    gap: 10px
    padding: 4px 0
    font-size: 11.5px

    dt
        color: var(--fg-muted)

    dd
        text-align: right
        color: var(--fg)
        margin: 0
</style>
