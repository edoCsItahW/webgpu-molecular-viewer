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

        <!-- 品牌 + 站点导航 -->
        <div class="matb-left">
            <router-link class="matb-brand" to="/">
                <span class="matb-mark" aria-hidden="true">
                    <span class="matb-orbit" />
                    <span class="matb-core" />
                </span>
                <span class="matb-brand-name">{{ $t('common.projectName') }}</span>
                <span class="matb-brand-tag">WORKBENCH</span>
            </router-link>

            <nav class="matb-nav" aria-label="站点导航">
                <router-link to="/showcase">官网</router-link>
            </nav>
        </div>

        <!-- 结构元信息 -->
        <div class="matb-doc" :aria-label="$t('topbar.doc.ariaLabel')">
            <span class="matb-live" aria-hidden="true" />
            <span class="matb-doc-name">{{ docName }}</span>
            <span v-if="docLabel" class="matb-chip matb-chip--accent">{{ docLabel }}</span>
            <span class="matb-chip">{{ atomCount }} {{ $t('topbar.doc.atoms') }}</span>
            <span v-if="resolution" class="matb-chip">{{ resolution }}</span>
        </div>

        <!-- 操作 -->
        <div class="matb-right">

            <div class="matb-tools">
                <mv-icon-button
                    name="upload"
                    :label="$t('topbar.importStructure')"
                    @click="emit('import')"
                />
                <mv-icon-button
                    name="grid"
                    :label="$t('library.title')"
                    @click="emit('library')"
                />
                <mv-icon-button
                    name="fit"
                    :label="$t('topbar.fitView')"
                    @click="emit('fit')"
                />
                <span class="matb-divider" aria-hidden="true" />
                <mv-icon-button
                    name="share"
                    :label="$t('topbar.share')"
                    @click="emit('share')"
                />
                <mv-icon-button
                    name="camera"
                    :label="$t('topbar.screenshot')"
                    @click="emit('screenshot')"
                />
            </div>


        </div>

    </header>

</template>

<script setup lang="ts">
/**
 * @file MV-AppTopBar.vue
 * @author edocsitahw
 * @version 2.0
 * @date 2026/11/02
 * @desc 工作台顶栏：品牌 / 文档胶囊 / 操作组。官网入口与工作台共用一套品牌语言。
 * @copyright CC BY-NC-SA
 * */
import { computed } from 'vue';
import MvIconButton from '@/components/widget/MV-IconButton.vue';
import { useMoleculeStore } from '@/stores/molecule.store';

const store = useMoleculeStore();

const docName = computed(() => store.name || '未加载结构');
const docLabel = computed(() => (store.structure?.meta.sourceFormat ?? '').toUpperCase());
const atomCount = computed(() => store.atomCount);
const resolution = computed(() => (store.chainCount > 0 ? `${store.chainCount} 链` : ''));

const emit = defineEmits<{
    /** 用户请求导入结构文件 */
    import: [];
    /** 用户请求打开示例库 */
    library: [];
    /** 用户请求复制分享链接 */
    share: [];
    /** 用户请求导出当前画面 */
    screenshot: [];
    /** 用户请求适应视图 */
    fit: [];
}>();
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.matb
    position: relative
    z-index: 5
    display: grid
    grid-template-columns: auto minmax(0, 1fr) auto
    align-items: center
    gap: 18px
    height: 54px
    flex: none
    padding: 0 4px

    &-left
        display: flex
        align-items: center
        gap: 22px
        min-width: 0

    &-brand
        display: flex
        align-items: center
        gap: 9px
        color: var(--fg)

    &-mark
        position: relative
        width: 24px
        height: 24px
        display: grid
        place-items: center

    &-orbit
        position: absolute
        inset: 0
        border: 1px solid rgba(200, 255, 90, .72)
        border-radius: 50%
        transform: rotate(-24deg) scaleY(.52)

    &-core
        width: 7px
        height: 7px
        border-radius: 50%
        background: var(--accent)
        box-shadow: 0 0 14px rgba(200, 255, 90, .7)

    &-brand-name
        font-size: 16px
        font-weight: 700
        letter-spacing: -.035em

    &-brand-tag
        margin-left: 2px
        padding-left: 10px
        border-left: 1px solid rgba(255, 255, 255, .12)
        font-family: var(--font-mono)
        font-size: 8px
        letter-spacing: .16em
        color: rgba(244, 247, 249, .38)

    &-nav
        display: flex
        align-items: center

        a
            font-size: 11.5px
            color: rgba(244, 247, 249, .52)
            transition: color .2s

            &:hover
                color: var(--fg)

    &-doc
        display: flex
        align-items: center
        justify-self: center
        gap: 8px
        min-width: 0
        max-width: 100%
        padding: 5px 10px 5px 12px
        background: rgba(255, 255, 255, .035)
        border: 1px solid rgba(255, 255, 255, .08)
        border-radius: 999px
        backdrop-filter: blur(16px)

    &-live
        width: 5px
        height: 5px
        flex: none
        border-radius: 50%
        background: var(--accent)
        box-shadow: 0 0 9px rgba(200, 255, 90, .8)

    &-doc-name
        max-width: 240px
        overflow: hidden
        font-size: 11.5px
        font-weight: 550
        text-overflow: ellipsis
        white-space: nowrap

    &-chip
        padding: 1px 6px
        font-family: var(--font-mono)
        font-size: 8.5px
        color: rgba(244, 247, 249, .45)
        border: 1px solid rgba(255, 255, 255, .09)
        border-radius: 999px
        white-space: nowrap

        &--accent
            color: var(--accent)
            border-color: rgba(200, 255, 90, .25)
            background: rgba(200, 255, 90, .06)

    &-right
        display: flex
        align-items: center

    &-tools
        display: flex
        align-items: center
        gap: 2px
        padding: 3px
        background: rgba(255, 255, 255, .035)
        border: 1px solid rgba(255, 255, 255, .08)
        border-radius: 12px
        backdrop-filter: blur(14px)

    &-divider
        width: 1px
        height: 16px
        margin: 0 3px
        background: rgba(255, 255, 255, .1)

    :deep(.mv-icon-button)
        width: 30px
        height: 30px
        color: rgba(244, 247, 249, .55)
        border-radius: 8px

        &:hover
            color: var(--fg)
            background: rgba(255, 255, 255, .06)

@media (max-width: 1180px)
    .matb-doc
        justify-self: start

    .matb-chip:last-child
        display: none

@media (max-width: 940px)
    .matb
        grid-template-columns: auto 1fr

    .matb-doc
        display: none

    .matb-brand-tag, .matb-nav
        display: none
</style>

