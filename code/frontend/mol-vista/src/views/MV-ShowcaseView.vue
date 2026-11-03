<!--
  - Copyright (c) 2026. All rights reserved.
  - This source code is licensed under the CC BY-NC-SA
  - (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
  - This software is protected by copyright law. Reproduction, distribution, or use for commercial
  - purposes is prohibited without the author's permission. If you have any questions or require
  - permission, please contact the author: edocsitahw@qq.com
  -->

<template>
    <div class="site">
        <!-- 固定 3D 舞台 -->
        <div class="stage" aria-hidden="true">
            <mv-engine-viewport ref="viewportRef" class="stage-view" />
            <div class="stage-veil" />
            <div class="stage-grain" />
        </div>

        <!-- 导航 -->
        <header class="nav" :class="{'is-solid': scrolled > 24}">
            <a class="brand" href="#top" @click.prevent="scrollTo('top')">
                <span class="brand-mark">
                    <span class="brand-orbit" />
                    <span class="brand-core" />
                </span>
                <span class="brand-name">MolVista</span>
                <span class="brand-tag">BIO VISUAL STUDIO</span>
            </a>

            <nav class="nav-links" aria-label="页面导航">
                <a href="#pocket" @click.prevent="scrollTo('pocket')">结合口袋</a>
                <a href="#workflow" @click.prevent="scrollTo('workflow')">教学叙事</a>
                <a href="#performance" @click.prevent="scrollTo('performance')">性能</a>
            </nav>

            <div class="nav-actions">
                <span class="live"><span class="live-dot" />{{ store.engineBackend === 'webgl2' ? 'WEBGL2 COMPAT' : store.engineBackend === 'none' ? 'NO GPU' : 'WEBGPU LIVE' }}</span>
                <button class="btn btn-ghost" @click="enterWorkbench">打开工作台 <span>↗</span></button>
            </div>
        </header>

        <main id="top">
            <!-- Hero -->
            <section class="hero" data-section="0">
                <div class="hero-inner">
                    <p class="eyebrow reveal">MOLECULAR STORYTELLING · IN THE BROWSER</p>

                    <h1 class="display reveal">
                        把分子结构<br>
                        <span class="display-accent">变成视觉叙事</span>
                    </h1>

                    <p class="lede reveal">
                        从 15 万原子的结构，到一次可以被理解的口袋结合。
                        MolVista 用 WebGPU 把科研级结构变成课堂、答辩与网站里
                        <em>可讲述</em>的实时画面。
                    </p>

                    <div class="hero-actions reveal">
                        <button class="btn btn-primary" @click="enterWorkbench">
                            进入工作台 <span class="btn-arrow">→</span>
                        </button>
                        <button class="btn btn-ghost" @click="scrollTo('pocket')">
                            看一个例子
                        </button>
                    </div>

                    <div class="hero-stats reveal">
                        <div class="stat">
                            <span class="stat-num">150k</span>
                            <span class="stat-label">原子实时渲染</span>
                        </div>
                        <div class="stat">
                            <span class="stat-num">60<small>fps</small></span>
                            <span class="stat-label">RTX 3060 · 1440p</span>
                        </div>
                        <div class="stat">
                            <span class="stat-num">634<small>ms</small></span>
                            <span class="stat-label">解析到首帧</span>
                        </div>
                    </div>
                </div>

                <div class="scroll-cue">
                    <span class="scroll-line" />
                    <span>SCROLL TO EXPLORE</span>
                </div>

                <span class="hero-watermark">6LU7 / MAIN PROTEASE</span>
            </section>

            <!-- Pocket -->
            <section id="pocket" class="section split" data-section="1">
                <div class="section-copy reveal">
                    <p class="index">01 — SEE THE POCKET</p>
                    <h2>不是一团球，<br>是一个<em>结合口袋</em>。</h2>
                    <p>
                        卡通骨架与配体球棍叠在同一画面里，镜头推进到真正决定活性的那一小块；
                        接触残基编号直接列在右侧卡片。
                    </p>

                    <ul class="check-list">
                        <li><span>01</span>单口袋焦点，避免同名配体混在一起</li>
                        <li><span>02</span>接触残基自动标注，可一键关闭</li>
                        <li><span>03</span>距离 / 角度 / 二面角，课堂即时测量</li>
                    </ul>

                    <button class="text-link" @click="enterWorkbench">
                        在真实结构里试试 <span>↗</span>
                    </button>
                </div>

                <div class="section-aside reveal">
                    <div class="glass-card pocket-card">
                        <div class="card-head">
                            <span class="card-dot" />
                            <span>SARS-CoV-2 · 6LU7</span>
                            <span class="card-chip">LIVE</span>
                        </div>
                        <div class="pocket-metric">
                            <span class="metric-big">02J</span>
                            <span class="metric-sub">抑制剂 · 催化位点</span>
                        </div>
                        <div class="pocket-meta">
                            <div><span>接触残基</span><strong>LEU83 · HIS58 · HIS87</strong></div>
                            <div><span>口袋范围</span><strong>5 Å</strong></div>
                        </div>
                    </div>

                    <div class="float-note note-a">FOCUS / 焦点降噪</div>
                    <div class="float-note note-b">RIBBON / 二级结构</div>
                </div>
            </section>

            <!-- Workflow -->
            <section id="workflow" class="section workflow" data-section="2">
                <div class="section-head reveal">
                    <p class="index">02 — FROM STRUCTURE TO STORY</p>
                    <h2>一条从文件到<em>叙事</em>的路径。</h2>
                    <p class="section-sub">
                        不需要插件，不需要安装。拖入结构，选择表达，把镜头交给课堂。
                    </p>
                </div>

                <div class="steps">
                    <article class="step reveal">
                        <span class="step-no">01</span>
                        <div class="step-icon">PDB</div>
                        <h3>读入结构</h3>
                        <p>PDB / CIF / SDF 原生解析，SoA 数据直达 GPU，15 万原子也保持流畅。</p>
                        <div class="step-foot"><span>PDB</span><span>CIF</span><span>SDF</span></div>
                    </article>

                    <article class="step reveal">
                        <span class="step-no">02</span>
                        <div class="step-icon">SS</div>
                        <h3>选择表达</h3>
                        <p>卡通、ribbon、球棍、空间填充；口袋焦点与链/残基/配体选择一键切换。</p>
                        <div class="step-foot"><span>CARTOON</span><span>RIBBON</span><span>BALL</span></div>
                    </article>

                    <article class="step reveal">
                        <span class="step-no">03</span>
                        <div class="step-icon">MD</div>
                        <h3>演示与分享</h3>
                        <p>GPU 分子动力学时间线、测量与注释；链接、截图、iframe 直接带走。</p>
                        <div class="step-foot"><span>TIMELINE</span><span>SHARE</span><span>EMBED</span></div>
                    </article>
                </div>

                <div class="marquee" aria-hidden="true">
                    <span>PDB / CIF / SDF</span><i>·</i><span>WEBGPU</span><i>·</i><span>ZERO PLUGIN</span><i>·</i>
                    <span>TEACHING READY</span><i>·</i><span>150K ATOMS</span><i>·</i><span>PDB / CIF / SDF</span>
                </div>
            </section>

            <!-- Performance -->
            <section id="performance" class="section performance" data-section="3">
                <div class="section-head reveal">
                    <p class="index">03 — WHY IT FEELS LIVE</p>
                    <h2>把 GPU 留给<em>画面</em>，<br>把 CPU 留给叙事。</h2>
                </div>

                <div class="perf-grid">
                    <div class="perf-card reveal">
                        <span class="perf-num">150,547</span>
                        <span class="perf-unit">ATOMS</span>
                        <p>5A9Z 核糖体结构，单一 WebGPU 上下文实时交互。</p>
                    </div>
                    <div class="perf-card reveal">
                        <span class="perf-num">634<small>ms</small></span>
                        <span class="perf-unit">PARSE → FIRST FRAME</span>
                        <p>SoA 解析 + 实例化批次，不再为 15 万个原子对象付出代价。</p>
                    </div>
                    <div class="perf-card reveal">
                        <span class="perf-num">0<small>plugin</small></span>
                        <span class="perf-unit">BROWSER NATIVE</span>
                        <p>Chrome / Edge 直接打开；一份链接，教室与网页都是同一个场景。</p>
                    </div>
                </div>

                <div class="perf-line reveal">
                    <span>INSTANCED BATCHES</span><b>→</b>
                    <span>GPU CULLING</span><b>→</b>
                    <span>IMPOSTORS</span><b>→</b>
                    <span>GPU MD</span>
                </div>
            </section>

            <!-- CTA -->
            <section id="cta" class="cta" data-section="4">
                <div class="cta-panel reveal">
                    <p class="index">04 — START</p>
                    <h2>下一屏，<br>从你的结构开始。</h2>
                    <p>打开工作台，拖入一个 PDB；或者从示例库挑一个口袋。</p>
                    <div class="cta-actions">
                        <button class="btn btn-primary" @click="enterWorkbench">
                            打开工作台 <span class="btn-arrow">→</span>
                        </button>
                        <button class="btn btn-ghost" @click="scrollTo('pocket')">回到示例</button>
                    </div>
                </div>

                <footer class="foot">
                    <span>MolVista · WebGPU Molecular Studio</span>
                    <span class="foot-meta">Built with WebGPU / Vue / TypeScript</span>
                    <span class="foot-meta">© 2026</span>
                </footer>
            </section>
        </main>

        <div v-if="store.engineBackend === 'none'" class="webgpu-fallback">
            <strong>当前浏览器未启用 WebGPU / WebGL2</strong>
            <span>请使用 Chrome / Edge 最新版，或开启硬件加速。</span>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * @file MV-ShowcaseView.vue
 * @author edocsitahw
 * @version 2.0
 * @date 2026/11/02
 * @desc 官网式展示页：固定 3D 舞台 + 滚动叙事 + 相机分镜。
 *
 *       与工作台共用 MV-EngineViewport；单一 4HHB 场景。
 *       滚动到不同 section 时切换聚焦与相机，形成"商业官网 + 实时分子"的体验。
 * @copyright CC BY-NC-SA
 * */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MvEngineViewport from '@/components/engine/MV-EngineViewport.vue';
import { useMoleculeStore } from '@/stores/molecule.store';
import type { CameraPose } from '@/composables/useEngine';

const router = useRouter();
const store = useMoleculeStore();

const viewportRef = ref<InstanceType<typeof MvEngineViewport> | null>(null);
const scrolled = ref(0);

let scrollRaf = 0;
let revealObserver: IntersectionObserver | null = null;
let activeSection = -1;

const scenePoses = ref<Record<number, CameraPose>>({});
const SECTION_MODES = ['spaceFill', 'cartoon', 'ballStick', 'ballStick', 'spaceFill'] as const;
let focusResidue = -1;

function scrollTo(id: string): void {
    document.getElementById(id)?.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function enterWorkbench(): void {
    void router.push('/');
}

/** 载入单场景：4HHB 卡通 */
async function loadScene(): Promise<void> {
    try {
        const response = await fetch(`${import.meta.env.BASE_URL}examples/6lu7.pdb`);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        await store.loadFromText(await response.text(), '6lu7.pdb');
        store.setDisplayMode('cartoon');
        store.setColorScheme('secondary');

        const autoFocus = store.focusResidues[0] ?? -1;

        store.showLabels = false;
        store.setFocus(null);
        focusResidue = autoFocus;

        await nextTick();
        await new Promise(resolve => setTimeout(resolve, 900));

        viewportRef.value?.fit();
        await new Promise(resolve => setTimeout(resolve, 250));

        buildPoses();
    } catch {
        // 加载失败时由 store.engineBackend 与页面空态兜底
    }
}

/** 由整体取景推导镜头：全景 / 口袋 / 性能 */
function buildPoses(): void {
    const hero = viewportRef.value?.cameraPose();

    if (!hero) return;

    const [hx, hy, hz] = hero.position;
    const [tx, ty, tz] = hero.target;
    const dx = hx - tx;
    const dy = hy - ty;
    const dz = hz - tz;

    const poses: Record<number, CameraPose> = {
        0: hero,
        2: {
            position: [tx + dx * 1.18, ty + dy * 1.18 + 6, tz + dz * 1.18],
            target: [tx, ty, tz],
        },
        3: {
            position: [tx + dx * 0.92, ty + dy * 0.92 + 4, tz + dz * 0.92],
            target: [tx, ty, tz],
        },
        4: {
            position: [tx + dx * 1.05, ty + dy * 1.05, tz + dz * 1.05],
            target: [tx, ty, tz],
        },
    };

    // 口袋镜头：围绕配体残基中心拉近
    if (focusResidue >= 0) {
        const center = residueCenter(focusResidue);

        if (center) {
            const [cx, cy, cz] = center;
            const base = Math.hypot(hx - cx, hy - cy, hz - cz) || 80;
            const k = Math.max(12, base * 0.36) / base;

            poses[1] = {
                position: [cx + (hx - cx) * k, cy + (hy - cy) * k, cz + (hz - cz) * k],
                target: [cx, cy, cz],
            };
        }
    }

    scenePoses.value = poses;
    applySection(0);
}

function residueCenter(residue: number): [number, number, number] | null {
    const data = store.structure;
    const residueIndex = data?.atoms.residueIndex;

    if (!data || !residueIndex) return null;

    let x = 0, y = 0, z = 0, n = 0;

    for (let i = 0; i < data.meta.atomCount; i++) {
        if (residueIndex[i] !== residue) continue;

        x += data.atoms.positions[i * 3]!;
        y += data.atoms.positions[i * 3 + 1]!;
        z += data.atoms.positions[i * 3 + 2]!;
        n++;
    }

    return n > 0 ? [x / n, y / n, z / n] : null;
}

/** 滚动位置 → 当前 section */
function applySection(index: number): void {
    if (activeSection === index) return;

    const pose = scenePoses.value[index];

    activeSection = index;
    store.setDisplayMode(SECTION_MODES[index] ?? 'cartoon');
    store.setColorScheme(index === 1 ? 'chain' : 'element');
    store.setFocus(null);
    store.showLabels = false;

    if (pose) viewportRef.value?.animateCameraPose(pose, 1100);
}

function onScroll(): void {
    if (scrollRaf) return;

    scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        scrolled.value = window.scrollY;

        const mid = window.scrollY + window.innerHeight * 0.45;
        let index = 0;

        for (const element of document.querySelectorAll<HTMLElement>("[data-section]")) {
            const top = element.getBoundingClientRect().top + window.scrollY;

            if (top <= mid) index = Number(element.dataset.section ?? 0);
        }

        applySection(index);
    });
}

function setupReveal(): void {
    revealObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) entry.target.classList.add('is-in');
        }
    }, {rootMargin: '0px 0px -10% 0px', threshold: 0.12});

    for (const element of document.querySelectorAll('.reveal')) revealObserver.observe(element);
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;

    void router.push('/');
}

onMounted(async () => {
    window.addEventListener('scroll', onScroll, {passive: true});
    window.addEventListener('keydown', onKeydown);
    document.documentElement.classList.add('is-landing');

    await loadScene();
    setupReveal();
    onScroll();
});

onBeforeUnmount(() => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKeydown);
    document.documentElement.classList.remove('is-landing');
    revealObserver?.disconnect();

    if (scrollRaf) cancelAnimationFrame(scrollRaf);
});
</script>

<style lang="sass" scoped>
@use '@/assets/styles/mixins' as *

$ink: #f4f7f9
$mut: #96a1af
$lime: #c8ff5a
$cyan: #6ee7f9
$line: rgba(255, 255, 255, .11)

.site
    --site-bg: #04060a
    --site-fg: #f4f7f9
    --site-mut: #96a1af
    --site-lime: #c8ff5a
    --site-cyan: #6ee7f9
    position: relative
    min-height: 100vh
    color: $ink
    background: #04060a
    font-family: "Inter", "SF Pro Display", "Segoe UI Variable", "PingFang SC", "Microsoft YaHei", sans-serif
    letter-spacing: -.01em
    overflow-x: clip

.stage
    position: fixed
    inset: 0
    z-index: 0
    pointer-events: none

.stage-view
    width: 100%
    height: 100%

    :deep(.mev-molecule)
        opacity: .22
        filter: blur(1px)

.stage-veil
    position: absolute
    inset: 0
    pointer-events: none
    background: radial-gradient(900px 620px at 62% 42%, rgba(110, 231, 249, .10), transparent 62%), radial-gradient(760px 520px at 18% 82%, rgba(200, 255, 90, .055), transparent 66%), linear-gradient(180deg, rgba(4, 6, 10, .06) 0%, rgba(4, 6, 10, .18) 46%, rgba(4, 6, 10, .82) 100%)

.stage-grain
    position: absolute
    inset: 0
    pointer-events: none
    opacity: .18
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E")
    mix-blend-mode: soft-light

.nav
    position: fixed
    top: 0
    left: 0
    right: 0
    z-index: 20
    display: flex
    align-items: center
    justify-content: space-between
    gap: 28px
    padding: 18px 34px
    transition: background .3s, border-color .3s, padding .3s

    &.is-solid
        padding: 12px 34px
        background: rgba(4, 6, 10, .72)
        border-bottom: 1px solid $line
        backdrop-filter: blur(18px)

.brand
    display: flex
    align-items: center
    gap: 10px

.brand-mark
    position: relative
    width: 26px
    height: 26px
    display: grid
    place-items: center

.brand-orbit
    position: absolute
    inset: 1px
    border: 1px solid rgba(200, 255, 90, .7)
    border-radius: 50%
    transform: rotate(-24deg) scaleY(.52)

.brand-core
    width: 7px
    height: 7px
    border-radius: 50%
    background: $lime
    box-shadow: 0 0 14px rgba(200, 255, 90, .75)

.brand-name
    font-size: 16px
    font-weight: 700
    letter-spacing: -.03em

.brand-tag
    margin-left: 4px
    padding-left: 10px
    border-left: 1px solid $line
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .16em
    color: rgba(244, 247, 249, .42)

.nav-links
    display: flex
    align-items: center
    gap: 30px

    a
        font-size: 11.5px
        color: rgba(244, 247, 249, .62)
        transition: color .2s

        &:hover
            color: $ink

.nav-actions
    display: flex
    align-items: center
    gap: 14px

.live
    display: inline-flex
    align-items: center
    gap: 6px
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .12em
    color: rgba(244, 247, 249, .5)

.live-dot
    width: 5px
    height: 5px
    border-radius: 50%
    background: $lime
    box-shadow: 0 0 10px rgba(200, 255, 90, .9)
    animation: pulse 2.2s ease-in-out infinite

.btn
    display: inline-flex
    align-items: center
    justify-content: center
    gap: 9px
    min-height: 40px
    padding: 0 17px
    font-size: 12px
    font-weight: 600
    border-radius: 999px
    border: 1px solid transparent
    cursor: pointer
    transition: transform .2s, background .2s, border-color .2s, color .2s

    &:hover
        transform: translateY(-1px)

.btn-primary
    color: #0a1000
    background: $lime
    box-shadow: 0 10px 30px rgba(200, 255, 90, .16)

    &:hover
        background: #d6ff85

.btn-ghost
    color: rgba(244, 247, 249, .82)
    background: rgba(255, 255, 255, .035)
    border-color: $line
    backdrop-filter: blur(12px)

    &:hover
        color: $ink
        border-color: rgba(255, 255, 255, .24)

.btn-arrow
    font-size: 15px
    line-height: 1

.hero
    position: relative
    z-index: 2
    min-height: 100vh
    display: flex
    align-items: center
    padding: 120px 8vw 90px

.hero-inner
    max-width: 780px

.eyebrow, .index
    font-family: var(--font-mono)
    font-size: 9px
    letter-spacing: .18em
    color: rgba(200, 255, 90, .78)
    text-transform: uppercase

.display
    margin: 20px 0 0
    font-size: clamp(54px, 7.4vw, 108px)
    line-height: .94
    font-weight: 600
    letter-spacing: -.055em

.display-accent
    color: transparent
    -webkit-text-stroke: 1px rgba(244, 247, 249, .52)
    background: linear-gradient(100deg, rgba(200, 255, 90, .95), rgba(110, 231, 249, .9) 62%, rgba(244, 247, 249, .35))
    -webkit-background-clip: text
    background-clip: text

.lede
    max-width: 520px
    margin: 26px 0 0
    font-size: 14px
    line-height: 1.9
    color: rgba(244, 247, 249, .66)

    em
        font-style: normal
        color: $ink

.hero-actions
    display: flex
    gap: 10px
    margin-top: 32px

.hero-stats
    display: flex
    gap: 44px
    margin-top: 62px
    padding-top: 20px
    border-top: 1px solid $line

.stat
    display: flex
    flex-direction: column
    gap: 4px

.stat-num
    font-family: var(--font-mono)
    font-size: 24px
    letter-spacing: -.04em

    small
        margin-left: 3px
        font-size: 10px
        color: rgba(244, 247, 249, .42)

.stat-label
    font-size: 10px
    letter-spacing: .06em
    color: rgba(244, 247, 249, .42)

.scroll-cue
    position: absolute
    left: 8vw
    bottom: 34px
    display: flex
    align-items: center
    gap: 12px
    font-family: var(--font-mono)
    font-size: 8px
    letter-spacing: .16em
    color: rgba(244, 247, 249, .36)

.scroll-line
    width: 70px
    height: 1px
    background: linear-gradient(90deg, rgba(200, 255, 90, .8), transparent)

.hero-watermark
    position: absolute
    right: 8vw
    bottom: 34px
    font-family: var(--font-mono)
    font-size: 8px
    letter-spacing: .16em
    color: rgba(244, 247, 249, .28)

.section
    position: relative
    z-index: 2
    min-height: 100vh
    display: flex
    flex-direction: column
    justify-content: center
    padding: 120px 8vw

.split
    display: grid
    grid-template-columns: minmax(0, .9fr) minmax(0, .72fr)
    gap: 7vw
    align-items: center

.section-copy
    h2, .section-head h2
        margin: 18px 0 0
        font-size: clamp(36px, 4vw, 60px)
        line-height: 1.02
        font-weight: 600
        letter-spacing: -.045em

    em
        font-style: normal
        color: $lime

    > p
        max-width: 520px
        margin: 22px 0 0
        font-size: 13px
        line-height: 1.95
        color: rgba(244, 247, 249, .6)

.check-list
    display: grid
    gap: 11px
    margin: 30px 0 0
    padding: 0
    list-style: none

    li
        display: flex
        gap: 12px
        font-size: 12px
        color: rgba(244, 247, 249, .66)

        span
            font-family: var(--font-mono)
            font-size: 9px
            color: rgba(200, 255, 90, .7)
            padding-top: 2px

.text-link
    margin-top: 30px
    padding: 0
    font-size: 12px
    color: $ink
    background: none
    border: 0
    border-bottom: 1px solid rgba(200, 255, 90, .5)
    padding-bottom: 4px
    cursor: pointer

    span
        margin-left: 6px
        color: $lime

.section-aside
    position: relative
    display: flex
    justify-content: flex-end

.glass-card
    width: min(390px, 100%)
    padding: 18px
    background: rgba(8, 12, 17, .62)
    border: 1px solid $line
    border-radius: 16px
    backdrop-filter: blur(22px)
    box-shadow: 0 30px 80px rgba(0, 0, 0, .38)

.card-head
    display: flex
    align-items: center
    gap: 8px
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .08em
    color: rgba(244, 247, 249, .5)

.card-dot
    width: 5px
    height: 5px
    border-radius: 50%
    background: $lime

.card-chip
    margin-left: auto
    padding: 2px 6px
    color: $lime
    border: 1px solid rgba(200, 255, 90, .3)
    border-radius: 999px

.pocket-metric
    display: flex
    align-items: baseline
    gap: 12px
    margin: 28px 0 22px

.metric-big
    font-family: var(--font-mono)
    font-size: 44px
    letter-spacing: -.06em
    color: $lime

.metric-sub
    font-size: 10px
    color: rgba(244, 247, 249, .5)

.pocket-meta
    display: grid
    gap: 9px
    padding-top: 14px
    border-top: 1px solid $line

    div
        display: flex
        justify-content: space-between
        gap: 12px
        font-size: 10px

        span
            color: rgba(244, 247, 249, .4)

        strong
            font-weight: 500
            font-family: var(--font-mono)
            color: rgba(244, 247, 249, .8)

.float-note
    position: absolute
    padding: 5px 9px
    font-family: var(--font-mono)
    font-size: 8px
    letter-spacing: .1em
    color: rgba(244, 247, 249, .55)
    background: rgba(8, 12, 17, .7)
    border: 1px solid $line
    border-radius: 6px
    backdrop-filter: blur(12px)

.note-a
    left: -18px
    bottom: 54px
    transform: rotate(-3deg)

.note-b
    right: -12px
    top: -18px
    transform: rotate(3deg)

.workflow
    align-items: stretch

.section-head
    max-width: 760px

.section-sub
    margin: 18px 0 0
    max-width: 520px
    font-size: 12.5px
    line-height: 1.8
    color: rgba(244, 247, 249, .5)

.steps
    display: grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 14px
    margin-top: 54px

.step
    position: relative
    display: flex
    flex-direction: column
    min-height: 230px
    padding: 22px
    background: rgba(8, 12, 17, .52)
    border: 1px solid $line
    border-radius: 14px
    backdrop-filter: blur(16px)
    transition: border-color .3s, transform .3s

    &:hover
        border-color: rgba(200, 255, 90, .32)
        transform: translateY(-3px)

    h3
        margin: 24px 0 8px
        font-size: 17px
        font-weight: 600
        letter-spacing: -.02em

    p
        margin: 0
        font-size: 11.5px
        line-height: 1.8
        color: rgba(244, 247, 249, .5)

.step-no
    position: absolute
    right: 18px
    top: 16px
    font-family: var(--font-mono)
    font-size: 9px
    color: rgba(244, 247, 249, .28)

.step-foot
    display: flex
    gap: 6px
    margin-top: auto
    padding-top: 18px
    border-top: 1px solid rgba(255, 255, 255, .08)

    span
        padding: 2px 7px
        font-family: var(--font-mono)
        font-size: 8px
        letter-spacing: .08em
        color: rgba(244, 247, 249, .42)
        border: 1px solid rgba(255, 255, 255, .1)
        border-radius: 4px

.step-icon
    width: 40px
    height: 40px
    display: grid
    place-items: center
    font-family: var(--font-mono)
    font-size: 9px
    letter-spacing: .06em
    color: $lime
    background: rgba(200, 255, 90, .06)
    border: 1px solid rgba(200, 255, 90, .2)
    border-radius: 10px

.marquee
    display: flex
    gap: 18px
    margin-top: 64px
    padding: 16px 0
    border-top: 1px solid $line
    border-bottom: 1px solid $line
    overflow: hidden
    white-space: nowrap
    font-family: var(--font-mono)
    font-size: 9px
    letter-spacing: .14em
    color: rgba(244, 247, 249, .3)

    i
        font-style: normal
        color: rgba(200, 255, 90, .4)

.performance
    align-items: stretch

.perf-grid
    display: grid
    grid-template-columns: repeat(3, minmax(0, 1fr))
    gap: 14px
    margin-top: 54px

.perf-card
    padding: 24px
    border: 1px solid $line
    border-radius: 14px
    background: linear-gradient(160deg, rgba(255, 255, 255, .035), rgba(255, 255, 255, .008))
    backdrop-filter: blur(14px)

    p
        margin: 26px 0 0
        font-size: 11px
        line-height: 1.8
        color: rgba(244, 247, 249, .45)

.perf-num
    display: block
    font-family: var(--font-mono)
    font-size: clamp(34px, 4vw, 58px)
    letter-spacing: -.06em
    line-height: 1
    color: $ink

    small
        margin-left: 4px
        font-size: 12px
        color: rgba(200, 255, 90, .8)

.perf-unit
    display: block
    margin-top: 10px
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .16em
    color: rgba(244, 247, 249, .35)

.perf-line
    display: flex
    align-items: center
    flex-wrap: wrap
    gap: 12px
    margin-top: 56px
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .14em
    color: rgba(244, 247, 249, .34)

    b
        color: rgba(200, 255, 90, .55)
        font-weight: 400

.cta
    min-height: 100vh
    display: flex
    flex-direction: column
    justify-content: flex-end
    padding: 120px 8vw 0
    position: relative
    z-index: 2

.cta-panel
    width: min(820px, 100%)
    margin: 0 auto 10vh
    padding: 46px
    text-align: center
    background: rgba(8, 12, 17, .6)
    border: 1px solid rgba(200, 255, 90, .16)
    border-radius: 22px
    backdrop-filter: blur(24px)
    box-shadow: 0 40px 120px rgba(0, 0, 0, .5)

    h2
        margin: 18px 0 0
        font-size: clamp(40px, 4.6vw, 68px)
        line-height: .98
        letter-spacing: -.055em
        font-weight: 600

    > p:not(.index)
        margin: 20px 0 0
        font-size: 12.5px
        color: rgba(244, 247, 249, .5)

    .index
        text-align: center

.cta-actions
    display: flex
    justify-content: center
    gap: 10px
    margin-top: 30px

.foot
    display: flex
    align-items: center
    justify-content: space-between
    padding: 20px 0
    border-top: 1px solid $line
    font-family: var(--font-mono)
    font-size: 8.5px
    letter-spacing: .08em
    color: rgba(244, 247, 249, .35)

.foot-meta
    color: rgba(244, 247, 249, .24)

.reveal
    opacity: 0
    transform: translateY(26px)
    transition: opacity .8s cubic-bezier(.2, .7, .2, 1), transform .8s cubic-bezier(.2, .7, .2, 1)

    &.is-in
        opacity: 1
        transform: none

@keyframes pulse
    0%, 100%
        opacity: 1
    50%
        opacity: .3

.webgpu-fallback
    position: fixed
    left: 50%
    bottom: 24px
    transform: translateX(-50%)
    z-index: 40
    display: grid
    gap: 4px
    padding: 10px 16px
    font-size: 10px
    color: #ffd3a8
    background: rgba(30, 16, 8, .86)
    border: 1px solid rgba(255, 180, 90, .3)
    border-radius: 8px

@media (max-width: 1040px)
    .nav-links
        display: none

    .split
        grid-template-columns: 1fr

    .section-aside
        justify-content: flex-start

    .steps, .perf-grid
        grid-template-columns: 1fr

    .hero-stats
        gap: 24px
        flex-wrap: wrap

    .brand-tag, .live
        display: none

@media (max-width: 640px)
    .stage-view
        opacity: .74

    .stage-veil
        background: radial-gradient(620px 440px at 50% 30%, rgba(110, 231, 249, .06), transparent 64%), linear-gradient(180deg, rgba(4, 6, 10, .58) 0%, rgba(4, 6, 10, .38) 42%, rgba(4, 6, 10, .94) 100%)

    .nav
        padding: 14px 18px

    .hero, .section, .cta
        padding-left: 22px
        padding-right: 22px

    .display
        font-size: 46px

    .hero-stats
        display: grid
        grid-template-columns: 1fr 1fr

    .cta-panel
        padding: 30px 22px

    .foot
        flex-direction: column
        gap: 6px
        align-items: flex-start
</style>

<style lang="sass">
html.is-landing
    height: auto
    overflow-y: auto
    background: #04060a

    body
        height: auto
        overflow: visible

html.is-landing #app
    height: auto
    min-height: 100%

html.is-landing::-webkit-scrollbar
    width: 5px

html.is-landing::-webkit-scrollbar-track
    background: transparent

html.is-landing::-webkit-scrollbar-thumb
    background: rgba(200, 255, 90, .25)
    border-radius: 99px
</style>






