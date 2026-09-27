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
 *       上传演示分子几何，并提供 fit / 工具切换 / HUD 指标读取等命令。
 *       GPU 对象全部持有在 composable 内部，不进 Pinia（ui.md §六）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import {
    Renderer,
    Scene,
    OrbitCamera,
    Mesh,
    SphereGeometry,
    Material,
    DirectionalLight,
    AmbientLight,
    type RendererOptions,
    type Mesh as MeshType,
} from '@wmv/webgpu-engine';
import { useMoleculeStore, type AtomData } from '@/stores/molecule.store';

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
    /** 切换氢原子显示 */
    toggleHydrogens: () => void;
}

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

    let gridVisible = false;
    let rafId: number | null = null;

    // ---- HUD 节流：每 500ms 更新一次 ----
    let lastHudUpdate = 0;
    let frameCount = 0;
    let fpsAccum = 0;

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
                inst: meshes.value.length.toString(),
            };
            lastHudUpdate = now;
            frameCount = 0;
            fpsAccum = 0;
        }
    };

    /**
     * 从 molecule store 读取原子，构建 mesh 列表。
     * 氢原子单独分组以便切换可见性。
     */
    function buildMeshes(rm: NonNullable<typeof renderer.value>['rm']): { atoms: MeshType[]; hydrogens: MeshType[] } {
        const atoms: MeshType[] = [];
        const hs: MeshType[] = [];
        const store = useMoleculeStore();

        for (const atom of store.atoms) {
            const geo = new SphereGeometry(atom.radius, 24, 16);
            geo.upload(rm);

            const mesh = new Mesh({
                geometry: geo,
                material: new Material({ color: atom.color, roughness: 0.35, metallic: 0.0 }),
                position: atom.position,
                rm,
                name: atom.symbol,
            });

            if (atom.symbol === 'H') {
                hs.push(mesh);
            } else {
                atoms.push(mesh);
            }
        }

        return { atoms, hydrogens: hs };
    }

    /** 从 store 重建所有 mesh（结构变更时调用） */
    function rebuildMeshes(): void {
        const r = renderer.value;
        const s = scene.value;
        if (!r || !s) return;

        // 移除旧 mesh
        for (const m of meshes.value) s.remove(m);
        for (const m of hydrogens.value) s.remove(m);

        const { atoms, hydrogens: hs } = buildMeshes(r.rm);
        meshes.value = atoms;
        hydrogens.value = hs;
        s.add(...atoms, ...hs);
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
            const r = await Renderer.create(canvas, { sampleCount: 4 }, { onFrame });
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

            // 演示分子
            const { atoms, hydrogens: hs } = buildMeshes(r.rm);
            meshes.value = atoms;
            hydrogens.value = hs;
            s.add(...atoms, ...hs);

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

    function toggleHydrogens(): void {
        for (const h of hydrogens.value) {
            h.visible = !h.visible;
        }
    }

    // 启动初始化
    init();

    // 监听结构变化，重建 mesh
    const store = useMoleculeStore();
    // 启动时加载演示分子（若无结构）
    if (store.atoms.length === 0) {
        store.loadDemo();
    }
    watch(
        () => store.atoms.length,
        () => {
            if (ready.value) {
                rebuildMeshes();
                fit();
            }
        }
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
        camera.value?.dispose();
        scene.value?.dispose();
        renderer.value?.dispose();
    });

    return handle;
}
