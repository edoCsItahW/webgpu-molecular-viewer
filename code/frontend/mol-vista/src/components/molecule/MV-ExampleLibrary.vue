<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div v-if="open" class="mel" @click.self="close">
        <section class="mel-dialog" role="dialog" aria-modal="true" :aria-label="t('library.title')">
            <header class="mel-head">
                <div>
                    <p class="mel-kicker">MolVista</p>
                    <h2 class="mel-title">{{ t('library.title') }}</h2>
                </div>

                <button type="button" class="mel-close" :aria-label="t('library.close')" @click="close">×</button>
            </header>

            <div class="mel-toolbar">
                <input
                    v-model="query"
                    class="mel-search"
                    type="search"
                    :placeholder="t('library.search')"
                    autofocus
                >

                <div class="mel-chips">
                    <button
                        v-for="category in categories"
                        :key="category.value"
                        type="button"
                        class="mel-chip"
                        :class="{'is-active': activeCategory === category.value}"
                        @click="activeCategory = category.value"
                    >
                        {{ category.label }}
                        <span class="mel-chip-count">{{ category.count }}</span>
                    </button>
                </div>
            </div>

            <p v-if="error" class="mel-error">{{ error }}</p>

            <div class="mel-grid">
                <button
                    v-for="entry in filtered"
                    :key="entry.id"
                    type="button"
                    class="mel-card"
                    :disabled="loadingId !== null"
                    @click="load(entry)"
                >
                    <span class="mel-card-top">
                        <span class="mel-card-name">{{ entry.name }}</span>
                        <span class="mel-badge">{{ entry.format.toUpperCase() }}</span>
                    </span>

                    <span class="mel-card-desc">{{ entry.description }}</span>

                    <span class="mel-card-tags">
                        <span v-for="tag in entry.tags" :key="tag" class="mel-tag">{{ tag }}</span>
                    </span>

                    <span v-if="loadingId === entry.id" class="mel-card-loading">{{ t('library.loading') }}</span>
                </button>
            </div>

            <p v-if="filtered.length === 0" class="mel-empty">{{ t('library.empty') }}</p>
        </section>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ExampleLibrary.vue
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 示例库面板：分类 / 搜索 / 点击加载。
 *
 *       数据源 `src/data/examples.json`；结构文件由 `scripts/sync-examples.mjs`
 *       在 dev/build 前从 `code/backend/assets` 复制到 `public/examples/`。
 * @copyright CC BY-NC-SA
 * */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMoleculeStore } from '@/stores/molecule.store';
import examples from '@/data/examples.json';

interface ExampleEntry {
    id: string;
    name: string;
    category: 'protein' | 'complex' | 'small';
    format: 'pdb' | 'sdf';
    source: string;
    description: string;
    tags: string[];
}

const props = defineProps<{open: boolean}>();
const emit = defineEmits<{'update:open': [value: boolean]}>();

const { t } = useI18n();
const store = useMoleculeStore();

const entries = examples as ExampleEntry[];
const query = ref('');
const activeCategory = ref<'all' | 'protein' | 'complex' | 'small'>('all');
const loadingId = ref<string | null>(null);
const error = ref<string | null>(null);

const categories = computed(() => {
    const count = (value: ExampleEntry['category']): number => entries.filter(e => e.category === value).length;

    return [
        {value: 'all' as const, label: t('library.all'), count: entries.length},
        {value: 'protein' as const, label: t('library.protein'), count: count('protein')},
        {value: 'complex' as const, label: t('library.complex'), count: count('complex')},
        {value: 'small' as const, label: t('library.small'), count: count('small')},
    ];
});

const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase();

    return entries.filter((entry) => {
        if (activeCategory.value !== 'all' && entry.category !== activeCategory.value) return false;
        if (!keyword) return true;

        return `${entry.name} ${entry.description} ${entry.tags.join(' ')} ${entry.id}`
            .toLowerCase()
            .includes(keyword);
    });
});

function close(): void {
    emit('update:open', false);
}

async function load(entry: ExampleEntry): Promise<void> {
    if (loadingId.value !== null) return;

    loadingId.value = entry.id;
    error.value = null;

    try {
        const url = `${import.meta.env.BASE_URL}examples/${entry.id}.${entry.format}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`无法加载示例：${entry.name}`);

        const text = await response.text();

        await store.loadFromText(text, `${entry.id}.${entry.format}`);
        close();
    } catch (e) {
        error.value = e instanceof Error ? e.message : String(e);
    } finally {
        loadingId.value = null;
    }
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && props.open) close();
}

watch(() => props.open, (open) => {
    if (open) {
        query.value = '';
        error.value = null;
    }
});

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mel
    position: fixed
    inset: 0
    display: grid
    place-items: center
    padding: 24px
    background: rgba(4, 6, 10, .62)
    backdrop-filter: blur(8px)
    z-index: 50

.mel-dialog
    display: flex
    flex-direction: column
    gap: 16px
    width: min(960px, 94vw)
    max-height: 84vh
    padding: 22px
    background: var(--bg-panel)
    border: 1px solid var(--line)
    border-radius: 16px
    box-shadow: 0 30px 80px rgba(0, 0, 0, .45)

.mel-head
    display: flex
    align-items: flex-start
    justify-content: space-between

.mel-kicker
    margin: 0 0 4px
    font-family: var(--font-mono)
    font-size: 10px
    letter-spacing: .14em
    text-transform: uppercase
    color: var(--accent)

.mel-title
    margin: 0
    font-size: 22px
    font-weight: 650

.mel-close
    width: 30px
    height: 30px
    font-size: 18px
    line-height: 1
    color: var(--fg-muted)
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 8px
    cursor: pointer

.mel-toolbar
    display: flex
    flex-direction: column
    gap: 10px

.mel-search
    width: 100%
    padding: 9px 12px
    font-size: 12px
    color: var(--fg)
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 8px
    outline: none

    &:focus
        border-color: var(--accent)

.mel-chips
    display: flex
    flex-wrap: wrap
    gap: 6px

.mel-chip
    display: inline-flex
    align-items: center
    gap: 6px
    padding: 5px 10px
    font-size: 11px
    color: var(--fg-muted)
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 999px
    cursor: pointer

    &.is-active
        color: var(--fg-on-accent)
        background: var(--accent)
        border-color: var(--accent)

.mel-chip-count
    font-family: var(--font-mono)
    font-size: 9.5px
    opacity: .7

.mel-grid
    display: grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 10px
    overflow: auto
    padding: 2px

    +below(940px)
        grid-template-columns: repeat(2, minmax(0, 1fr))

.mel-card
    display: flex
    flex-direction: column
    gap: 8px
    padding: 12px
    text-align: left
    color: var(--fg)
    background: var(--bg-sunken)
    border: 1px solid var(--line)
    border-radius: 10px
    cursor: pointer
    transition: border-color .15s, transform .15s

    &:hover
        border-color: var(--accent)
        transform: translateY(-1px)

    &:disabled
        opacity: .7
        cursor: progress

.mel-card-top
    display: flex
    align-items: center
    justify-content: space-between
    gap: 8px

.mel-card-name
    font-size: 12.5px
    font-weight: 600

.mel-badge
    padding: 2px 5px
    font-family: var(--font-mono)
    font-size: 9px
    color: var(--fg-faint)
    border: 1px solid var(--line)
    border-radius: 4px

.mel-card-desc
    font-size: 11px
    line-height: 1.5
    color: var(--fg-muted)

.mel-card-tags
    display: flex
    flex-wrap: wrap
    gap: 4px

.mel-tag
    padding: 1px 6px
    font-size: 9.5px
    color: var(--fg-faint)
    background: var(--bg-hover)
    border-radius: 999px

.mel-card-loading
    font-size: 10px
    color: var(--accent)

.mel-empty
    margin: 0
    padding: 28px 0
    text-align: center
    font-size: 12px
    color: var(--fg-faint)

.mel-error
    margin: 0
    font-size: 11px
    color: var(--danger, #e05b5b)
</style>
