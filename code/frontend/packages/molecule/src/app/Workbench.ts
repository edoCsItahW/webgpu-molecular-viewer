// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Workbench.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 应用用例层：命令 + 快照 + 会话状态机 + 能力门控。不认识 Vue，不认识 GPU。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {
    PortSet,
    StructureSourcePort,
    StructureRequest,
    BondPerceptionPort,
    GeometryBuildPort,
    SimulationBackendPort,
    SimulationCapabilities,
    SimulationSession,
} from "../ports";
import type {StructureData, StructureFormat, Capabilities, Problem} from "@wmv/structure";
import {deriveCapabilities} from "@wmv/structure";
import type {Molecule as MoleculeType} from "../model";
import {Molecule} from "../model";
import type {Representation, DisplayMode, ColorSchemeId, HighlightStyle, BuildTier} from "../representation";
import {DEFAULT_REPRESENTATION, buildRepresentation, type RepresentationBuild} from "../representation";
import type {EnergySample} from "../simulation";
import {PortError} from "@wmv/common";

// ---------------------------------------------------------------------------
// 渲染侧接口（领域侧定义，胶水实现）
// ---------------------------------------------------------------------------

export interface RenderCapabilities {
    gpu: boolean;
    picking: boolean;
    gpuTiming: boolean;
    maxInstances: number;
}

export interface RenderSink {
    apply(build: RepresentationBuild, tier: BuildTier): Promise<void>;
    fitBounds(bounds: { min: [number, number, number]; max: [number, number, number]; center: [number, number, number]; radius: number }): void;
    setHighlight(ids: Uint32Array, style: HighlightStyle): void;
    setPositionSource(source: "rest" | "store"): void;
    clear(): Promise<void>;
    capabilities(): RenderCapabilities;
}

// ---------------------------------------------------------------------------
// 依赖与构造
// ---------------------------------------------------------------------------

export interface WorkbenchDeps {
    sources: StructureSourcePort[];
    perception: BondPerceptionPort;
    geometry: GeometryBuildPort;
    simulation: SimulationBackendPort;
    renderer: RenderSink;
    now?: () => number;
}

// ---------------------------------------------------------------------------
// 状态快照
// ---------------------------------------------------------------------------

export type SessionState = "idle" | "loading" | "ready" | "simulating" | "error";

export interface WorkbenchState {
    readonly session: SessionState;
    readonly structure: {
        name: string;
        format: StructureFormat;
        atomCount: number;
        bondCount: number;
        residueCount: number;
        chainCount: number;
        producer: string;
        parseMs?: number;
    } | null;
    readonly representation: Representation;
    readonly selection: { kind: "atom" | "bond" | "residue" | "chain"; ids: number[] } | null;
    readonly hover: number | null;
    readonly capabilities: {
        render: RenderCapabilities;
        sources: Array<{ id: string; available: boolean; formats: StructureFormat[] }>;
        simulation: SimulationCapabilities;
        geometry: { surface: boolean; cartoon: boolean };
        structure: Capabilities | null;
    };
    readonly problems: Problem[];
    readonly progress: { phase: string; value: number } | null;
    readonly energy: EnergySample[];
    readonly positionAuthority: "static" | "animation" | "gpu-sim";
    readonly error: { message: string; detail?: string; retryable: boolean } | null;
}

// ---------------------------------------------------------------------------
// 能力门控
// ---------------------------------------------------------------------------

export interface FeatureGate { enabled: boolean; reasonKey?: string; nextStepKey?: string }

export function gate(state: WorkbenchState): {
    displayMode: Record<DisplayMode, FeatureGate>;
    colorScheme: Record<ColorSchemeId, FeatureGate>;
    simulation: FeatureGate;
    bondPerception: FeatureGate;
    surface: FeatureGate;
} {
    const caps = state.capabilities;
    const struct = caps.structure;
    const hasBonds = struct?.hasBonds ?? false;
    const hasCharges = struct?.hasCharges ?? false;
    const hasBFactors = struct?.hasBFactors ?? false;
    const hasSS = struct?.hasSecondaryStructure ?? false;

    const displayMode: Record<DisplayMode, FeatureGate> = {
        "ball-stick": { enabled: true },
        "space-fill": { enabled: true },
        line: { enabled: hasBonds, reasonKey: hasBonds ? undefined : "no-bonds", nextStepKey: "run-bond-perception" },
        cartoon: { enabled: hasSS, reasonKey: hasSS ? undefined : "no-secondary-structure" },
        surface: { enabled: caps.geometry.surface, reasonKey: caps.geometry.surface ? undefined : "no-geometry-module", nextStepKey: "enable-backend" },
    };
    const colorScheme: Record<ColorSchemeId, FeatureGate> = {
        element: { enabled: true },
        chain: { enabled: struct?.hasChains ?? false },
        residue: { enabled: struct?.hasResidues ?? false },
        charge: { enabled: hasCharges, reasonKey: hasCharges ? undefined : "no-charge-column" },
        bFactor: { enabled: hasBFactors, reasonKey: hasBFactors ? undefined : "no-bfactor-column" },
        ss: { enabled: hasSS, reasonKey: hasSS ? undefined : "no-secondary-structure" },
        custom: { enabled: true },
    };
    const sim = caps.simulation;
    const simulation: FeatureGate = sim.kind === "none" || !caps.render.gpu
        ? { enabled: false, reasonKey: sim.kind === "none" ? "no-simulation-backend" : "no-gpu" }
        : { enabled: true };
    const bondPerception: FeatureGate = { enabled: !hasBonds && state.session === "ready" };
    const surface: FeatureGate = displayMode.surface;

    return { displayMode, colorScheme, simulation, bondPerception, surface };
}

// ---------------------------------------------------------------------------
// Workbench
// ---------------------------------------------------------------------------

export class Workbench {
    readonly #deps: WorkbenchDeps;
    #molecule: MoleculeType | null = null;
    #data: StructureData | null = null;
    #state: WorkbenchState;
    #inflight: AbortController | null = null;
    #loadToken = 0;
    #simSession: SimulationSession | null = null;
    #positionAuthority: "static" | "animation" | "gpu-sim" = "static";
    readonly #now: () => number;

    constructor(deps: WorkbenchDeps) {
        this.#deps = deps;
        this.#now = deps.now ?? (() => performance.now());
        this.#state = {
            session: "idle",
            structure: null,
            representation: DEFAULT_REPRESENTATION,
            selection: null,
            hover: null,
            capabilities: {
                render: deps.renderer.capabilities(),
                sources: [],
                simulation: deps.simulation.capabilities(),
                geometry: deps.geometry.capabilities(),
                structure: null,
            },
            problems: [],
            progress: null,
            energy: [],
            positionAuthority: "static",
            error: null,
        };
        // 异步刷新源能力
        this.#refreshSourceCapabilities();
    }

    get molecule(): MoleculeType | null { return this.#molecule; }
    get state(): WorkbenchState { return this.#state; }

    // -------------------------------------------------------------------
    // 内部：状态更新
    // -------------------------------------------------------------------

    #setState(patch: Partial<WorkbenchState>) {
        this.#state = { ...this.#state, ...patch };
    }

    async #refreshSourceCapabilities() {
        const sources = await Promise.all(
            this.#deps.sources.map(async (s) => {
                try {
                    const c = await s.capabilities();
                    return { id: s.id, available: true, formats: c.formats };
                } catch {
                    return { id: s.id, available: false, formats: [] as StructureFormat[] };
                }
            }),
        );
        this.#setState({ capabilities: { ...this.#state.capabilities, sources } });
    }

    // -------------------------------------------------------------------
    // 加载
    // -------------------------------------------------------------------

    async loadStructure(req: StructureRequest): Promise<void> {
        // simulating 期间先停
        if (this.#state.session === "simulating") {
            await this.stopSimulation({ keepFinalState: true });
        }

        const token = ++this.#loadToken;
        const controller = new AbortController();
        this.#inflight?.abort();
        this.#inflight = controller;

        this.#setState({
            session: "loading",
            error: null,
            progress: { phase: "load", value: 0 },
        });

        try {
            const data = await this.#loadFromCandidates(req, controller.signal);
            if (token !== this.#loadToken) return; // 已被取代

            const t0 = this.#now();
            const mol = Molecule.fromStructureData(data);
            const parseMs = this.#now() - t0;

            const caps = deriveCapabilities(data);
            const build = buildRepresentation(mol, this.#state.representation, data);
            await this.#deps.renderer.apply(build, { tier: "C", reason: "structure" });
            this.#deps.renderer.fitBounds(mol.bounds);

            this.#molecule = mol;
            this.#data = data;
            this.#positionAuthority = "static";

            this.#setState({
                session: "ready",
                structure: {
                    name: data.meta.name,
                    format: data.meta.sourceFormat,
                    atomCount: mol.atomCount,
                    bondCount: mol.bondCount,
                    residueCount: mol.residues.length,
                    chainCount: mol.chains.length,
                    producer: data.meta.producer.name,
                    parseMs,
                },
                capabilities: { ...this.#state.capabilities, structure: caps },
                problems: data.problems ?? [],
                progress: null,
                positionAuthority: "static",
                error: null,
            });
        } catch (e) {
            if (token !== this.#loadToken) return;
            const err = e instanceof PortError ? e : new PortError("unknown", String(e));
            if (err.kind === "cancelled") {
                this.#restoreAfterCancel();
                return;
            }
            this.#setState({
                session: this.#molecule ? "ready" : "error",
                error: { message: err.kind, detail: err.detail, retryable: err.retryable },
                progress: null,
            });
        } finally {
            if (token === this.#loadToken) this.#inflight = null;
        }
    }

    /** 按优先级尝试源；不可用/超时自动回退；只有全部失败才抛。 */
    async #loadFromCandidates(req: StructureRequest, signal: AbortSignal): Promise<StructureData> {
        let lastErr: unknown;
        for (const source of this.#deps.sources) {
            try {
                return await source.load(req, signal);
            } catch (e) {
                lastErr = e;
                // unsupported-format 不重试
                if (e instanceof PortError && e.kind === "unsupported-format") throw e;
                // 其他错误尝试下一个源
                continue;
            }
        }
        throw lastErr ?? new PortError("unknown", "无可用结构源");
    }

    #restoreAfterCancel() {
        if (this.#molecule) {
            this.#setState({ session: "ready", progress: null, error: null });
        } else {
            this.#setState({ session: "idle", progress: null, error: null });
        }
    }

    cancelLoad(): void {
        this.#inflight?.abort();
        this.#inflight = null;
        this.#restoreAfterCancel();
    }

    async clearStructure(): Promise<void> {
        if (this.#state.session === "simulating") {
            await this.stopSimulation({ keepFinalState: false });
        }
        await this.#deps.renderer.clear();
        this.#molecule = null;
        this.#data = null;
        this.#positionAuthority = "static";
        this.#setState({
            session: "idle",
            structure: null,
            selection: null,
            hover: null,
            capabilities: { ...this.#state.capabilities, structure: null },
            problems: [],
            progress: null,
            energy: [],
            positionAuthority: "static",
            error: null,
        });
    }

    // -------------------------------------------------------------------
    // 表示
    // -------------------------------------------------------------------

    async setRepresentation(partial: Partial<Representation>): Promise<void> {
        if (this.#state.session !== "ready" && this.#state.session !== "simulating") return;
        const prev = this.#state.representation;
        const next: Representation = { ...prev, ...partial };
        if (!this.#molecule) return;
        const build = buildRepresentation(this.#molecule, next, this.#data ?? undefined);
        // 这里简化：直接按 C 级应用（差分逻辑由调用方或胶水处理）
        await this.#deps.renderer.apply(build, { tier: "C", reason: "filter" });
        this.#setState({ representation: next });
    }

    async setColorScheme(id: ColorSchemeId): Promise<void> {
        const caps = this.#state.capabilities.structure;
        // 能力门控
        const g = gate(this.#state);
        if (!g.colorScheme[id].enabled) {
            this.#setState({ error: { message: "unsupported-capability", detail: g.colorScheme[id].reasonKey, retryable: false } });
            return;
        }
        await this.setRepresentation({ colorScheme: id });
    }

    // -------------------------------------------------------------------
    // 选择 / 悬停
    // -------------------------------------------------------------------

    select(target: { kind: "atom" | "bond" | "residue" | "chain"; ids: number[] }, options: { additive?: boolean } = {}): void {
        if (this.#state.session !== "ready") return;
        const ids = options.additive && this.#state.selection?.kind === target.kind
            ? [...new Set([...this.#state.selection.ids, ...target.ids])]
            : target.ids;
        this.#setState({ selection: { kind: target.kind, ids } });
    }

    setHover(atomIndex: number | null): void {
        this.#setState({ hover: atomIndex });
    }

    fitView(): void {
        if (this.#molecule) this.#deps.renderer.fitBounds(this.#molecule.bounds);
    }

    // -------------------------------------------------------------------
    // 模拟
    // -------------------------------------------------------------------

    async startSimulation(spec?: Partial<import("../ports").SimulationSpec>): Promise<void> {
        if (this.#state.session !== "ready") {
            this.#setState({ error: { message: "invalid-state", detail: "需要先加载结构", retryable: false } });
            return;
        }
        const simCaps = this.#deps.simulation.capabilities();
        if (simCaps.kind === "none" || !this.#state.capabilities.render.gpu) {
            this.#setState({ error: { message: "unsupported-capability", detail: "无可用于模拟的后端或 GPU", retryable: false } });
            return;
        }
        if (!this.#data) return;

        const fullSpec: import("../ports").SimulationSpec = {
            forceField: { lennardJones: true, harmonicBonds: true, coulomb: true, cutoff: 10 },
            integrator: "velocity-verlet",
            timestepFs: 1,
            temperatureK: 300,
            damping: 1.0,
            seed: 42,
            substepsPerFrame: 4,
            ...spec,
        };

        const session = await this.#deps.simulation.prepare({ data: this.#data, spec: fullSpec });
        this.#simSession = session;
        this.#positionAuthority = "gpu-sim";
        this.#deps.renderer.setPositionSource("store");
        this.#setState({ session: "simulating", positionAuthority: "gpu-sim", error: null });
    }

    async stepSimulation(count: number): Promise<void> {
        if (!this.#simSession || this.#state.session !== "simulating") return;
        const report = await this.#simSession.step(count);
        const sample: EnergySample = {
            step: report.steps,
            timePs: report.steps * 0.001,
            potential: report.energy.potential,
            kinetic: report.energy.kinetic,
            total: report.energy.total,
            temperatureK: report.temperatureK,
        };
        const energy = [...this.#state.energy, sample].slice(-1000);
        this.#setState({ energy });
    }

    async stopSimulation(options: { keepFinalState: boolean }): Promise<void> {
        if (this.#state.session !== "simulating") return;
        this.#simSession?.dispose();
        this.#simSession = null;
        this.#positionAuthority = options.keepFinalState ? "static" : "static";
        this.#deps.renderer.setPositionSource("rest");
        this.#setState({ session: "ready", positionAuthority: "static" });
    }

    // -------------------------------------------------------------------
    // 导出
    // -------------------------------------------------------------------

    exportEnergyCsv(): string {
        const rows = ["step,timePs,potential,kinetic,total,temperatureK"];
        for (const e of this.#state.energy) {
            rows.push(`${e.step},${e.timePs},${e.potential},${e.kinetic},${e.total},${e.temperatureK}`);
        }
        return rows.join("\n");
    }
}
