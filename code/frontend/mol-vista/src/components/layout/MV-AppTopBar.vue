<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>

    <header class="mv-app-top-bar matb">

        <!-- 品牌: logo + 项目名 + 项目副标题 -->
        <div class="matb-brand">
            <!-- 真实 logo：三原子 + 三键，内联渲染（MV-AppIcon 的 'logo' 仅占位，见 MV-AppIcon.vue 注释） -->
            <svg
                class="matb-brand-mark"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                aria-hidden="true"
            >
                <circle cx="12" cy="5.6" r="2.6" />
                <circle cx="5.4" cy="16.4" r="2.6" />
                <circle cx="18.6" cy="16.4" r="2.6" />
                <path d="M10.4 7.8 7 14.2M13.6 7.8 17 14.2M8 16.4h8" />
            </svg>

            <!-- 项目名 -->
            <span class="matb-brand-name">{{ $t('common.projectName') }}</span>

            <!-- 项目副标题 -->
            <span class="matb-brand-sub">{{ $t('mainView.subTitle') }}</span>

        </div>

        <!-- 结构元信息：文件名 + 描述/规模/分辨率 chips。TODO: 当前为静态占位 -->
        <div class="matb-doc" :aria-label="$t('topbar.doc.ariaLabel')">
            <span class="matb-doc-name mono">{{ docName }}</span>
            <span v-if="docLabel" class="matb-chip matb-chip--accent">{{ docLabel }}</span>
            <span class="matb-chip">{{ atomCount }} {{ $t('topbar.doc.atoms') }}</span>
            <span v-if="resolution" class="matb-chip">{{ resolution }}</span>
        </div>

        <!-- 操作 + 主题 -->
        <div class="matb-right">

            <!-- 导入 -->
            <mv-icon-button
                name="upload"
                :label="$t('topbar.importStructure')"
                @click="emit('import')"
            />

            <!-- 适应视图 -->
            <mv-icon-button
                name="fit"
                :label="$t('topbar.fitView')"
                @click="emit('fit')"
            />

            <!-- 主题切换器 -->
            <mv-theme-switcher />

        </div>

    </header>

</template>

<script setup lang="ts">
/**
 * @file MV-AppTopBar.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:00
 * @desc 顶栏编排块。三段：品牌 / 结构元信息 chips / 操作 + 主题。
 *       约定（ui.md §二）：顶栏**不放视口** —— 历史缺陷是顶栏嵌了一个 MoleculeViewer
 *       造成两个 GPU 上下文；本组件只负责摆放，视口唯一性由 MV-MainView 保证。
 *       文案走 i18n；结构元信息（名称/格式/原子数/警告徽标）后续由 Workbench 只读镜像注入。
 * @copyright CC BY-NC-SA
 * */
import MvThemeSwitcher from '@/components/widget/MV-ThemeSwitcher.vue';
import MvIconButton from '@/components/widget/MV-IconButton.vue';

// 临时占位数据 —— Workbench 接入后由 props/store 注入
const docName = '1crn.pdb';
const docLabel = 'Crambin';
const atomCount = 327;
const resolution = '1.5 Å';

const emit = defineEmits<{
    /** 用户请求导入结构文件 */
    import: [];
    /** 用户请求适应视图 */
    fit: [];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.matb
    display: grid
    grid-template-columns: auto minmax(0, 1fr) auto
    align-items: center
    gap: 16px
    padding: 0 12px 0 14px
    height: 46px
    flex: none
    background: var(--bg-panel)
    border-bottom: 1px solid var(--line)

    &-brand
        display: flex
        align-items: center
        gap: 9px

        &-mark
            width: 20px
            height: 20px
            flex: none
            color: var(--accent)

        &-name
            font-size: 13px
            font-weight: 650
            letter-spacing: .02em

        &-sub
            font-size: 10px
            letter-spacing: .07em
            text-transform: uppercase
            color: var(--fg-faint)
            padding-left: 8px
            margin-left: 2px
            border-left: 1px solid var(--line-strong)

            +below(1180px)
                display: none

    &-doc
        display: flex
        align-items: center
        gap: 8px
        justify-content: center
        min-width: 0

        &-name
            font-size: 12px
            font-weight: 550
            letter-spacing: .01em
            +ellipsis()

    &-chip
        display: inline-flex
        align-items: center
        padding: 1px 6px
        border-radius: 2px
        font-family: var(--font-mono)
        font-size: 9.5px
        letter-spacing: .08em
        text-transform: uppercase
        color: var(--fg-muted)
        border: 1px solid var(--line-strong)
        background: var(--bg-sunken)
        white-space: nowrap

        &.matb-chip--accent
            color: var(--accent)
            border-color: var(--accent)
            background: var(--accent-soft)

    &-right
        display: flex
        align-items: center
        gap: 6px
</style>
