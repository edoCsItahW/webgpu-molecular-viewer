// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file useEngine.ts
 * @author edocsitahw
 * @version 1.2
 * @date 2026/10/28
 * @desc 视口引擎生命周期 composable。负责初始化 Renderer / Scene / OrbitCamera / 灯光，
 *       按 store 里的"表示"（显示模式 / 着色方案 / 半径缩放）构建实例化批次，
 *       并提供 fit / 工具切换 / HUD 指标读取等命令。
 *
 *       P1（docs/architecture/08）：
 *         旧路径"一个原子一个 Mesh"已替换为两个 Batch：
 *           原子 → 单位球几何 + 实例矩阵（缩放 = 元素半径 × 表示倍率）
 *           化学键 → 单位柱几何 + 实例矩阵（缩放 = 键半径 × 键长）
 *         每帧只有 2 次 draw、0 次 per-object uniform 上传；表示变化只重写实例缓冲，
 *         不再重建几何体 / Mesh 对象。
 *
 *       表示变更的分级（docs/architecture/03 §7）：
 *         显示模式 / 着色方案 / 半径 → 重写实例数据（一次 writeBuffer）；
 *         氢原子显隐 → 同上（隐藏的氢缩放为 0 且不参与拾取）；
 *         结构变化 → 重建实例数据 + 重新取景。
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
    Batch,
    SphereGeometry,
    CylinderGeometry,
    QuadGeometry,
    Mesh,
    Material,
    DirectionalLight,
    AmbientLight,
    packColor,
    createGpuMd,
    type GpuMd,
    type RendererOptions,
    type Geometry,
} from '@wmv/webgpu-engine';
import { useMoleculeStore, type ColorScheme, type DisplayMode } from '@/stores/molecule.store';
import { elementByZ } from '@wmv/structure';
import { getElementColor, getElementRadius } from '@/data/demo-molecule';
import { buildCartoonInstances } from '@/utils/cartoon';
import { buildRibbonParts } from '@/utils/ribbon';
import { RibbonGeometry } from '@/utils/ribbon-geometry';
import { useWebGL2Fallback } from '@/composables/useWebGL2Fallback';

/** 视口 HUD 指标快照 */
export interface HudMetrics {
    fps: string;
    ms: string;
    inst: string;
}

/** 相机位姿（展示页/答辩页编排用） */
export interface CameraPose {
    position: [number, number, number];
    target: [number, number, number];
}

/** 引擎对外暴露的命令与状态 */
export interface EngineHandle {
    /** 引擎是否已就绪（GPU 初始化完成） */
    ready: Ref<boolean>;
    /** WebGPU 是否可用（浏览器不支持时为 false） */
    webgpuAvailable: Ref<boolean>;
    /** WebGL2 兼容渲染是否激活 */
    webgl2Available: Ref<boolean>;
    /** 当前实际渲染后端 */
    backend: Ref<'webgpu' | 'webgl2' | 'none'>;
    /** 最近 500ms 节流的 HUD 指标 */
    metrics: Ref<HudMetrics>;
    /** 适应视图：把相机拉到能完整看到分子的距离 */
    fit: () => void;
    /** 切换坐标网格显示 */
    toggleGrid: () => void;
    /** 切换氢原子显示（写 store，由 watcher 重建实例数据） */
    toggleHydrogens: () => void;
    /** 当前相机位姿（未就绪返回 null） */
    cameraPose: () => CameraPose | null;
    /** 立即设置相机位姿 */
    setCameraPose: (pose: CameraPose) => void;
    /** 补间到目标位姿；返回 Promise 便于章节串行 */
    animateCameraPose: (pose: CameraPose, durationMs?: number) => Promise<void>;
    /** 世界坐标 → 画布 CSS 像素（标签/标注用）；不可见返回 null */
    projectPoint: (position: readonly [number, number, number]) => {x: number; y: number} | null;
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

/** 拾取用单位柱网格的圆周细分（绘制用 impostor，不需要细分） */
const BOND_RADIAL_SEGMENTS = 12;

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
const SUPPORTED_MODES: readonly DisplayMode[] = ['ballStick', 'spaceFill', 'wireframe', 'cartoon'];

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

    /** 原子 / 键 / 卡通批次。球棍模式 2 个 draw；卡通模式 1 个 draw */
    const atomBatch = shallowRef<Batch | null>(null);
    const bondBatch = shallowRef<Batch | null>(null);
    const cartoonBatch = shallowRef<Batch | null>(null);

    /** 卡通 ribbon 的 Mesh 列表（每个二级结构 run 一个；总 draw 数 ≈ run 数） */
    const ribbonObjects: Array<{mesh: Mesh; geometry: RibbonGeometry}> = [];

    /** 超过此原子数不再生成 ribbon（避免上千次 draw），回退 tube */
    const RIBBON_MAX_ATOMS = 30000;

    /** 单位 quad（球/柱 impostor 共用，P2） */
    let quadGeometry: Geometry | null = null;

    /** 拾取用的单位网格：impostor 的绘制几何是 quad，拾取改用网格（同一实例矩阵） */
    let spherePickGeometry: Geometry | null = null;
    let cylinderPickGeometry: Geometry | null = null;

    let gridVisible = false;
    let rafId: number | null = null;
    let rebuildTimer: number | null = null;

    /** 展示页相机编排：进行中的相机补间 */
    let cameraAnimRaf: number | null = null;

    /** GPU MD（P4）：直接改写球批次的位置，渲染下一帧可见 */
    let md: GpuMd | null = null;
    let mdRaf: number | null = null;
    let mdFrames = 0;
    /** MD 未就绪时暂存的 seek 目标，重建后补执行 */
    let pendingSeek: number | null = null;

    /** 当前高亮的原子 id 与其原始颜色（选中反馈；重建后按 store 的选中恢复） */
    let highlightedAtomId: number | null = null;
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
    const fallback = useWebGL2Fallback(canvasRef);
    const webgl2Available = ref(false);
    const backend = ref<'webgpu' | 'webgl2' | 'none'>('none');

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
                // 绘制实例数（原子 + 键）。P1 之前是 Mesh 数，口径一致
                inst: (
                    (atomBatch.value?.count ?? 0)
                    + (bondBatch.value?.count ?? 0)
                    + (cartoonBatch.value?.count ?? 0)
                    + ribbonObjects.length
                ).toString(),
            };
            lastHudUpdate = now;
            frameCount = 0;
            fpsAccum = 0;
        }
    };

    // -----------------------------------------------------------------------
    // 表示构建（Tier C：重写实例缓冲）
    // -----------------------------------------------------------------------

    /** 按存储的着色方案取原子颜色（R2：按元素符号/链 ID，不再依赖 AtomData） */
    function colorOfAtom(symbol: string, chain: string, scheme: ColorScheme): [number, number, number] {
        const base = getElementColor(symbol);

        if (scheme === 'chain') {
            let hash = 0;

            for (let i = 0; i < chain.length; i++)
                hash = (hash * 31 + chain.charCodeAt(i)) >>> 0;

            return CHAIN_PALETTE[hash % CHAIN_PALETTE.length] ?? base;
        }

        // 'charge' / 'secondary' 暂回元素色（缺列不猜数据）
        return base;
    }

    /**
     * 焦点降噪：0 主角 / 1 口袋上下文 / 2 背景。
     * 用"去饱和 + 压暗"而不是透明，避免排序与混合开销。
     */
    function dimColor(
        color: [number, number, number],
        level: 0 | 1 | 2
    ): [number, number, number] {
        if (level === 0) return color;

        const mix = level === 1 ? 0.7 : 0.95;
        const scale = level === 1 ? 0.75 : 0.5;
        const grey = 0.42;

        return [
            (color[0] * (1 - mix) + grey * mix) * scale,
            (color[1] * (1 - mix) + grey * mix) * scale,
            (color[2] * (1 - mix) + grey * mix) * scale,
        ];
    }

    /** 释放所有 ribbon Mesh（Mesh.dispose 会级联释放 geometry） */
    function clearRibbon(): void {
        const s = scene.value;

        for (const {mesh} of ribbonObjects) {
            s?.remove(mesh);
            mesh.dispose();
        }

        ribbonObjects.length = 0;
    }

    /**
     * 按当前表示重写两个批次的实例数据。
     *
     * 实例布局（96 B，见 Batch.ts）：
     *   model(16 floats) + color(4) + objectId(u32) + pad(3)
     *
     * objectId 约定（docs/architecture/02 §8）：
     *   原子 → `原子 id + 1`（0 保留给"空"）；键不参与拾取（objectId = 0）。
     */
    function rebuildInstances(): void {        const r = renderer.value;
        if (fallback.active.value) return;
        const s = scene.value;
        if (!r || !s) return;

        const mode = SUPPORTED_MODES.includes(store.displayMode) ? store.displayMode : 'ballStick';

        if (mode !== store.displayMode)
            console.warn(`MsgId: 显示模式 "${store.displayMode}" 暂不支持（缺少二级结构数据），已回退到球棍模型`);

        const ballFactor = BALL_RADIUS_FACTOR[mode] * (store.ballRadiusScale / 100);
        const stickRadius = STICK_RADIUS[mode] * (store.bondRadiusScale / 100);

        const data = store.structure;
        if (!data) return;

        const isCartoon = mode === 'cartoon';
        const atomTotal = data.meta.atomCount;
        const positions = data.atoms.positions;
        const elements = data.atoms.element;
        const residueChain = data.atoms.chainIndex;
        const chainIds = data.chains?.id;
        const flags = data.atoms.flags;

        // ---- 焦点（口袋）几何：焦点残基包围球 + 上下文半径 ----
        const focusSet = new Set<number>(store.focusResidues);
        const focusRadius = store.focus?.radius ?? 6;
        const focusActive = focusSet.size > 0;
        const atomResidue = data.atoms.residueIndex;

        let fx = 0, fy = 0, fz = 0, focusAtoms = 0;
        let hull = 0;

        if (focusActive && atomResidue) {
            for (let i = 0; i < atomTotal; i++) {
                const r = atomResidue[i];

                if (r === undefined || !focusSet.has(r)) continue;

                fx += positions[i * 3]!;
                fy += positions[i * 3 + 1]!;
                fz += positions[i * 3 + 2]!;
                focusAtoms++;
            }

            if (focusAtoms > 0) {
                fx /= focusAtoms;
                fy /= focusAtoms;
                fz /= focusAtoms;

                for (let i = 0; i < atomTotal; i++) {
                    const r = atomResidue[i];

                    if (r === undefined || !focusSet.has(r)) continue;

                    hull = Math.max(hull, Math.hypot(
                        positions[i * 3]! - fx,
                        positions[i * 3 + 1]! - fy,
                        positions[i * 3 + 2]! - fz
                    ));
                }
            }
        }

        const levelOf = (i: number): 0 | 1 | 2 => {
            if (!focusActive || focusAtoms === 0 || !atomResidue) return 0;

            const r = atomResidue[i];

            if (r !== undefined && focusSet.has(r)) return 0;

            const d = Math.hypot(
                positions[i * 3]! - fx,
                positions[i * 3 + 1]! - fy,
                positions[i * 3 + 2]! - fz
            );

            return d - hull <= focusRadius ? 1 : 2;
        };

        // 卡通模式下把配体（HETATM 非水）叠加成球棍，蛋白用卡通管；否则整分子球棍。
        const ligandMask = new Uint8Array(atomTotal);

        if (isCartoon && flags) {
            for (let i = 0; i < atomTotal; i++) {
                const flag = flags[i]!;

                ligandMask[i] = (flag & 1) !== 0 && (flag & 2) === 0 ? 1 : 0;
            }
        }

        // ---- 可见性过滤（水 / 配体 / 侧链 / 氢） ----
        let hasBackbone = false;

        if (flags) {
            for (let i = 0; i < atomTotal; i++) {
                if ((flags[i]! & 16) !== 0) {
                    hasBackbone = true;
                    break;
                }
            }
        }

        const visible = new Uint8Array(atomTotal).fill(1);

        for (let i = 0; i < atomTotal; i++) {
            const flag = flags?.[i] ?? 0;

            if ((elements[i] ?? 0) === 1 && !store.showHydrogens) visible[i] = 0;
            else if ((flag & 2) !== 0 && !store.showWaters) visible[i] = 0;
            else if ((flag & 1) !== 0 && (flag & 2) === 0 && !store.showLigands) visible[i] = 0;
            else if (hasBackbone && (flag & 1) === 0 && (flag & 16) === 0 && !store.showSidechains) visible[i] = 0;
        }

        // ---- 选择高亮（原子/残基/链统一在重建时下发） ----
        const selection = store.selection;

        const isSelected = (i: number): boolean => {
            if (!selection) return false;
            if (selection.kind === 'atom') return selection.index === i;
            if (selection.kind === 'residue') return atomResidue?.[i] === selection.index;

            return residueChain?.[i] === selection.index;
        };

        const atomBallFactor = isCartoon ? 0.65 * (store.ballRadiusScale / 100) : ballFactor;
        const atomStickRadius = isCartoon ? 0.1 * (store.bondRadiusScale / 100) : stickRadius;

        // ---- 原子球（线框模式不画球；卡通模式只画配体） ----
        // P3 紧凑布局（32 B）：[center.xyz, radius][color u32][id u32][pad]
        const atomIndices: number[] = [];

        if (atomBallFactor > 0) {
            for (let i = 0; i < atomTotal; i++) {
                if (isCartoon && ligandMask[i] === 0) continue;
                if (visible[i] === 0) continue;
                atomIndices.push(i);
            }
        }

        const atomCount = atomIndices.length;
        const atomStride = 8;
        const atomData = new Float32Array(atomCount * atomStride);
        const atomU32 = new Uint32Array(atomData.buffer);

        for (let k = 0; k < atomCount; k++) {
            const i = atomIndices[k]!;
            const z = elements[i] ?? 0;
            const symbol = elementByZ(z).symbol;
            const hiddenHydrogen = z === 1 && !store.showHydrogens;
            const radius = hiddenHydrogen ? 0 : getElementRadius(symbol) * atomBallFactor;
            const chain = chainIds?.[residueChain?.[i] ?? -1] ?? '';
            const color = isSelected(i)
                ? SELECTION_COLOR
                : dimColor(colorOfAtom(symbol, chain, store.colorScheme), levelOf(i));
            const o = k * atomStride;

            atomData[o] = positions[i * 3]!;
            atomData[o + 1] = positions[i * 3 + 1]!;
            atomData[o + 2] = positions[i * 3 + 2]!;
            atomData[o + 3] = radius;

            atomU32[o + 4] = packColor(color);
            // 隐藏的氢不参与拾取（id = 0）；id 仍用 MDR 原子下标 + 1
            atomU32[o + 5] = hiddenHydrogen ? 0 : (i + 1) >>> 0;
        }

        // ---- 化学键（球棍 / 线框都画；空间填充按化学惯例不画键） ----
        // P3 紧凑布局（48 B）：[a.xyz, radius][b.xyz, pad][color u32][id u32][pad]
        const bonds = data.bonds;
        const totalBonds = bonds?.a.length ?? 0;
        const bondCapacity = atomStickRadius > 0 ? totalBonds : 0;
        const bondStride = 12;
        const bondData = new Float32Array(bondCapacity * bondStride);
        const bondU32 = new Uint32Array(bondData.buffer);
        let bondCount = 0;

        if (atomStickRadius > 0 && bonds) {
            for (let index = 0; index < totalBonds; index++) {
                const idA = bonds.a[index]!;
                const idB = bonds.b[index]!;

                if (idA >= atomTotal || idB >= atomTotal) continue;
                if (visible[idA] === 0 || visible[idB] === 0) continue;

                // 卡通模式只画与配体相关的键，避免蛋白内部键盖住卡通
                if (isCartoon && ligandMask[idA] === 0 && ligandMask[idB] === 0) continue;

                const ax = positions[idA * 3]!;
                const ay = positions[idA * 3 + 1]!;
                const az = positions[idA * 3 + 2]!;
                const bx = positions[idB * 3]!;
                const by = positions[idB * 3 + 1]!;
                const bz = positions[idB * 3 + 2]!;
                const length = Math.hypot(bx - ax, by - ay, bz - az);

                if (length < 1e-6) continue;

                const symbolA = elementByZ(elements[idA] ?? 0).symbol;
                const symbolB = elementByZ(elements[idB] ?? 0).symbol;
                const chainA = chainIds?.[residueChain?.[idA] ?? -1] ?? '';
                const chainB = chainIds?.[residueChain?.[idB] ?? -1] ?? '';

                const colorA = dimColor(colorOfAtom(symbolA, chainA, store.colorScheme), levelOf(idA));
                const colorB = dimColor(colorOfAtom(symbolB, chainB, store.colorScheme), levelOf(idB));

                const o = bondCount * bondStride;

                bondData[o] = ax;
                bondData[o + 1] = ay;
                bondData[o + 2] = az;
                bondData[o + 3] = atomStickRadius;

                bondData[o + 4] = bx;
                bondData[o + 5] = by;
                bondData[o + 6] = bz;
                bondData[o + 7] = 0;

                bondU32[o + 8] = packColor([
                    (colorA[0] + colorB[0]) / 2,
                    (colorA[1] + colorB[1]) / 2,
                    (colorA[2] + colorB[2]) / 2,
                ]);
                bondU32[o + 9] = 0;

                bondCount++;
            }
        }

        // ---- 卡通 ----
        const focusInfo = focusActive && focusAtoms > 0
            ? {
                residues: focusSet,
                center: [fx, fy, fz] as [number, number, number],
                hull,
                radius: focusRadius,
            }
            : undefined;

        let cartoonData: Float32Array<ArrayBufferLike> = new Float32Array(0);
        let cartoonCount = 0;
        let ribbonCount = 0;

        // 小/中等结构：真正的 ribbon 网格（每个二级结构 run 一个 Mesh）
        if (mode === 'cartoon' && data && atomTotal <= RIBBON_MAX_ATOMS) {
            clearRibbon();

            const parts = buildRibbonParts(data, store.colorScheme, focusInfo);

            for (const part of parts) {
                const geometry = new RibbonGeometry(part.positions, part.normals, part.indices);

                geometry.upload(r.rm);

                const mesh = new Mesh({
                    geometry,
                    material: new Material({color: part.color, roughness: 0.72, metallic: 0}),
                    rm: r.rm,
                    name: `ribbon-${ribbonObjects.length}`,
                });

                s.add(mesh);
                ribbonObjects.push({mesh, geometry});
            }

            ribbonCount = parts.length;        } else {
            clearRibbon();
        }

        // 大结构回退 tube（实例化，draw 数恒定）
        if (mode === 'cartoon' && data && ribbonCount === 0) {
            const cartoon = buildCartoonInstances(data, store.colorScheme, focusInfo);

            cartoonData = cartoon.data;
            cartoonCount = cartoon.count;
        }

        // ---- 批次不存在时创建（几何体已在 init 上传，整场景只建一次） ----
        if (!atomBatch.value && quadGeometry && spherePickGeometry) {
            atomBatch.value = new Batch({
                geometry: quadGeometry,
                kind: 'sphere',
                pickGeometry: spherePickGeometry,
                rm: r.rm,
                name: 'atoms',
            });
            s.addBatch(atomBatch.value);
        }

        if (!bondBatch.value && quadGeometry && cylinderPickGeometry) {
            bondBatch.value = new Batch({
                geometry: quadGeometry,
                kind: 'cylinder',
                pickGeometry: cylinderPickGeometry,
                rm: r.rm,
                name: 'bonds',
            });
            s.addBatch(bondBatch.value);
        }

        if (!cartoonBatch.value && quadGeometry && cylinderPickGeometry) {
            cartoonBatch.value = new Batch({
                geometry: quadGeometry,
                kind: 'cylinder',
                pickGeometry: cylinderPickGeometry,
                rm: r.rm,
                name: 'cartoon',
            });
            s.addBatch(cartoonBatch.value);
        }

        atomBatch.value?.setInstances(atomData, atomCount);
        bondBatch.value?.setInstances(bondData, bondCount);
        cartoonBatch.value?.setInstances(cartoonData, cartoonCount);

        if (atomBatch.value) atomBatch.value.visible = atomCount > 0;
        if (bondBatch.value) bondBatch.value.visible = bondCount > 0;
        if (cartoonBatch.value) cartoonBatch.value.visible = cartoonCount > 0;

        // 重建后实例是新的，按 store 里仍然有效的选中恢复高亮
        highlightedAtomId = null;
        highlightedOriginalColor = null;
        highlightAtom(store.selectedAtomId);

        // P4：实例缓冲换了，MD 必须重建（位置/速度/键表都基于这批实例）
        rebuildMd();
    }

    /** 重建 GPU MD；结构或表示变化后调用，避免持有已销毁的实例缓冲 */
    function rebuildMd(): void {
        stopMdLoop();
        md?.dispose();
        md = null;

        const r = renderer.value;
        if (!r || !atomBatch.value) return;

        // 卡通模式下原子批次只含配体子集，MD 的索引与全套键不再对应
        if (store.displayMode === 'cartoon') return;

        const data = store.structure;
        const bonds = data?.bonds;
        const bondPairs: Array<[number, number]> = [];

        if (bonds) {
            for (let k = 0; k < bonds.a.length; k++)
                bondPairs.push([bonds.a[k]!, bonds.b[k]!]);
        }

        md = createGpuMd(r, atomBatch.value, bondPairs, {
            dt: store.simParams.timestep * 0.001,   // fs → ps
            damping: store.simParams.damping,
            ljEpsilon: 1e-5,
            temperature: store.simParams.temperature,
        });

        if (md && pendingSeek !== null) {
            const target = pendingSeek;

            pendingSeek = null;

            if (target > 0) md.step(target);

            store.simStep = md.steps;
        }

        if (store.simStatus === 'running') startMdLoop();
    }

    /** 模拟循环：每帧推进 2 步（4779 原子约 2 ms/步），UI 每 10 帧同步一次步数 */
    function startMdLoop(): void {
        if (mdRaf !== null) return;

        mdFrames = 0;
        const tick = (): void => {
            if (!ready.value || !md || store.simStatus !== 'running') {
                mdRaf = null;

                return;
            }

            md.step(Math.max(1, Math.min(8, store.simSpeed)));
            mdFrames++;

            // 每 20 帧采样一次能量（读回 2×N×16 B，CPU 侧算 KE/PE）
            if (mdFrames % 20 === 0) {
                const engine = md;

                engine.sampleEnergy().then((sample) => {
                    if (!sample || md !== engine) return;

                    store.energy.potential = sample.potential;
                    store.energy.kinetic = sample.kinetic;
                    store.energy.total = sample.potential + sample.kinetic;
                    store.energy.temperature = sample.temperature;
                });
            }

            // 每 10 帧同步一次真实步数，避免每帧触发 Pinia 更新
            if (mdFrames % 10 === 0) store.simStep = md.steps;

            // 到达时间线终点：循环则回到 0，否则暂停
            if (md.steps >= store.simHorizon) {
                if (store.simLoop) {
                    md.reset();
                    store.simStep = 0;
                } else {
                    store.simStep = md.steps;
                    store.pause();
                }
            }

            mdRaf = requestAnimationFrame(tick);
        };

        mdRaf = requestAnimationFrame(tick);
    }

    function stopMdLoop(): void {
        if (mdRaf !== null) {
            cancelAnimationFrame(mdRaf);
            mdRaf = null;
        }
    }

    /** 半径滑块拖动时用防抖合并重建（连续重写实例数据仍然浪费带宽） */
    function scheduleRebuild(): void {
        if (!ready.value) return;

        if (rebuildTimer !== null) clearTimeout(rebuildTimer);
        if (cameraAnimRaf !== null) {
            cancelAnimationFrame(cameraAnimRaf);
            cameraAnimRaf = null;
        }

        rebuildTimer = window.setTimeout(() => {
            rebuildTimer = null;
            rebuildInstances();
        }, REBUILD_DEBOUNCE_MS);
    }

    /** WebGPU 不可用/初始化失败时切到 WebGL2 兼容渲染 */
    async function activateFallback(): Promise<void> {
        const ok = await fallback.start();

        if (!ok) {
            webgl2Available.value = false;
            backend.value = 'none';
            store.setEngineBackend('none');
            console.error('[MolVista] Neither WebGPU nor WebGL2 is available');
            return;
        }

        webgl2Available.value = true;
        backend.value = 'webgl2';
        ready.value = true;
        metrics.value = {...fallback.metrics.value};
        fit();
        onReady?.(handle);
    }

    async function init(): Promise<void> {
        const canvas = canvasRef.value;
        if (!canvas) return;

        // 检查 WebGPU 可用性
        if (!('gpu' in navigator)) {
            webgpuAvailable.value = false;
            await activateFallback();
            return;
        }

        // 先探测 adapter：避免在“有 navigator.gpu 但没有可用适配器”的机器上
        // 先创建 webgpu context，导致同一 canvas 无法再创建 WebGL2 context。
        let adapter: GPUAdapter | null = null;

        try {
            adapter = await navigator.gpu.requestAdapter();
        } catch {
            adapter = null;
        }

        if (!adapter) {
            webgpuAvailable.value = false;
            await activateFallback();
            return;
        }

        webgpuAvailable.value = true;

        try {
            const r = await Renderer.create(canvas, { sampleCount: 4 }, { onFrame, picking: true, ssao: true });
            renderer.value = r;
            r.setSsaoEnabled(store.showSsao);

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

            // 单位 quad：球/柱 impostor 共用的绘制几何（P2）
            quadGeometry = new QuadGeometry();
            quadGeometry.upload(r.rm);

            // 拾取几何：低多边形单位网格（只在点击时用，形状与 impostor 一致）
            spherePickGeometry = new SphereGeometry(1, 16, 12);
            spherePickGeometry.upload(r.rm);

            cylinderPickGeometry = new CylinderGeometry(1, 1, BOND_RADIAL_SEGMENTS);
            cylinderPickGeometry.upload(r.rm);

            // 结构 → 实例数据
            rebuildInstances();

            // 拾取链路：点击 → requestPick（CSS 像素）→ 至少延迟一帧后在 onPick 回调拿到 objectId
            r.onPick((info) => {
                const atomId = info.id - 1;      // objectId = 原子 id + 1；0 表示点到背景（或点到了键）
                const total = store.structure?.meta.atomCount ?? 0;

                if (info.id === 0 || atomId < 0 || atomId >= total) {
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
            backend.value = 'webgpu';
            store.setEngineBackend('webgpu');

            // 首帧前把相机套住分子：默认轨道半径 12 与分子尺度（几埃）无关，
            // 不 fit 的话分子会缩在视口中间一小块里。
            fit();

            onReady?.(handle);
        } catch (err) {
            console.warn('[MolVista] WebGPU unavailable, using WebGL2 fallback:', err);
            webgpuAvailable.value = false;
            await activateFallback();
        }
    }

    /** 适应视图：从 MDR 的坐标 + 当前表示球半径算包围盒 */
    function fit(): void {
        if (fallback.active.value) {
            fallback.fit();
            return;
        }

        const cam = camera.value;
        const data = store.structure;

        if (!cam || !data || data.meta.atomCount === 0) return;

        const mode = SUPPORTED_MODES.includes(store.displayMode) ? store.displayMode : 'ballStick';
        const ballFactor = BALL_RADIUS_FACTOR[mode] * (store.ballRadiusScale / 100);

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

        const positions = data.atoms.positions;
        const elements = data.atoms.element;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const r = Math.max(getElementRadius(elementByZ(elements[i] ?? 0).symbol) * ballFactor, 0.1);
            const x = positions[i * 3]!;
            const y = positions[i * 3 + 1]!;
            const z = positions[i * 3 + 2]!;

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

    /** 当前相机位姿（展示页章节编排用） */
    function cameraPose(): CameraPose | null {
        if (fallback.active.value) return fallback.cameraPose() as CameraPose | null;

        const cam = camera.value;
        if (!cam) return null;

        return {
            position: [...cam.position] as [number, number, number],
            target: [...cam.target] as [number, number, number],
        };
    }

    /** 立即设置相机位姿（不打断用户拖拽时也可用） */
    function setCameraPose(pose: CameraPose): void {
        if (fallback.active.value) {
            fallback.setCameraPose(pose.position, pose.target);
            return;
        }

        camera.value?.setView(pose.position, pose.target);
    }

    /** 世界坐标 → 画布 CSS 像素（标签/标注用） */
    function projectPoint(position: readonly [number, number, number]): {x: number; y: number} | null {
        if (fallback.active.value) return fallback.projectPoint(position);

        const cam = camera.value;
        const canvas = canvasRef.value;

        if (!cam || !canvas || canvas.clientWidth === 0 || canvas.clientHeight === 0) return null;

        const screen = cam.worldToScreen(position, {
            width: canvas.clientWidth,
            height: canvas.clientHeight,
        });

        return screen ? {x: screen[0], y: screen[1]} : null;
    }

    /**
     * 补间到目标位姿。
     *
     * 采用 position/target 线性插值 + easeInOutCubic；展示页章节切换与"聚焦配体"共用。
     * 新的补间会取消上一个，避免快速翻页时多个 rAF 抢相机。
     */
    function animateCameraPose(pose: CameraPose, durationMs = 600): Promise<void> {
        if (fallback.active.value) return fallback.animateCameraPose(pose.position, pose.target, durationMs);

        const cam = camera.value;
        if (!cam) return Promise.resolve();

        if (cameraAnimRaf !== null) {
            cancelAnimationFrame(cameraAnimRaf);
            cameraAnimRaf = null;
        }

        const from = cameraPose();
        if (!from || durationMs <= 0) {
            cam.setView(pose.position, pose.target);

            return Promise.resolve();
        }

        const startedAt = performance.now();
        const ease = (t: number): number => t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        return new Promise<void>((resolve) => {
            const tick = (): void => {
                const t = Math.min(1, (performance.now() - startedAt) / durationMs);
                const k = ease(t);

                cam.setView(
                    [
                        from.position[0] + (pose.position[0] - from.position[0]) * k,
                        from.position[1] + (pose.position[1] - from.position[1]) * k,
                        from.position[2] + (pose.position[2] - from.position[2]) * k,
                    ],
                    [
                        from.target[0] + (pose.target[0] - from.target[0]) * k,
                        from.target[1] + (pose.target[1] - from.target[1]) * k,
                        from.target[2] + (pose.target[2] - from.target[2]) * k,
                    ]
                );

                if (t < 1) {
                    cameraAnimRaf = requestAnimationFrame(tick);
                } else {
                    cameraAnimRaf = null;
                    resolve();
                }
            };

            cameraAnimRaf = requestAnimationFrame(tick);
        });
    }

    function toggleGrid(): void {
        gridVisible = !gridVisible;
        // TODO: 引擎接入 grid pass 后切换可见性
    }

    /** 氢原子显隐：隐藏的氢缩放为 0 且 id = 0（不可拾取），重写实例数据 */
    function applyHydrogenVisibility(): void {
        if (!ready.value) return;
        rebuildInstances();
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
        const cssX = e.clientX - rect.left;
        const cssY = e.clientY - rect.top;

        // 测距模式：先 CPU 拾取两个原子，不触发 GPU 选择链路
        if (store.measureMode) {
            const hit = pickAtomCpu(cssX, cssY);

            if (hit !== null) {
                store.measureAtom(hit);
                store.selectAtom(hit);
                highlightAtom(hit);
            }

            return;
        }

        // 卡通模式：原子批次只含配体，蛋白原子需要 CPU 射线拾取
        if (store.displayMode === 'cartoon') {
            pickCartoonAtom(cssX, cssY);
            return;
        }

        r.requestPick(cssX, cssY);
    }

    /**
     * CPU 射线拾取（MDR 全部原子）：测距与卡通模式共用。
     * 只用于点击（150k 原子约 2–3 ms），不参与每帧。
     */
    function pickAtomCpu(cssX: number, cssY: number): number | null {
        const cam = camera.value;
        const data = store.structure;
        const rendererRef = renderer.value;

        if (!cam || !data || !rendererRef) return null;

        const scaleX = rendererRef.gpu.width / Math.max(1, rendererRef.gpu.options.canvas.clientWidth);
        const scaleY = rendererRef.gpu.height / Math.max(1, rendererRef.gpu.options.canvas.clientHeight);
        const ray = cam.screenToRay(
            cssX * scaleX,
            cssY * scaleY,
            {width: rendererRef.gpu.width, height: rendererRef.gpu.height}
        );

        const [ox, oy, oz] = ray.origin;
        const [dx, dy, dz] = ray.direction;
        const positions = data.atoms.positions;
        const elements = data.atoms.element;
        const flags = data.atoms.flags;

        // 过滤后的原子不应被"隔空"选中
        let hasBackbone = false;

        if (flags && !store.showSidechains) {
            for (let i = 0; i < data.meta.atomCount; i++) {
                if ((flags[i]! & 16) !== 0) {
                    hasBackbone = true;
                    break;
                }
            }
        }

        let best = Infinity;
        let hit: number | null = null;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const z = elements[i] ?? 0;
            const flag = flags?.[i] ?? 0;

            if (z === 1 && !store.showHydrogens) continue;
            if ((flag & 2) !== 0 && !store.showWaters) continue;
            if ((flag & 1) !== 0 && (flag & 2) === 0 && !store.showLigands) continue;
            if (hasBackbone && (flag & 1) === 0 && (flag & 16) === 0) continue;

            const r = Math.max(getElementRadius(elementByZ(z).symbol) * 0.65, 0.35);
            const px = ox - positions[i * 3]!;
            const py = oy - positions[i * 3 + 1]!;
            const pz = oz - positions[i * 3 + 2]!;

            const b = px * dx + py * dy + pz * dz;
            const c = px * px + py * py + pz * pz - r * r;
            const h = b * b - c;

            if (h < 0) continue;

            const t = -b - Math.sqrt(h);

            if (t > 0 && t < best) {
                best = t;
                hit = i;
            }
        }

        return hit;
    }

    /** 卡通拾取：CPU 命中后写入选择与高亮 */
    function pickCartoonAtom(cssX: number, cssY: number): void {
        const hit = pickAtomCpu(cssX, cssY);

        store.selectAtom(hit);
        highlightAtom(hit);
    }

    /** 选中高亮：只改该实例的颜色（一次 16 B writeBuffer），不重建批次 */
    function highlightAtom(atomId: number | null): void {
        if (highlightedAtomId !== null && highlightedOriginalColor)
            atomBatch.value?.setInstanceColor(highlightedAtomId, highlightedOriginalColor);

        highlightedAtomId = null;
        highlightedOriginalColor = null;

        if (atomId === null) return;

        const data = store.structure;
        if (!data || atomId < 0 || atomId >= data.meta.atomCount) return;

        const z = data.atoms.element[atomId] ?? 0;
        const symbol = elementByZ(z).symbol;
        const chain = data.chains?.id[data.atoms.chainIndex?.[atomId] ?? -1] ?? '';

        highlightedOriginalColor = colorOfAtom(symbol, chain, store.colorScheme);
        highlightedAtomId = atomId;

        atomBatch.value?.setInstanceColor(atomId, SELECTION_COLOR);
    }

    // 启动初始化
    init();

    // 启动时加载演示分子（若无结构）
    if (!store.structure) {
        store.loadDemo();
    }

    // 结构变化 → 立刻重建并重新取景
    watch(
        () => store.structure,
        () => {
            if (!ready.value) return;

            rebuildInstances();
            fit();
        }
    );

    // 表示变化 → 防抖重写实例数据（显示模式 / 着色方案 / 半径滑块）
    watch(
        () => [
            store.displayMode,
            store.colorScheme,
            store.ballRadiusScale,
            store.bondRadiusScale,
            store.selection,
            store.showWaters,
            store.showLigands,
            store.showSidechains,
        ],
        () => scheduleRebuild()
    );

    // 焦点变化 → 重建颜色（去饱和/压暗）
    watch(
        () => store.focus,
        () => scheduleRebuild()
    );

    // 氢原子显隐 → 重写实例数据（隐藏的氢缩放 0、id 0）
    watch(
        () => store.showHydrogens,
        () => applyHydrogenVisibility()
    );

    // SSAO 开关 → 跳过/恢复 SSAO pass（composite 同步直出）
    watch(
        () => store.showSsao,
        (enabled) => renderer.value?.setSsaoEnabled(enabled),
        {immediate: true}
    );

    // ---- P4：MD 传输控制 ----
    watch(
        () => store.simStatus,
        (status) => {
            if (status === 'running') {
                startMdLoop();
            } else {
                stopMdLoop();

                // reset() 把状态置回 idle：回到初始几何
                if (status === 'idle') {
                    md?.reset();

                    store.energy.potential = 0;
                    store.energy.kinetic = 0;
                    store.energy.total = 0;
                    store.energy.temperature = store.simParams.temperature;
                }
            }
        }
    );

    // 时间线 seek：reset 后快进到目标步数（GPU compute 内循环，不逐帧）
    let seekingMd = false;

    watch(
        () => store.seekToken,
        () => {
            if (!md) {
                pendingSeek = store.seekTarget;
                return;
            }

            seekingMd = true;
            stopMdLoop();
            md.reset();

            if (store.seekTarget > 0) md.step(store.seekTarget);

            store.simStep = md.steps;
            seekingMd = false;

            if (store.simStatus === 'running') startMdLoop();
        }
    );

    // 单步按钮：非运行状态下推进 1 步
    watch(
        () => store.simStep,
        (step, previous) => {
            if (!seekingMd && step > previous && store.simStatus !== 'running') md?.step(1);
        }
    );

    // 参数变化 → 同步到 GPU uniform（timestep 单位 fs → ps）
    watch(
        () => [store.simParams.timestep, store.simParams.damping],
        () => {
            md?.setParams({
                dt: store.simParams.timestep * 0.001,
                damping: store.simParams.damping,
            });
        }
    );

    watch(
        fallback.metrics,
        next => {
            if (fallback.active.value) metrics.value = {...next};
        },
        {deep: true}
    );

    const handle: EngineHandle = {
        ready,
        webgpuAvailable,
        webgl2Available,
        backend,
        metrics,
        fit,
        toggleGrid,
        cameraPose,
        setCameraPose,
        animateCameraPose,
        projectPoint,
        toggleHydrogens,
    };

    onBeforeUnmount(() => {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (rebuildTimer !== null) clearTimeout(rebuildTimer);
        if (cameraAnimRaf !== null) {
            cancelAnimationFrame(cameraAnimRaf);
            cameraAnimRaf = null;
        }

        stopMdLoop();
        md?.dispose();
        md = null;

        canvasRef.value?.removeEventListener('pointerdown', onPointerDown);
        canvasRef.value?.removeEventListener('click', onClick);

        // 批次由 scene.dispose 释放（实例缓冲）；单位几何由本 composable 释放
        clearRibbon();
        camera.value?.dispose();
        scene.value?.dispose();
        quadGeometry?.dispose();
        spherePickGeometry?.dispose();
        cylinderPickGeometry?.dispose();
        renderer.value?.dispose();
    });

    return handle;
}





















