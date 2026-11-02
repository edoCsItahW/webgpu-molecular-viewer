// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file molecule.store.ts
 * @author edocsitahw
 * @version 2.0
 * @date 2026/10/29
 * @desc 分子数据与 UI 状态仓库。
 *
 *       R2：不再持有 `AtomData[]`，只持有 MDR（StructureData）与 `StructureView`。
 *       全量对象只在"当前选中项"上按需构造；引擎与结构树直接读 SoA 列。
 *       GPU 对象（Renderer / Mesh / Pipeline）绝不进 Pinia，由 useEngine 持有。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import { StructureView, elementByZ, type StructureData } from '@wmv/structure';
import { createDemoMolecule } from '@/data/demo-molecule';
import { buildStructureData } from '@/utils/structure-build';
import { parseMoleculeFile, parseMoleculeText } from '@/utils/molecule-parser';
import { angleDegrees, dihedralDegrees } from "@/utils/measure";

/** 显示模式 */
export type DisplayMode = 'ballStick' | 'spaceFill' | 'wireframe' | 'cartoon';

/** 着色方案 */
export type ColorScheme = 'element' | 'chain' | 'charge' | 'secondary';

/** 模拟状态 */
export type SimStatus = 'idle' | 'paused' | 'running';

/** 当前渲染后端；WebGL2 兼容模式不支持 GPU MD/SSAO */
export type EngineBackend = 'webgpu' | 'webgl2' | 'none';

/** 模拟参数 */
export interface SimParams {
    integrator: string;
    temperature: number;
    timestep: number;
    damping: number;
    cutoff: number;
}

/** 能量读数 */
export interface EnergyReadout {
    potential: number;
    kinetic: number;
    total: number;
    temperature: number;
}

/** 口袋焦点：按残基下标 + 上下文半径压暗背景（避免同名的多个配体被一起聚焦） */
export interface FocusSpec {
    residueIndexes: number[];
    /** 以焦点包围球为基准的上下文半径（Å） */
    radius: number;
}

/** 视口标注（接触残基） */
export interface FocusLabel {
    residueIndex: number;
    text: string;
    position: [number, number, number];
}

/** 选择目标 */
export type Selection =
    | {kind: 'atom'; index: number}
    | {kind: 'residue'; index: number}
    | {kind: 'chain'; index: number};

/** 测量类型：距离（2 点）/ 角度（3 点，第二点为顶点） */
export type MeasureKind = "distance" | "angle" | "dihedral";

/** 测量已点选的原子下标 */
export interface Measurement {
    points: number[];
}

export const useMoleculeStore = defineStore('molecule', () => {
    // ---- 结构数据（唯一事实源） ----
    const structure = shallowRef<StructureData | null>(null);
    const view = computed(() => (structure.value ? new StructureView(structure.value) : null));

    // ---- 渲染后端 ----
    const engineBackend = ref<EngineBackend>('none');

    // ---- 选中 ----
    const selectedAtomId = ref<number | null>(null);

    /** 选择目标：原子 / 残基 / 链（高亮由引擎在重建时统一下发） */
    const selection = ref<Selection | null>(null);

    // ---- 测量 ----
    const measureMode = ref(false);
    const measureKind = ref<MeasureKind>("distance");
    const measurement = ref<Measurement | null>(null);

    /** 两个测量原子的距离（Å） */
    const measureDistance = computed<number | null>(() => {
        const m = measurement.value;
        const data = structure.value;

        if (measureKind.value !== "distance" || !m || m.points.length !== 2 || !data) return null;

        const p = data.atoms.positions;
        const [a, b] = m.points as [number, number];

        return Math.hypot(
            p[b * 3]! - p[a * 3]!,
            p[b * 3 + 1]! - p[a * 3 + 1]!,
            p[b * 3 + 2]! - p[a * 3 + 2]!
        );
    });

    /** 三个测量原子的夹角（度，第二点为顶点） */
    const measureAngle = computed<number | null>(() => {
        const m = measurement.value;
        const data = structure.value;

        if (measureKind.value !== "angle" || !m || m.points.length !== 3 || !data) return null;

        const p = data.atoms.positions;
        const [a, b, c] = m.points as [number, number, number];

        return angleDegrees(
            [p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!],
            [p[b * 3]!, p[b * 3 + 1]!, p[b * 3 + 2]!],
            [p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!]
        );
    });

    /** 四个测量原子的二面角（度，绕第二-第三原子轴） */
    const measureDihedral = computed<number | null>(() => {
        const m = measurement.value;
        const data = structure.value;

        if (measureKind.value !== 'dihedral' || !m || m.points.length !== 4 || !data) return null;

        const p = data.atoms.positions;
        const [a, b, c, d] = m.points as [number, number, number, number];

        return dihedralDegrees(
            [p[a * 3]!, p[a * 3 + 1]!, p[a * 3 + 2]!],
            [p[b * 3]!, p[b * 3 + 1]!, p[b * 3 + 2]!],
            [p[c * 3]!, p[c * 3 + 1]!, p[c * 3 + 2]!],
            [p[d * 3]!, p[d * 3 + 1]!, p[d * 3 + 2]!]
        );
    });

    // ---- 口袋焦点 ----
    const focus = ref<FocusSpec | null>(null);

    /** 焦点残基下标（蛋白+配体时自动设置） */
    const focusResidues = computed<number[]>(() => {
        const spec = focus.value;
        const residues = structure.value?.residues;

        if (!spec || !residues) return [];

        return spec.residueIndexes.filter(r => r >= 0 && r < residues.name.length);
    });

    /**
     * 接触残基标注：取焦点包围球外 4.5 Å 内最近的 3 个残基。
     * 只在结构/焦点变化时计算一次（O(N)）。
     */
    const focusLabels = computed<FocusLabel[]>(() => {
        const spec = focus.value;
        const data = structure.value;
        const residues = data?.residues;

        if (!spec || !data || !residues || focusResidues.value.length === 0) return [];

        const focusSet = new Set(focusResidues.value);
        const positions = data.atoms.positions;
        const residueIndex = data.atoms.residueIndex;

        let cx = 0, cy = 0, cz = 0, count = 0;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const r = residueIndex?.[i];

            if (r === undefined || !focusSet.has(r)) continue;

            cx += positions[i * 3]!;
            cy += positions[i * 3 + 1]!;
            cz += positions[i * 3 + 2]!;
            count++;
        }

        if (count === 0) return [];

        cx /= count;
        cy /= count;
        cz /= count;

        let hull = 0;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const r = residueIndex?.[i];

            if (r === undefined || !focusSet.has(r)) continue;

            hull = Math.max(hull, Math.hypot(
                positions[i * 3]! - cx,
                positions[i * 3 + 1]! - cy,
                positions[i * 3 + 2]! - cz
            ));
        }

        const nearest = new Map<number, {distance: number; atom: number}>();

        for (let i = 0; i < data.meta.atomCount; i++) {
            const r = residueIndex?.[i];

            if (r === undefined || focusSet.has(r)) continue;

            const residueName = residues.name[r] ?? "";

            if (residueName === "HOH" || residueName === "WAT" || residueName === "H2O"
                || residueName === "DOD" || residueName === "SOL") continue;

            const d = Math.hypot(
                positions[i * 3]! - cx,
                positions[i * 3 + 1]! - cy,
                positions[i * 3 + 2]! - cz
            ) - hull;

            if (d > 4.5 || d < -1) continue;

            const current = nearest.get(r);

            if (!current || d < current.distance) nearest.set(r, {distance: d, atom: i});
        }

        return [...nearest.entries()]
            .sort((a, b) => a[1].distance - b[1].distance)
            .slice(0, 3)
            .map(([r, info]) => ({
                residueIndex: r,
                text: `${residues.name[r]}${residues.seqNumber[r] ?? ""}`,
                position: [
                    positions[info.atom * 3]!,
                    positions[info.atom * 3 + 1]!,
                    positions[info.atom * 3 + 2]!,
                ] as [number, number, number],
            }));
    });

    // ---- 渲染设置 ----
    const displayMode = ref<DisplayMode>('ballStick');
    const colorScheme = ref<ColorScheme>('element');
    const showSsao = ref(true);
    const showOutline = ref(true);
    const showGrid = ref(false);
    const showHydrogens = ref(true);
    const showWaters = ref(true);
    const showLigands = ref(true);
    const showSidechains = ref(true);
    const showLabels = ref(true);
    const ballRadiusScale = ref(100);
    const bondRadiusScale = ref(100);

    // ---- 模拟 ----
    const simStatus = ref<SimStatus>('idle');
    const simStep = ref(0);
    /** 时间线：每帧步数 / 可视窗口 / 循环 / seek 请求 */
    const simSpeed = ref(2);
    const simHorizon = ref(2000);
    const simLoop = ref(false);
    const seekTarget = ref(0);
    const seekToken = ref(0);
    const simParams = ref<SimParams>({
        integrator: 'Velocity-Verlet',
        temperature: 300,
        timestep: 2.0,
        damping: 0.0,
        cutoff: 10.0,
    });
    const energy = ref<EnergyReadout>({
        potential: 0,
        kinetic: 0,
        total: 0,
        temperature: 300,
    });

    // ---- 解析状态 ----
    const parsing = ref(false);
    const parseError = ref<string | null>(null);

    // ---- 派生 ----
    const name = computed(() => structure.value?.meta.name ?? '');

    /** 当前选中原子的按需视图；未选中为 null */
    const selectedAtom = computed(() => {
        const id = selectedAtomId.value;

        if (id === null || !view.value || id < 0 || id >= view.value.atomCount) return null;

        return view.value.atom(id);
    });

    const atomCount = computed(() => structure.value?.meta.atomCount ?? 0);
    const bondCount = computed(() => view.value?.bondCount ?? 0);
    const residueCount = computed(() => view.value?.residueCount ?? 0);
    const chainCount = computed(() => view.value?.chainCount ?? 0);

    /** 质量（u），按元素表求和 */
    const mass = computed(() => {
        const data = structure.value;
        if (!data) return 0;

        let total = 0;

        for (let i = 0; i < data.meta.atomCount; i++)
            total += elementByZ(data.atoms.element[i] ?? 0).mass;

        return total;
    });

    // ---- Actions ----
    /** 设置口袋焦点；传 null 清除 */
    function setFocus(spec: FocusSpec | null): void {
        focus.value = spec;
    }

    /** 记录当前渲染后端；WebGL2 兼容模式据此禁用 GPU 计算功能 */
    function setEngineBackend(backend: EngineBackend): void {
        engineBackend.value = backend;
    }

    /** 写入结构（唯一入口） */
    function setStructure(data: StructureData | null): void {
        structure.value = data;
        selectedAtomId.value = null;
        selection.value = null;
        measurement.value = null;
        parseError.value = null;

        // 蛋白默认卡通（先看到"形状"而不是球云）；小分子仍球棍。
        const protein = !!data && !!data.ss && (data.residues?.name.length ?? 0) > 20;

        displayMode.value = protein ? 'cartoon' : 'ballStick';

        // 蛋白+配体：把"最大的 HETATM 非水残基"设为默认焦点（口袋叙事）；
        // 不能按残基名聚焦——同名的 4 个 HEM 会把四个口袋一起算进包围球。
        const residueCounts = new Map<number, number>();
        const residues = data?.residues;
        const flags = data?.atoms.flags;
        const residueIndex = data?.atoms.residueIndex;

        if (protein && residues && flags && residueIndex) {
            for (let i = 0; i < data.meta.atomCount; i++) {
                const flag = flags[i]!;

                if ((flag & 1) === 0 || (flag & 2) !== 0) continue;

                const r = residueIndex[i] ?? -1;

                if (r >= 0) residueCounts.set(r, (residueCounts.get(r) ?? 0) + 1);
            }
        }

        let bestResidue = -1;
        let bestCount = 0;

        for (const [r, count] of residueCounts) {
            if (count > bestCount) {
                bestCount = count;
                bestResidue = r;
            }
        }

        focus.value = bestResidue >= 0
            ? {residueIndexes: [bestResidue], radius: 6}
            : null;
    }

    /** 加载演示分子 */
    function loadDemo(): void {
        const demo = createDemoMolecule();

        setStructure(buildStructureData(
            demo.name,
            demo.atoms.map((atom) => ({
                symbol: atom.symbol,
                position: atom.position,
                residue: atom.residue,
                chain: atom.chain,
            })),
            demo.bonds,
            'unknown'
        ));
    }

    /** 清空结构 */
    function clear(): void {
        setStructure(null);
    }

    async function loadFromFile(file: File): Promise<void> {
        parsing.value = true;
        parseError.value = null;

        try {
            const result = await parseMoleculeFile(file);

            setStructure(result.structure);
        } catch (e) {
            parseError.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            parsing.value = false;
        }
    }

    async function loadFromText(text: string, filename: string): Promise<void> {
        parsing.value = true;
        parseError.value = null;

        try {
            const result = await parseMoleculeText(text, filename);

            setStructure(result.structure);
        } catch (e) {
            parseError.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            parsing.value = false;
        }
    }

    function selectAtom(id: number | null) {
        selectedAtomId.value = id;
        selection.value = id === null ? null : {kind: 'atom', index: id};
    }

    function selectResidue(index: number | null) {
        selectedAtomId.value = null;
        selection.value = index === null ? null : {kind: 'residue', index};
    }

    function selectChain(index: number | null) {
        selectedAtomId.value = null;
        selection.value = index === null ? null : {kind: 'chain', index};
    }

    /** 进入/退出测距；退出时清空测量 */
    function setMeasureMode(on: boolean): void {
        measureMode.value = on;

        if (!on) measurement.value = null;
    }

    /** 切换距离/角度；切换时清空已选点 */
    function setMeasureKind(kind: MeasureKind): void {
        if (measureKind.value === kind) return;

        measureKind.value = kind;
        measurement.value = null;
    }

    /** 点选测量原子：距离收 2 个、角度收 3 个（第 2 个为顶点）；满了重新开始 */
    function measureAtom(index: number): void {
        const target = measureKind.value === 'dihedral' ? 4 : measureKind.value === 'angle' ? 3 : 2;
        const points = measurement.value?.points ?? [];

        if (points.length >= target) {
            measurement.value = {points: [index]};
            return;
        }

        if (points[points.length - 1] === index) return;

        measurement.value = {points: [...points, index]};
    }

    function clearMeasurement(): void {
        measurement.value = null;
    }

    function setDisplayMode(m: DisplayMode) {
        displayMode.value = m;
    }

    function setColorScheme(c: ColorScheme) {
        colorScheme.value = c;
    }

    function toggleGrid() {
        showGrid.value = !showGrid.value;
    }

    function toggleHydrogens() {
        showHydrogens.value = !showHydrogens.value;
    }

    function setBallRadius(v: number) {
        ballRadiusScale.value = v;
    }

    function setBondRadius(v: number) {
        bondRadiusScale.value = v;
    }

    // ---- 模拟控制 ----
    /** 卡通模式下原子批次只含配体，MD 需要完整原子，进入模拟前自动切回球棍 */
    function ensureSimulationView(): void {
        if (displayMode.value === 'cartoon') displayMode.value = 'ballStick';
    }

    function play() {
        ensureSimulationView();
        simStatus.value = 'running';
    }

    function pause() {
        simStatus.value = 'paused';
    }

    /** 请求引擎 seek 到指定步数（会 reset 后快进；UI 进度条用） */
    function requestSeek(step: number): void {
        seekTarget.value = Math.max(0, Math.min(simHorizon.value, Math.round(step)));
        seekToken.value += 1;
        simStatus.value = 'paused';
    }

    function reset() {
        simStatus.value = 'idle';
        simStep.value = 0;
        seekTarget.value = 0;
        seekToken.value += 1;
    }

    function step() {
        ensureSimulationView();
        simStep.value += 1;
    }

    return {
        // state
        structure, view, selectedAtomId, selection,
        engineBackend,
        measureMode, measureKind, measurement, measureDistance, measureAngle, measureDihedral,
        focus, focusResidues, focusLabels,
        displayMode, colorScheme,
        showSsao, showOutline, showGrid, showHydrogens,
        showWaters, showLigands, showSidechains, showLabels,
        ballRadiusScale, bondRadiusScale,
        simStatus, simStep, simSpeed, simHorizon, simLoop, seekTarget, seekToken, simParams, energy,
        parsing, parseError,
        // getters
        name, selectedAtom, atomCount, bondCount, residueCount, chainCount, mass,
        // actions
        setStructure, setFocus, loadDemo, clear, selectAtom, selectResidue, selectChain,
        setEngineBackend,
        setMeasureMode, setMeasureKind, measureAtom, clearMeasurement,
        loadFromFile, loadFromText,
        setDisplayMode, setColorScheme, toggleGrid, toggleHydrogens,
        setBallRadius, setBondRadius,
        play, pause, reset, step, requestSeek,
    };
});








