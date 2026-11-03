<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>

    <div class="mv-main-view mmv" :class="{'is-embed': embedMode}">
        <div class="mmv-aurora" aria-hidden="true" />

        <mv-app-top-bar
            v-if="!embedMode"
            @import="onImport"
            @library="libraryOpen = true"
            @share="onShare"
            @screenshot="onScreenshot"
            @fit="onFit"
        />

        <div class="mmv-workspace">

            <mv-app-structure-panel
                v-if="!embedMode"
                ref="structurePanelRef"
                @import="onImport"
                @show-all="onShowAll"
                @toggle-chain="onToggleChain"
                @drop="onDrop"
            />

            <!-- 唯一视口宿主（ui.md §二/§五）：顶栏不再嵌套 molecule-viewer -->
            <mv-molecule-viewer ref="viewerRef"/>

            <mv-app-inspector v-if="!embedMode"/>

        </div>

        <mv-example-library v-if="!embedMode" v-model:open="libraryOpen"/>

        <div v-if="toast" class="mmv-toast">{{ toast }}</div>

    </div>

</template>

<script setup lang="ts">
/**
 * @file MV-MainView.vue
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 17:30
 * @desc 应用主视图。拼装四块编排（顶栏 / 左栏 / 视口 / 右栏 / 状态栏）。
 *       约定（ui.md §二）：整个应用只能有一个 <canvas> 视口，由 components/molecule/
 *       MV-MoleculeViewer 提供；顶栏与状态栏均不再嵌套 viewer（历史缺陷：两份 GPU 上下文）。
 *       当前为静态占位：编排块的命令（import/fit/showAll…）先空实现，Workbench 接入后
 *       转发到 useWorkbench 命令（ui.md §四：UI 只发命令）。
 * @copyright CC BY-NC-SA
 * */
import MvAppStructurePanel from '@/components/layout/MV-AppStructurePanel.vue';
import MvMoleculeViewer from '@/components/molecule/MV-MoleculeViewer.vue';
import MvAppInspector from '@/components/layout/MV-AppInspector.vue';
import MvAppTopBar from '@/components/layout/MV-AppTopBar.vue';
import MvExampleLibrary from '@/components/molecule/MV-ExampleLibrary.vue';
import examples from '@/data/examples.json';
import { useMoleculeStore } from '@/stores/molecule.store';
import type { ColorScheme, DisplayMode } from '@/stores/molecule.store';
import type { CameraPose } from '@/composables/useEngine';

import type {Optional} from '@/types';
import {computed, onBeforeUnmount, onMounted, ref} from 'vue';
import {useRoute} from 'vue-router';


const store = useMoleculeStore();
const route = useRoute();

const viewerRef = ref<Optional<InstanceType<typeof MvMoleculeViewer>>>();
const structurePanelRef = ref<Optional<InstanceType<typeof MvAppStructurePanel>>>();
const libraryOpen = ref(false);

/** 嵌入模式：只留视口（`?embed=1`） */
const embedMode = computed(() => route.query.embed === '1');

const toast = ref('');
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function showToast(message: string): void {
    toast.value = message;

    if (toastTimer) clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.value = '';
    }, 2600);
}

interface ShareEntry {
    id: string;
    format: string;
}

/** 当前名称是否对应示例库条目（上传文件不生成分享链接） */
function currentExample(): ShareEntry | undefined {
    const name = store.name.toLowerCase();

    return (examples as ShareEntry[]).find(entry => entry.id.toLowerCase() === name);
}

async function onShare(): Promise<void> {
    const entry = currentExample();

    if (!entry) {
        showToast('仅示例库结构支持分享链接；上传文件请先导出截图');
        return;
    }

    const params = new URLSearchParams();

    params.set('example', entry.id);
    params.set('mode', store.displayMode);
    params.set('scheme', store.colorScheme);

    const focus = store.focusResidues[0];

    if (focus !== undefined) params.set('focus', String(focus));

    const pose = viewerRef.value?.cameraPose();

    if (pose) params.set('camera', [...pose.position, ...pose.target].map(v => v.toFixed(2)).join(','));

    const url = `${location.origin}${location.pathname}?${params.toString()}`;

    try {
        await navigator.clipboard.writeText(url);
        showToast('分享链接已复制');
    } catch {
        window.prompt('复制分享链接：', url);
    }
}

function onScreenshot(): void {
    const canvas = document.querySelector<HTMLCanvasElement>('.mmv-stage canvas');
    const url = canvas?.toDataURL('image/png');

    if (!canvas || !url) {
        showToast('当前浏览器不支持画布导出');
        return;
    }

    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = `${store.name || 'molvista'}.png`;
    anchor.click();

    showToast('PNG 截图已保存');
}

const CAMERA_QUERY_KEYS = 'camera';

function parseCamera(value: unknown): CameraPose | null {
    if (typeof value !== 'string') return null;

    const parts = value.split(',').map(Number);

    if (parts.length !== 6 || parts.some(n => !Number.isFinite(n))) return null;

    return {
        position: [parts[0]!, parts[1]!, parts[2]!],
        target: [parts[3]!, parts[4]!, parts[5]!],
    };
}

/** 打开带参数的链接：示例 + 表示 + 焦点 + 相机 */
async function applyShareQuery(): Promise<void> {
    const exampleId = route.query.example;

    if (typeof exampleId !== 'string') return;

    const entry = (examples as Array<ShareEntry & {format: string}>)
        .find(e => e.id === exampleId);

    if (!entry) return;

    const response = await fetch(`${import.meta.env.BASE_URL}examples/${entry.id}.${entry.format}`);

    if (!response.ok) return;

    await store.loadFromText(await response.text(), `${entry.id}.${entry.format}`);

    const mode = route.query.mode;

    if (typeof mode === 'string' && ['ballStick', 'spaceFill', 'wireframe', 'cartoon'].includes(mode))
        store.setDisplayMode(mode as DisplayMode);

    const scheme = route.query.scheme;

    if (typeof scheme === 'string' && ['element', 'chain', 'charge', 'secondary'].includes(scheme))
        store.setColorScheme(scheme as ColorScheme);

    const focus = Number(route.query.focus);

    if (Number.isInteger(focus) && focus >= 0)
        store.setFocus({residueIndexes: [focus], radius: 6});

    // 等引擎完成重建并 fit，再套用分享时的相机
    await new Promise(resolve => setTimeout(resolve, 700));

    const pose = parseCamera(route.query[CAMERA_QUERY_KEYS]);

    if (pose) viewerRef.value?.setCameraPose(pose);
}

// ---------------------------------------------------------------------------
// iframe 嵌入协议（postMessage）
// 父页面 → 子页面：molvista:load / mode / camera / fit
// 子页面 → 父页面：molvista:ready / loaded / error
// ---------------------------------------------------------------------------

interface EmbedMessage {
    type: string;
    example?: string;
    mode?: string;
    scheme?: string;
    focus?: number;
    position?: number[];
    target?: number[];
}

const DISPLAY_MODES = ['ballStick', 'spaceFill', 'wireframe', 'cartoon'];
const COLOR_SCHEMES = ['element', 'chain', 'charge', 'secondary'];

function postToParent(message: Record<string, unknown>): void {
    if (window.parent !== window) window.parent.postMessage(message, '*');
}

function applyEmbedOptions(data: EmbedMessage): void {
    if (typeof data.mode === 'string' && DISPLAY_MODES.includes(data.mode))
        store.setDisplayMode(data.mode as DisplayMode);

    if (typeof data.scheme === 'string' && COLOR_SCHEMES.includes(data.scheme))
        store.setColorScheme(data.scheme as ColorScheme);

    if (typeof data.focus === 'number' && Number.isInteger(data.focus) && data.focus >= 0)
        store.setFocus({residueIndexes: [data.focus], radius: 6});
}

async function handleEmbedCommand(data: EmbedMessage): Promise<void> {
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'molvista:load') {
        const entry = (examples as Array<ShareEntry & {format: string}>)
            .find(e => e.id === data.example);

        if (!entry) {
            postToParent({type: 'molvista:error', message: `unknown example: ${data.example}`});
            return;
        }

        try {
            const response = await fetch(`${import.meta.env.BASE_URL}examples/${entry.id}.${entry.format}`);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            await store.loadFromText(await response.text(), `${entry.id}.${entry.format}`);
            applyEmbedOptions(data);

            await new Promise(resolve => setTimeout(resolve, 500));

            const pose = Array.isArray(data.position) && Array.isArray(data.target)
                && data.position.length === 3 && data.target.length === 3
                ? {position: data.position as [number, number, number], target: data.target as [number, number, number]}
                : null;

            if (pose) viewerRef.value?.setCameraPose(pose);
            else viewerRef.value?.fit();

            postToParent({type: 'molvista:loaded', example: entry.id, atoms: store.atomCount});
        } catch (error) {
            postToParent({type: 'molvista:error', message: String(error)});
        }

        return;
    }

    if (data.type === 'molvista:mode') {
        applyEmbedOptions(data);
        return;
    }

    if (data.type === 'molvista:fit') {
        viewerRef.value?.fit();
        return;
    }

    if (data.type === 'molvista:camera') {
        const pose = Array.isArray(data.position) && Array.isArray(data.target)
            && data.position.length === 3 && data.target.length === 3
            ? {position: data.position as [number, number, number], target: data.target as [number, number, number]}
            : null;

        if (pose) viewerRef.value?.setCameraPose(pose);
    }
}

function onEmbedMessage(event: MessageEvent): void {
    if (!embedMode.value || event.source !== window.parent) return;

    void handleEmbedCommand(event.data as EmbedMessage);
}

onMounted(() => {
    void applyShareQuery();
    window.addEventListener('message', onEmbedMessage);

    if (embedMode.value) setTimeout(() => postToParent({type: 'molvista:ready', version: 1}), 400);
});

onBeforeUnmount(() => {
    window.removeEventListener('message', onEmbedMessage);
});

function onImport(): void {
    // 顶栏 import 按钮：委托给结构面板打开文件选择器
    structurePanelRef.value?.triggerFileSelect();
}

function onFit(): void {
    viewerRef.value?.fit();
}

function onShowAll(): void {
    // TODO: 由 store 统一管理链可见性后，重置所有链为可见
}

function onToggleChain(_id: string): void {
    // TODO: 由 store 统一管理链可见性
}

function onDrop(_files: File[]): void {
    // 结构面板内部已处理文件解析，此处仅作事件占位
}
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

.mmv
    --accent: #c8ff5a
    --accent-soft: rgba(200, 255, 90, .12)
    --accent-fg: #0a1000
    position: relative
    display: grid
    grid-template-rows: 54px minmax(0, 1fr)
    gap: 10px
    height: 100%
    padding: 10px 14px
    overflow: hidden
    background: #04060a

    &.is-embed
        grid-template-rows: minmax(0, 1fr)
        padding: 0
        gap: 0

        .mmv-workspace
            grid-template-columns: minmax(0, 1fr)

        :deep(.mvoc-overlay)
            display: none

        :deep(.mv-molecule-viewer)
            border: 0
            border-radius: 0

    &-aurora
        position: absolute
        inset: 0
        pointer-events: none
        background: radial-gradient(900px 520px at 72% 18%, rgba(110, 231, 249, .07), transparent 62%), radial-gradient(700px 480px at 12% 88%, rgba(200, 255, 90, .05), transparent 66%)

    &-workspace
        position: relative
        z-index: 1
        display: grid
        grid-template-columns: 288px minmax(0, 1fr) 344px
        gap: 10px
        min-height: 0
        flex: 1

        +below(1180px)
            grid-template-columns: 248px minmax(0, 1fr) 312px

        +below(1080px)
            grid-template-columns: 248px minmax(0, 1fr) 312px

        +below(940px)
            grid-template-columns: minmax(0, 1fr)

            :deep(.masp), :deep(.mai-panel)
                display: none

    :deep(.masp),
    :deep(.mai-panel),
    :deep(.mv-molecule-viewer)
        min-height: 0
        border: 1px solid rgba(255, 255, 255, .085)
        border-radius: 16px
        overflow: hidden
        background: rgba(8, 12, 17, .74)
        box-shadow: 0 24px 60px rgba(0, 0, 0, .28)
        backdrop-filter: blur(18px)

    :deep(.masp)
        border-right: 1px solid rgba(255, 255, 255, .085)

    :deep(.mai-panel)
        border-left: 1px solid rgba(255, 255, 255, .085)

    :deep(.mv-molecule-viewer)
        position: relative
        background: radial-gradient(ellipse at 50% 40%, rgba(16, 24, 34, .9), #04060a 72%)

        .mev-scene
            border-radius: 16px

        canvas
            border-radius: 16px

    :deep(.mv-app-status-bar)
        position: relative
        z-index: 1
        height: 26px
        padding: 0 8px 2px
        font-size: 9.5px
        background: transparent
        border: 0
        color: rgba(244, 247, 249, .32)

    :deep(.masp-head)
        height: 52px
        padding: 0 14px
        border-bottom: 1px solid rgba(255, 255, 255, .06)

    :deep(.masp-title)
        display: flex
        flex-direction: column
        gap: 2px
        font-size: 14px
        font-weight: 600
        letter-spacing: -.02em
        color: var(--fg)

        &::before
            content: "STRUCTURE"
            font-family: var(--font-mono)
            font-size: 7.5px
            font-weight: 400
            letter-spacing: .16em
            color: rgba(200, 255, 90, .55)

    :deep(.masp-body)
        padding: 12px

    :deep(.masp-chain-list)
        gap: 2px

    :deep(.masp-chain-row)
        border-radius: 8px

    &-toast
        position: fixed
        left: 50%
        bottom: 34px
        transform: translateX(-50%)
        padding: 8px 14px
        font-size: 11.5px
        color: var(--fg)
        background: rgba(12, 17, 24, .9)
        border: 1px solid rgba(255, 255, 255, .12)
        border-radius: 999px
        box-shadow: 0 12px 32px rgba(0, 0, 0, .35)
        backdrop-filter: blur(12px)
        z-index: 60
</style>








