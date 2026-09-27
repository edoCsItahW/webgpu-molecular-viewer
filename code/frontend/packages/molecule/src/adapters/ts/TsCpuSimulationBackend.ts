// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file TsCpuSimulationBackend.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc CPU 模拟后端：把 simulation 模块的 CPU 参考实现串成 SimulationBackendPort。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {
    SimulationBackendPort,
    SimulationCapabilities,
    SimulationSpec,
    SimulationInput,
    SimulationSession,
    StepReport,
    PositionHandle,
} from "../../ports";
import {
    systemStateFromStructure,
    buildSystemNeighbors,
    needsRebuild,
    computeForces,
    computeKinetic,
    initVelocities,
    velocityVerletStep,
    mulberry32,
    DEFAULT_FORCE_FIELD,
    DEFAULT_INTEGRATOR,
    DEFAULT_NEIGHBOR_OPTIONS,
} from "../../simulation";
import type {ForceFieldSpec, IntegratorSpec, SystemState, NeighborListOptions} from "../../simulation";

/** CPU 模拟会话：持有 SystemState，逐步推进。 */
class CpuSession implements SimulationSession {
    readonly backend = "local-cpu" as const;
    readonly #state: SystemState;
    readonly #force: ForceFieldSpec;
    readonly #integrator: IntegratorSpec;
    readonly #rng: () => number;
    #step = 0;
    #timePs = 0;
    #neighborCounter = 0;

    constructor(state: SystemState, force: ForceFieldSpec, integrator: IntegratorSpec, rng: () => number) {
        this.#state = state;
        this.#force = force;
        this.#integrator = integrator;
        this.#rng = rng;
        // 初始邻居表已由 systemStateFromStructure 构建；这里确保使用 force.cutoff
        const options: NeighborListOptions = {
            cutoff: force.cutoff,
            skin: DEFAULT_NEIGHBOR_OPTIONS.skin,
            maxNeighborsPerAtom: DEFAULT_NEIGHBOR_OPTIONS.maxNeighborsPerAtom,
        };
        buildSystemNeighbors(state, options, 0);
        // 初始力
        computeForces(state, force);
    }

    async step(count: number): Promise<StepReport> {
        const t0 = performance.now();
        let potential = 0;
        const options: NeighborListOptions = {
            cutoff: this.#force.cutoff,
            skin: DEFAULT_NEIGHBOR_OPTIONS.skin,
            maxNeighborsPerAtom: DEFAULT_NEIGHBOR_OPTIONS.maxNeighborsPerAtom,
        };
        for (let s = 0; s < count; s++) {
            this.#neighborCounter++;
            if (this.#neighborCounter >= this.#integrator.rebuildNeighborsEvery ||
                needsRebuild(this.#state.positions, this.#state.referencePositions, this.#state.atomCount, options.skin)) {
                buildSystemNeighbors(this.#state, options, this.#step);
                this.#neighborCounter = 0;
            }
            potential = velocityVerletStep(this.#state, this.#force, this.#integrator, this.#rng);
            this.#step++;
            this.#timePs += this.#integrator.timestepFs / 1000;
        }
        const { kinetic, temperatureK } = computeKinetic(this.#state);
        const elapsedMs = performance.now() - t0;
        return {
            steps: this.#step,
            energy: { potential, kinetic, total: potential + kinetic },
            temperatureK,
            elapsedMs,
        };
    }

    positions(): PositionHandle {
        return { kind: "cpu-array", atomCount: this.#state.atomCount };
    }

    reset(): void {
        // CPU 后端不支持 reset 到初始态（需保存快照），记录占位
        this.#step = 0;
        this.#timePs = 0;
    }

    dispose(): void {
        // 无 GPU 资源，无需释放
    }
}

/**
 * CPU 模拟后端。
 * capabilities.interactive = false：每帧只能"运行 N 步"，不能逐帧交互推进。
 * 用途：对拍基准 + 无 GPU 环境兜底。
 */
export class TsCpuSimulationBackend implements SimulationBackendPort {
    capabilities(): SimulationCapabilities {
        return {
            kind: "local-cpu",
            interactive: false,
            forces: ["lennard-jones", "harmonic-bond", "coulomb"],
            integrators: ["velocity-verlet"],
            maxAtoms: 2000,
            supportsEnergyReadback: true,
        };
    }

    async prepare(input: SimulationInput, _signal?: AbortSignal): Promise<SimulationSession> {
        const state = systemStateFromStructure(input.data);
        if (input.initialPositions) {
            state.positions.set(input.initialPositions);
        }

        const force: ForceFieldSpec = {
            ...DEFAULT_FORCE_FIELD,
            lennardJones: input.spec.forceField.lennardJones,
            harmonicBonds: input.spec.forceField.harmonicBonds,
            coulomb: input.spec.forceField.coulomb,
            cutoff: input.spec.forceField.cutoff,
        };

        const integrator: IntegratorSpec = {
            ...DEFAULT_INTEGRATOR,
            timestepFs: input.spec.timestepFs,
            temperatureK: input.spec.temperatureK,
            damping: input.spec.damping,
            seed: input.spec.seed,
            substepsPerFrame: input.spec.substepsPerFrame,
        };

        // 若缺电荷列，关闭库仑
        if (!input.data.atoms.charge) {
            force.coulomb = false;
        }
        // 若无键，关闭键力
        if (state.bondA.length === 0) {
            force.harmonicBonds = false;
        }

        initVelocities(state, integrator.temperatureK, integrator.seed);
        const rng = mulberry32(integrator.seed + 1);

        return new CpuSession(state, force, integrator, rng);
    }
}
