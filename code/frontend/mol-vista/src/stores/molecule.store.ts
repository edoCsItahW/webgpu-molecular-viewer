// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file molecule.store.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 18:35
 * @desc 分子数据与 UI 状态仓库。
 *       只保存"数据模型 + UI 偏好"（原子坐标、显示模式、模拟参数等），
 *       GPU 对象（Renderer / Mesh / Pipeline）绝不进 Pinia，由 useEngine 持有。
 *       引擎渲染前从该 store 读取结构；inspector / structure panel 读写该 store。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { createDemoMolecule, type DemoAtom } from '@/data/demo-molecule';
import { parseMoleculeFile, parseMoleculeText, type ParseResult } from '@/utils/molecule-parser';

/** 显示模式 */
export type DisplayMode = 'ballStick' | 'spaceFill' | 'wireframe' | 'cartoon';

/** 着色方案 */
export type ColorScheme = 'element' | 'chain' | 'charge' | 'secondary';

/** 模拟状态 */
export type SimStatus = 'idle' | 'paused' | 'running';

/** 单个原子的可序列化数据 */
export interface AtomData {
    id: number;
    symbol: string;
    position: [number, number, number];
    color: [number, number, number];
    radius: number;
    residue?: string;
    chain?: string;
    bfactor?: number;
    occupancy?: number;
    charge?: number;
}

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

export const useMoleculeStore = defineStore('molecule', () => {
    // ---- 结构数据 ----
    const name = ref<string>('');
    const atoms = ref<AtomData[]>([]);
    const bonds = ref<Array<[number, number]>>([]);

    // ---- 选中 ----
    const selectedAtomId = ref<number | null>(null);

    // ---- 渲染设置 ----
    const displayMode = ref<DisplayMode>('ballStick');
    const colorScheme = ref<ColorScheme>('element');
    const showSsao = ref(true);
    const showOutline = ref(true);
    const showGrid = ref(false);
    const showHydrogens = ref(true);
    const ballRadiusScale = ref(100); // 百分比，100 = 1×
    const bondRadiusScale = ref(100);

    // ---- 模拟 ----
    const simStatus = ref<SimStatus>('idle');
    const simStep = ref(0);
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
    const selectedAtom = computed<AtomData | null>(() => {
        if (selectedAtomId.value === null) return null;
        return atoms.value.find((a) => a.id === selectedAtomId.value) ?? null;
    });

    const atomCount = computed(() => atoms.value.length);
    const bondCount = computed(() => bonds.value.length);
    const residueCount = computed(() => new Set(atoms.value.map((a) => a.residue).filter(Boolean)).size);
    const chainCount = computed(() => new Set(atoms.value.map((a) => a.chain).filter(Boolean)).size);

    /** 质量（u），仅按元素粗略求和 */
    const mass = computed(() => {
        const masses: Record<string, number> = { C: 12.01, O: 16.00, N: 14.01, S: 32.07, H: 1.008, P: 30.97 };
        return atoms.value.reduce((sum, a) => sum + (masses[a.symbol] ?? 1.0), 0);
    });

    // ---- Actions ----
    /** 加载演示分子 */
    function loadDemo() {
        const demo = createDemoMolecule();
        name.value = demo.name;
        atoms.value = demo.atoms.map((a: DemoAtom, i: number) => ({
            id: i,
            symbol: a.symbol,
            position: a.position,
            color: a.color,
            radius: a.radius,
            residue: a.residue,
            chain: a.chain,
        }));
        bonds.value = demo.bonds;
        selectedAtomId.value = null;
    }

    /** 清空结构 */
    function clear() {
        name.value = '';
        atoms.value = [];
        bonds.value = [];
        selectedAtomId.value = null;
        parseError.value = null;
    }

    /** 内部：将解析结果写入 store */
    function applyParseResult(result: ParseResult) {
        name.value = result.name;
        atoms.value = result.atoms;
        bonds.value = result.bonds;
        selectedAtomId.value = null;
        parseError.value = null;
    }

    /** 从 File 对象加载分子（异步，RDKit 解析） */
    async function loadFromFile(file: File): Promise<void> {
        parsing.value = true;
        parseError.value = null;
        try {
            const result = await parseMoleculeFile(file);
            applyParseResult(result);
        } catch (e) {
            parseError.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            parsing.value = false;
        }
    }

    /** 从文本内容加载分子（异步，RDKit 解析） */
    async function loadFromText(text: string, filename: string): Promise<void> {
        parsing.value = true;
        parseError.value = null;
        try {
            const result = await parseMoleculeText(text, filename);
            applyParseResult(result);
        } catch (e) {
            parseError.value = e instanceof Error ? e.message : String(e);
            throw e;
        } finally {
            parsing.value = false;
        }
    }

    function selectAtom(id: number | null) {
        selectedAtomId.value = id;
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
    function play() {
        simStatus.value = 'running';
    }
    function pause() {
        simStatus.value = 'paused';
    }
    function reset() {
        simStatus.value = 'idle';
        simStep.value = 0;
    }
    function step() {
        simStep.value += 1;
    }

    return {
        // state
        name, atoms, bonds, selectedAtomId,
        displayMode, colorScheme,
        showSsao, showOutline, showGrid, showHydrogens,
        ballRadiusScale, bondRadiusScale,
        simStatus, simStep, simParams, energy,
        parsing, parseError,
        // getters
        selectedAtom, atomCount, bondCount, residueCount, chainCount, mass,
        // actions
        loadDemo, clear, selectAtom,
        loadFromFile, loadFromText,
        setDisplayMode, setColorScheme, toggleGrid, toggleHydrogens,
        setBallRadius, setBondRadius,
        play, pause, reset, step,
    };
});
