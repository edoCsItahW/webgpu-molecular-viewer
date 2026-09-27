// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 防腐端口：领域对"我需要外界替我做什么"的最小声明。异步 + 可取消 + 可探测 + 单一错误形状。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {StructureData, StructureFormat} from "@wmv/structure";
import type {PortError} from "@wmv/common";

// ---------------------------------------------------------------------------
// 结构来源端口
// ---------------------------------------------------------------------------

/** 结构加载请求：判别联合，描述来源形态而非格式。 */
export type StructureRequest =
    | { kind: "inline-text"; text: string; name?: string; formatHint?: StructureFormat }
    | { kind: "file"; bytes: ArrayBuffer; name: string; formatHint?: StructureFormat }
    | { kind: "url"; url: string; name?: string; formatHint?: StructureFormat }
    | { kind: "sample"; sampleId: string };

/** 示例条目。 */
export interface SampleEntry {
    id: string;
    name: string;
    format: StructureFormat;
    /** 教学标签：'有机小分子' | '蛋白质' | '药物-靶点复合物' | … */
    tags: string[];
    description: string;
}

/** 结构来源能力。 */
export interface SourceCapabilities {
    /** 适配器标识：'ts' | 'wasm' | 'http://host:port' | 'fixture' */
    source: string;
    formats: StructureFormat[];
    /** 超过此规模应提前拒绝。undefined = 不设限 */
    maxAtoms?: number;
    supportsCancel: boolean;
    /** 是否走 MDR 二进制（否则 JSON） */
    supportsBinaryTransfer: boolean;
    samples?: SampleEntry[];
}

/**
 * 结构来源端口。
 * load 返回 MDR，不返回 Molecule —— 领域构造只有一个入口（buildMolecule）。
 */
export interface StructureSourcePort {
    readonly id: string;
    capabilities(): Promise<SourceCapabilities>;
    load(request: StructureRequest, signal?: AbortSignal): Promise<StructureData>;
}

// ---------------------------------------------------------------------------
// 键感知端口
// ---------------------------------------------------------------------------

/** 键感知选项。 */
export interface PerceptionOptions {
    /** 共价半径之和的容差系数，默认 1.2 */
    tolerance?: number;
    /** 每个原子的最大成键数（超过则丢弃最长的候选） */
    maxValence?: number;
    /** 是否保留氢原子的键（默认 false） */
    includeHydrogens?: boolean;
}

/**
 * 键感知端口。
 * 只在 capabilities.hasBonds === false 且用例明确要求时才调用。
 * 结果必须标 inferred: true。
 */
export interface BondPerceptionPort {
    perceive(
        data: StructureData,
        options?: PerceptionOptions,
        signal?: AbortSignal,
    ): Promise<StructureData>;
}

// ---------------------------------------------------------------------------
// 模拟后端端口
// ---------------------------------------------------------------------------

/** 模拟能力。 */
export interface SimulationCapabilities {
    kind: "local-gpu" | "local-cpu" | "remote" | "none";
    /** 能否每帧推进（否则按"运行 N 步"使用） */
    interactive: boolean;
    forces: Array<"lennard-jones" | "harmonic-bond" | "coulomb">;
    integrators: Array<"velocity-verlet">;
    maxAtoms?: number;
    supportsEnergyReadback: boolean;
}

/** 模拟规格。 */
export interface SimulationSpec {
    forceField: { lennardJones: boolean; harmonicBonds: boolean; coulomb: boolean; cutoff: number };
    integrator: "velocity-verlet";
    timestepFs: number;
    temperatureK: number;
    damping: number;
    seed: number;
    substepsPerFrame: number;
}

/** 模拟输入。 */
export interface SimulationInput {
    data: StructureData;
    spec: SimulationSpec;
    /** 起始位置：默认为 MDR 的位置；也可传入当前显示状态 */
    initialPositions?: Float32Array;
}

/** 单步报告。 */
export interface StepReport {
    steps: number;
    energy: { potential: number; kinetic: number; total: number };
    temperatureK: number;
    /** CPU 侧步进耗时（GPU 为提交耗时） */
    elapsedMs: number;
    /** 需要 timestamp-query，否则 undefined */
    gpuElapsedMs?: number;
}

/** 不透明位置句柄：领域层不认识它，胶水层才知道它背后是什么。 */
export interface PositionHandle {
    readonly kind: "gpu-buffer" | "cpu-array";
    readonly atomCount: number;
}

/** 模拟会话。 */
export interface SimulationSession {
    readonly backend: SimulationCapabilities["kind"];
    /** 推进若干步 */
    step(count: number): Promise<StepReport>;
    /** 位置句柄 */
    positions(): PositionHandle;
    reset(): void;
    dispose(): void;
}

/** 模拟后端端口。 */
export interface SimulationBackendPort {
    capabilities(): SimulationCapabilities;
    prepare(input: SimulationInput, signal?: AbortSignal): Promise<SimulationSession>;
}

// ---------------------------------------------------------------------------
// 几何构建端口
// ---------------------------------------------------------------------------

/** 表面构建选项。 */
export interface SurfaceOptions {
    kind: "sas" | "ses";
    probeRadius: number;
    resolution: number;
    includeHetero: boolean;
}

/** 表面网格。 */
export interface SurfaceMesh {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
    /** 每个顶点来自哪个原子，-1 = 插值生成 */
    atomIndex: Int32Array;
    timingMs: number;
}

/** 几何构建端口。首版允许缺席（capabilities.surface === false）。 */
export interface GeometryBuildPort {
    capabilities(): { surface: boolean; cartoon: boolean };
    buildSurface(data: StructureData, options: SurfaceOptions, signal?: AbortSignal): Promise<SurfaceMesh>;
}

// ---------------------------------------------------------------------------
// 端口集合（组合根注入 Workbench）
// ---------------------------------------------------------------------------

/** 一组端口实现。 */
export interface PortSet {
    sources: StructureSourcePort[];
    perception: BondPerceptionPort;
    geometry: GeometryBuildPort;
    simulation: SimulationBackendPort;
}

export type {PortError};
