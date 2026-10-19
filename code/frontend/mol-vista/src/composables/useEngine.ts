// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file useEngine.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:30
 * @desc 视口引擎生命周期 composable。负责初始化 Renderer / Scene / OrbitCamera / 灯光，
 *       按 store 里的"表示"（显示模式 / 着色方案 / 半径缩放）构建原子球与化学键圆柱，
 *       并提供 fit / 工具切换 / HUD 指标读取等命令。
 *       GPU 对象全部持有在 composable 内部，不进 Pinia（ui.md §六）。
 *
 *       表示变更的分级（docs/architecture/03 §7）：
 *         显示模式 / 着色方案 / 半径 → 现在走 Tier C（重建批次）；
 *         氢原子显隐 → Tier A（只翻 visible，不动几何）。
 *       之所以半径也要重建，是因为当前是"一个原子一个 Mesh、一个键一个 Mesh"（还没有实例化渲染，
 *       见 06 D52/D53）：半径被烘进几何体。实例化落地后，半径应变成实例属性 + uniform 缩放（Tier A/B）。
 *
 *       颜色与半径的"化学语义"（CPK、链色板、vdW/共价半径）最终应下沉到 @wmv/molecule 的表示层
 *       （packages/molecule/src/representation/Representation.md）；本文件现在承担的是胶水职责 —
 *       因为该包目前只有设计文档、没有实现。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import {
    Renderer,
    Scene,
    OrbitCamera,
    Mesh,
    SphereGeometry,
    CylinderGeometry,
    Material,
    DirectionalLight,
    AmbientLight,
    type RendererOptions,
    type Mesh as MeshType,
} from '@wmv/webgpu-engine';
import { useMoleculeStore, type AtomData, type ColorScheme, type DisplayMode } from '@/stores/molecule.store';

/** 视口 HUD 指标快照 */
export interface HudMetrics {
    fps: string;
    ms: string;
    inst: string;
}

/** 引擎对外暴露的命令与状态 */
export interface EngineHandle {
    /** 引擎是否已就绪（GPU 初始化完成） */
    ready: Ref<boolean>;
    /** WebGPU 是否可用（浏览器不支持时为 false） */
    webgpuAvailable: Ref<boolean>;
    /** 最近 500ms 节流的 HUD 指标 */
    metrics: Ref<HudMetrics>;
    /** 适应视图：把相机拉到能完整看到分子的距离 */
    fit: () => void;
    /** 切换坐标网格显示 */
    toggleGrid: () => void;
    /** 切换氢原子显示（写 store，由 watcher 应用到 mesh） */
    toggleHydrogens: () => void;
}


// ---------------------------------------------------------------------------
// 表示参数（显示模式的几何语义）
// ---------------------------------------------------------------------------

/**
 * 球半径相对 store 里 `atom.radius` 的倍率。
 *
 * store 的 radius 来自演示数据的元素半径表（C 0.76 / H 0.31 …），量级偏共价半径，
 * 因此球棍直接用 1.0（与接入前的观感一致），空间填充放大到接近范德华尺度。
 * 接入 @wmv/structure 的元素表后应改成"球棍 = 共价半径、空间填充 = vdW 半径"两个真实字段（见 02 §7）。
 */
const BALL_RADIUS_FACTOR: Record<DisplayMode, number> = {
    ballStick: 1.0,
    spaceFill: 2.2,
    wireframe: 0,
    cartoon: 0,
};

/** 键（圆柱）的基准半径（Å，未乘滑块） */
const STICK_RADIUS: Record<DisplayMode, number> = {
    ballStick: 0.12,
    wireframe: 0.035,
    spaceFill: 0,
    cartoon: 0,
};

/** 圆柱的圆周细分：键很细，12 段已经看不出多边形（比球省得多） */
const BOND_RADIAL_SEGMENTS = 12;

/** 球的经纬细分 */
const SPHERE_WIDTH_SEGMENTS = 24;
const SPHERE_HEIGHT_SEGMENTS = 16;

/** 链色板（线性 RGB 近似；与 CPK 元素色区分明显） */
const CHAIN_PALETTE: Array<[number, number, number]> = [
    [0.29, 0.62, 1.00],
    [1.00, 0.55, 0.24],
    [0.36, 0.80, 0.45],
    [0.85, 0.38, 0.72],
    [0.95, 0.82, 0.32],
    [0.45, 0.85, 0.85],
    [0.70, 0.50, 0.95],
    [0.90, 0.45, 0.40],
];

/** 当前支持的显示模式；'cartoon' 需要二级结构信息，演示数据没有，故暂不支持（见 04 §6） */
const SUPPORTED_MODES: readonly DisplayMode[] = ['ballStick', 'spaceFill', 'wireframe'];

/** 半径滑块拖拽时的重建防抖（毫秒） */
const REBUILD_DEBOUNCE_MS = 90;


/**
 * 绑定 canvas 到 WebGPU 渲染器并启动帧循环。
 *
 * @param canvasRef canvas 元素的 ref
 * @param onReady 就绪回调（可选）
 */
export function useEngine(
    canvasRef: { value: HTMLCanvasElement | null },
    onReady?: (handle: EngineHandle) => void
): EngineHandle {
    const ready = ref(false);
    const webgpuAvailable = ref(false);
    const metrics = ref<HudMetrics>({ fps: '0.0', ms: '0.00', inst: '0' });

    // shallowRef 避免 Vue 对 GPU 对象做深度响应式代理
    const renderer = shallowRef<Renderer | null>(null);
    const scene = shallowRef<Scene | null>(null);
    const camera = shallowRef<OrbitCamera | null>(null);
    const meshes = shallowRef<MeshType[]>([]);
    const hydrogens = shallowRef<MeshType[]>([]);
    const bonds = shallowRef<MeshType[]>([]);

    let gridVisible = false;
    let rafId: number | null = null;
    let rebuildTimer: number | null = null;

    /** 原子 id → mesh（氢原子被分到另一个数组，所以不能靠下标索引） */
    const meshesByAtomId = new Map<number, MeshType>();

    /** 当前高亮的 mesh 及其原始颜色（选中反馈；重建后按 store 的选中恢复） */
    let highlightedMesh: MeshType | null = null;
    let highlightedOriginalColor: [number, number, number] | null = null;

    /** 选中高亮色（线性 RGB，偏金黄，与 CPK 元素色区分明显） */
    const SELECTION_COLOR: [number, number, number] = [1.0, 0.74, 0.24];

    /** 判定"点击选择"而非"拖拽旋转"的阈值 */
    const CLICK_MOVE_TOLERANCE_PX = 4;
    const CLICK_MAX_DURATION_MS = 600;

    let pointerDownAt: { x: number; y: number; time: number } | null = null;

    /** HUD 节流：每 500ms 更新一次 */
    let lastHudUpdate = 0;
    let frameCount = 0;
    let fpsAccum = 0;

    const store = useMoleculeStore();

    const onFrame: RendererOptions['onFrame'] = (stats) => {
        frameCount++;
        fpsAccum += stats.cpuMs;

        const now = performance.now();
        if (now - lastHudUpdate >= 500) {
            const avgMs = fpsAccum / frameCount;
            const fps = avgMs > 0 ? 1000 / avgMs : 0;
            metrics.value = {
                fps: fps.toFixed(1),
                ms: avgMs.toFixed(2),
                // 场景里的绘制对象数（原子 + 氢 + 键）——还不是"实例数"，实例化落地后再改口径
                inst: (meshes.value.length + hydrogens.value.length + bonds.value.length).toString(),
            };
            lastHudUpdate = now;
            frameCount = 0;
            fpsAccum = 0;
        }
    };

    // -----------------------------------------------------------------------
    // 表示构建（Tier C：重建批次）
    // -----------------------------------------------------------------------

    /** 按存储的着色方案取原子颜色 */
    function colorOfAtom(atom: AtomData, scheme: ColorScheme): [number, number, number] {
        if (scheme === 'chain') {
            const key = atom.chain ?? '';
            let hash = 0;

            for (let i = 0; i < key.length; i++)
                hash = (hash * 31 + key.charCodeAt(i)) >>> 0;

            return CHAIN_PALETTE[hash % CHAIN_PALETTE.length] ?? atom.color;
        }

        // 'element' 用数据里的 CPK；'charge' / 'secondary' 需要对应数据列，UI 已按能力禁用，
        // 这里兜底回元素色（不猜数据，见 04 §2 原则 4）
        return atom.color;
    }

    /**
     * 按 store 里的表示构建整个场景的绘制对象：原子球 + 化学键圆柱。
     *
     * objectId 约定（docs/architecture/02 §8）：
     *   原子 → `原子 id + 1`（0 保留给"空"）；键暂时不参与拾取（objectId = 0），
     *   将来做键检视时按 A5 的打包规则给 `(batchTag << 28) | bondIndex`。
     */
    function buildRepresentation(rm: NonNullable<typeof renderer.value>['rm']): {
        atoms: MeshType[];
        hydrogens: MeshType[];
        bonds: MeshType[];
    } {
        const mode = SUPPORTED_MODES.includes(store.displayMode) ? store.displayMode : 'ballStick';

        if (mode !== store.displayMode)
            console.warn(`MsgId: 显示模式 "${store.displayMode}" 暂不支持（缺少二级结构数据），已回退到球棍模型`);

        const ballFactor = BALL_RADIUS_FACTOR[mode] * (store.ballRadiusScale / 100);
        const stickRadius = STICK_RADIUS[mode] * (store.bondRadiusScale / 100);

        const atomMeshes: MeshType[] = [];
        const hydrogenMeshes: MeshType[] = [];
        const bondMeshes: MeshType[] = [];

        meshesByAtomId.clear();

        // ---- 原子球（线框模式不画球） ----
        if (ballFactor > 0) {
            for (const atom of store.atoms) {
                const geometry = new SphereGeometry(
                    atom.radius * ballFactor,
                    SPHERE_WIDTH_SEGMENTS,
                    SPHERE_HEIGHT_SEGMENTS
                );

                geometry.upload(rm);

                const mesh = new Mesh({
                    geometry,
                    material: new Material({ color: colorOfAtom(atom, store.colorScheme), roughness: 0.35, metallic: 0.0 }),
                    position: atom.position,
                    objectId: atom.id + 1,
                    visible: atom.symbol !== 'H' || store.showHydrogens,
                    rm,
                    name: `${atom.symbol}#${atom.id}`,
                });

                meshesByAtomId.set(atom.id, mesh);

                if (atom.symbol === 'H') hydrogenMeshes.push(mesh);
                else atomMeshes.push(mesh);
            }
        }

        // ---- 化学键（球棍 / 线框都画；空间填充按化学惯例不画键） ----
        if (stickRadius > 0) {
            for (let index = 0; index < store.bonds.length; index++) {
                const bond = store.bonds[index];
                if (!bond) continue;

                const [idA, idB] = bond;
                const a = store.atoms[idA];
                const b = store.atoms[idB];

                if (!a || !b) {
                    console.warn(`MsgId: 化学键 #${index} 的端点越界（${idA}, ${idB}），已跳过`);
                    continue;
                }

                const dx = b.position[0] - a.position[0];
                const dy = b.position[1] - a.position[1];
                const dz = b.position[2] - a.position[2];
                const length = Math.hypot(dx, dy, dz);

                // 重叠原子（长度为 0）无法定向，跳过而不是产生 NaN 矩阵
                if (length < 1e-6) {
                    console.warn(`MsgId: 化学键 #${index} 的两个原子重合，已跳过`);
                    continue;
                }

                const geometry = new CylinderGeometry(stickRadius, length, BOND_RADIAL_SEGMENTS);
                geometry.upload(rm);

                // 键色取两端原子颜色的均值（"分裂键"需要两段/逐顶点着色，见 Representation.md 的颜色约定）
                const colorA = colorOfAtom(a, store.colorScheme);
                const colorB = colorOfAtom(b, store.colorScheme);

                const mesh = new Mesh({
                    geometry,
                    material: new Material({
                        color: [(colorA[0] + colorB[0]) / 2, (colorA[1] + colorB[1]) / 2, (colorA[2] + colorB[2]) / 2],
                        roughness: 0.45,
                        metallic: 0.0,
                    }),
                    position: [(a.position[0] + b.position[0]) / 2, (a.position[1] + b.position[1]) / 2, (a.position[2] + b.position[2]) / 2],
                    rm,
                    name: `bond#${index}`,
                });

                // 圆柱轴向是 +Y、几何中心在原点：只要把 +Y 旋到键方向即可（Mesh 只支持均匀缩放，不需要非均匀缩放）
                // 旋转按 YXZ 顺序：Ry(β)·Rx(α)·(0,1,0) = (sinα·sinβ, cosα, sinα·cosβ)
                //   → α = acos(dy)、β = atan2(dx, dz)
                const alpha = Math.acos(Math.min(1, Math.max(-1, dy / length)));
                const beta = Math.atan2(dx, dz);

                mesh.setRotation(alpha, beta, 0);
                bondMeshes.push(mesh);
            }
        }

        return { atoms: atomMeshes, hydrogens: hydrogenMeshes, bonds: bondMeshes };
    }

    /** 释放一批 mesh（Mesh.dispose 会同时销毁它自己的几何体缓冲；本设计里没有共享几何体） */
    function disposeMeshes(list: MeshType[]): void {
        const s = scene.value;

        for (const mesh of list) {
            s?.remove(mesh);
            mesh.dispose();
        }
    }

    /** 按当前表示重建整批绘制对象 */
    function rebuildRepresentation(): void {
        const r = renderer.value;
        const s = scene.value;
        if (!r || !s) return;

        // 先释放旧的：Mesh.dispose 会销毁 uniform buffer 与几何体缓冲，避免每次切换模式都泄漏显存
        disposeMeshes(meshes.value);
        disposeMeshes(hydrogens.value);
        disposeMeshes(bonds.value);

        highlightedMesh = null;
        highlightedOriginalColor = null;

        const built = buildRepresentation(r.rm);

        meshes.value = built.atoms;
        hydrogens.value = built.hydrogens;
        bonds.value = built.bonds;

        s.add(...built.atoms, ...built.hydrogens, ...built.bonds);

        // 重建后 mesh 是新的，按 store 里仍然有效的选中恢复高亮
        highlightAtom(store.selectedAtomId);
    }

    /** 半径滑块拖动时用防抖合并重建（连续重建会浪费显存与 CPU） */
    function scheduleRebuild(): void {
        if (!ready.value) return;

        if (rebuildTimer !== null) clearTimeout(rebuildTimer);

        rebuildTimer = window.setTimeout(() => {
            rebuildTimer = null;
            rebuildRepresentation();
        }, REBUILD_DEBOUNCE_MS);
    }

    async function init(): Promise<void> {
        const canvas = canvasRef.value;
        if (!canvas) return;

        // 检查 WebGPU 可用性
        if (!('gpu' in navigator)) {
            webgpuAvailable.value = false;
            return;
        }

        webgpuAvailable.value = true;

        try {
            const r = await Renderer.create(canvas, { sampleCount: 4 }, { onFrame, picking: true });
            renderer.value = r;

            const s = new Scene({ gpu: r.gpu, rm: r.rm });
            scene.value = s;

            // 相机
            const cam = new OrbitCamera({
                canvas,
                distance: 12,
                theta: Math.PI / 4,
                phi: Math.PI / 6,
                damping: 0.1,
            });
            camera.value = cam;
            s.camera = cam;

            // 灯光
            s.lights.push(new DirectionalLight([0.5, 1.0, 0.7], [1.0, 0.98, 0.92], 1.2));
            s.lights.push(new AmbientLight([0.18, 0.18, 0.24], 1.0));

            // 结构 → 绘制对象
            rebuildRepresentation();

            // 拾取链路：点击 → requestPick（CSS 像素）→ 至少延迟一帧后在 onPick 回调拿到 objectId
            r.onPick((info) => {
                const atomId = info.id - 1;      // objectId = 原子 id + 1；0 表示点到背景（或点到了键）

                if (info.id === 0 || atomId < 0 || atomId >= store.atoms.length) {
                    store.selectAtom(null);
                    highlightAtom(null);
                    return;
                }

                store.selectAtom(atomId);
                highlightAtom(atomId);
            });

            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('click', onClick);

            // 启动渲染
            r.start(s);
            ready.value = true;

            // 首帧前把相机套住分子：默认轨道半径 12 与分子尺度（几埃）无关，
            // 不 fit 的话分子会缩在视口中间一小块里。
            fit();

            onReady?.(handle);
        } catch (err) {
            console.error('[MolVista] WebGPU init failed:', err);
            webgpuAvailable.value = false;
        }
    }

    /** 适应视图 */
    function fit(): void {
        const cam = camera.value;
        const all = [...meshes.value, ...hydrogens.value];
        if (!cam || all.length === 0) return;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        for (const m of all) {
            const [x, y, z] = m.position;
            const r = m.scale;
            minX = Math.min(minX, x - r);
            minY = Math.min(minY, y - r);
            minZ = Math.min(minZ, z - r);
            maxX = Math.max(maxX, x + r);
            maxY = Math.max(maxY, y + r);
            maxZ = Math.max(maxZ, z + r);
        }

        cam.frameBounds({
            min: [minX, minY, minZ],
            max: [maxX, maxY, maxZ],
        }, 1.3);
    }

    function toggleGrid(): void {
        gridVisible = !gridVisible;
        // TODO: 引擎接入 grid pass 后切换可见性
    }

    /** 氢原子显隐（Tier A）：只翻 visible，不重建几何 */
    function applyHydrogenVisibility(): void {
        for (const h of hydrogens.value) {
            h.visible = store.showHydrogens;
        }
    }

    function toggleHydrogens(): void {
        store.toggleHydrogens();
    }

    // ---- 拾取：指针事件 → requestPick ---- //

    function onPointerDown(e: PointerEvent): void {
        if (e.button !== 0) return;

        pointerDownAt = { x: e.clientX, y: e.clientY, time: performance.now() };
    }

    /**
     * 只在"没有拖拽、没有长按"时才算点击选择。
     * 否则每转一次视角都会选中一个原子（OrbitCamera 的 mousedown/mousemove 与它共用一个 canvas）。
     */
    function onClick(e: MouseEvent): void {
        const start = pointerDownAt;
        pointerDownAt = null;

        const r = renderer.value;
        const canvas = canvasRef.value;
        if (!r || !canvas || !start) return;

        const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y);
        const elapsed = performance.now() - start.time;
        if (moved > CLICK_MOVE_TOLERANCE_PX || elapsed > CLICK_MAX_DURATION_MS) return;

        // 引擎要 CSS 像素（相对 canvas），换算与 DPR 由引擎内部统一处理
        const rect = canvas.getBoundingClientRect();
        r.requestPick(e.clientX - rect.left, e.clientY - rect.top);
    }

    /** 选中高亮：直接改材质颜色（每帧随 object uniform 上传，无需重建批次） */
    function highlightAtom(atomId: number | null): void {
        if (highlightedMesh && highlightedOriginalColor)
            highlightedMesh.material.color = highlightedOriginalColor;

        highlightedMesh = null;
        highlightedOriginalColor = null;

        if (atomId === null) return;

        const mesh = meshesByAtomId.get(atomId);
        if (!mesh) return;

        highlightedOriginalColor = [...mesh.material.color] as [number, number, number];
        mesh.material.color = SELECTION_COLOR;
        highlightedMesh = mesh;
    }

    // 启动初始化
    init();

    // 启动时加载演示分子（若无结构）
    if (store.atoms.length === 0) {
        store.loadDemo();
    }

    // 结构变化 → 立刻重建并重新取景
    watch(
        () => store.atoms.length,
        () => {
            if (!ready.value) return;

            rebuildRepresentation();
            fit();
        }
    );

    // 表示变化 → 防抖重建（显示模式 / 着色方案 / 半径滑块）
    watch(
        () => [store.displayMode, store.colorScheme, store.ballRadiusScale, store.bondRadiusScale],
        () => scheduleRebuild()
    );

    // 氢原子显隐 → 只翻 visible
    watch(
        () => store.showHydrogens,
        () => applyHydrogenVisibility()
    );

    const handle: EngineHandle = {
        ready,
        webgpuAvailable,
        metrics,
        fit,
        toggleGrid,
        toggleHydrogens,
    };

    onBeforeUnmount(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (rebuildTimer !== null) clearTimeout(rebuildTimer);

        canvasRef.value?.removeEventListener('pointerdown', onPointerDown);
        canvasRef.value?.removeEventListener('click', onClick);

        camera.value?.dispose();
        scene.value?.dispose();
        renderer.value?.dispose();
    });

    return handle;
}
