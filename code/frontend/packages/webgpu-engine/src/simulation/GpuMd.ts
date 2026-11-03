// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file GpuMd.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/28
 * @desc GPU 分子动力学（P4）：在 compute shader 里做 LJ + 谐振键 + 积分，
 *       并把新坐标直接写回球批次的实例 storage —— 渲染下一帧即可见，CPU 不参与。
 *
 *       与数学包的对应：
 *         - LJ 的 24ε 形式、谐振键 F = k·(r−r0)、半隐式积分，与
 *           packages/mathematical/src/physics/{lennard-jones,harmonic-bond,integrator} 一致；
 *         - 这里把它们搬到 WGSL，CPU 包继续作为参考实现 / 单测基线。
 *
 *       性能取舍：
 *         - 非键用 all-pairs（无邻居表）：4779 原子约 2 ms/步；
 *         - 键用 CSR 邻接表，每个原子只遍历自己的键；
 *         - 双缓冲 posA / posB，每步交换 bind group，避免同一步内读写竞争。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Renderer } from "../render/Renderer";
import type { Batch } from "../render/Batch";
import type { Nullable } from "@wmv/common";


/** 球实例在 storage 里的 float 数（32 B） */
const SPHERE_STRIDE_FLOATS = 8;

/** 每次 dispatch 的线程组大小，与 md.wgsl 的 workgroup_size 一致 */
const MD_WORKGROUP_SIZE = 128;

/** 单个原子参数：mass / epsilon / sigma / 保留 */
const ATOM_PARAM_FLOATS = 4;

/** 单个键引用：other / rest / k / pad */
const BOND_REF_FLOATS = 4;


export interface GpuMdOptions {
    /** 球批次（kind === 'sphere'），实例缓冲会被直接更新 */
    batch: Batch;

    /** 键表（原子下标对） */
    bonds: ReadonlyArray<readonly [number, number]>;

    /** 时间步长（ps）。默认 0.002 ps = 2 fs */
    dt?: number;

    /** 每步速度衰减（0 = 无阻尼）。默认 0.001 */
    damping?: number;

    /** LJ 的 ε（kJ/mol 量级；演示用小值，避免把分子炸开）。默认 1e-5 */
    ljEpsilon?: number;

    /** 谐振键的 k（默认 60） */
    bondK?: number;

    /** 原子质量（默认 12 u；键合原子统一质量，够用于演示） */
    mass?: number;

    /** 初始温度（K），用于给原子很小的随机初速度，默认 300 */
    temperature?: number;
}

interface ResolvedGpuMdOptions extends Required<GpuMdOptions> {
}


export class GpuMd {
    readonly count: number;

    /** 已推进的步数 */
    #steps = 0;

    #disposed = false;

    private readonly renderer: Renderer;

    private readonly opts: ResolvedGpuMdOptions;

    private readonly batch: Batch;

    /** 双缓冲位置：vec4(x, y, z, 0) */
    private readonly posA: GPUBuffer;
    private readonly posB: GPUBuffer;

    /** 速度：vec4 */
    private readonly vel: GPUBuffer;

    /** 每原子参数：vec4(mass, epsilon, sigma, 0) */
    private readonly params: GPUBuffer;

    /** CSR 键表 */
    private readonly bondStart: GPUBuffer;
    private readonly bondRefs: GPUBuffer;

    private readonly uniformBuffer: GPUBuffer;

    private readonly bindGroupAB: GPUBindGroup;
    private readonly bindGroupBA: GPUBindGroup;

    private readonly pipeline: GPUComputePipeline;

    /** 初始状态（reset 用） */
    private readonly initialPositions: Float32Array;

    /** 能量回读缓冲（每 N 帧采样一次，不在渲染路径上） */
    private readonly posRead: Nullable<GPUBuffer>;
    private readonly velRead: Nullable<GPUBuffer>;

    /** 去重后的键表（CPU 侧算势能用） */
    private readonly uniqueBonds: Array<{a: number; b: number; rest: number}> = [];

    #energyBusy = false;

    constructor(renderer: Renderer, options: GpuMdOptions) {
        if (options.batch.kind !== "sphere")
            throw new Error("MsgId: GpuMd 只能挂在球批次上");

        this.renderer = renderer;
        this.batch = options.batch;
        this.count = options.batch.count;
        this.opts = {
            batch: options.batch,
            bonds: options.bonds,
            dt: options.dt ?? 0.002,
            damping: options.damping ?? 0.001,
            ljEpsilon: options.ljEpsilon ?? 1e-5,
            bondK: options.bondK ?? 60,
            mass: options.mass ?? 12,
            temperature: options.temperature ?? 300
        };

        const data = options.batch.data;

        // 初速度：随机热运动（否则键长恰在平衡位置时分子完全静止）
        const thermal = 8.0 * Math.sqrt(this.opts.temperature / 300);

        this.initialPositions = new Float32Array(this.count * 4);
        const initialVel = new Float32Array(this.count * 4);
        const prm = new Float32Array(this.count * ATOM_PARAM_FLOATS);

        for (let i = 0; i < this.count; i++) {
            const o = i * SPHERE_STRIDE_FLOATS;
            this.initialPositions[i * 4] = data[o];
            this.initialPositions[i * 4 + 1] = data[o + 1];
            this.initialPositions[i * 4 + 2] = data[o + 2];

            initialVel[i * 4] = (Math.random() * 2 - 1) * thermal;
            initialVel[i * 4 + 1] = (Math.random() * 2 - 1) * thermal;
            initialVel[i * 4 + 2] = (Math.random() * 2 - 1) * thermal;

            prm[i * 4] = this.opts.mass;
            prm[i * 4 + 1] = this.opts.ljEpsilon;
            prm[i * 4 + 2] = 3.0;
        }

        // ---- CSR 键表：每个原子只遍历自己的键 ----
        const degree = new Uint32Array(this.count + 1);

        for (const [a, b] of options.bonds) {
            if (a < 0 || b < 0 || a >= this.count || b >= this.count || a === b) continue;
            degree[a + 1]++;
            degree[b + 1]++;
        }

        for (let i = 0; i < this.count; i++)
            degree[i + 1] += degree[i];

        const cursor = degree.slice(0, this.count);
        const bondStart = new Uint32Array(this.count + 1);
        bondStart.set(degree);

        const bondRefs = new Float32Array(degree[this.count] * BOND_REF_FLOATS);
        const bondU32 = new Uint32Array(bondRefs.buffer);

        const addBond = (self: number, other: number): void => {
            const idx = cursor[self]++;
            const o = idx * BOND_REF_FLOATS;

            const ax = data[self * SPHERE_STRIDE_FLOATS];
            const ay = data[self * SPHERE_STRIDE_FLOATS + 1];
            const az = data[self * SPHERE_STRIDE_FLOATS + 2];
            const bx = data[other * SPHERE_STRIDE_FLOATS];
            const by = data[other * SPHERE_STRIDE_FLOATS + 1];
            const bz = data[other * SPHERE_STRIDE_FLOATS + 2];

            bondU32[o] = other;
            bondRefs[o + 1] = Math.hypot(bx - ax, by - ay, bz - az);
            bondRefs[o + 2] = this.opts.bondK;
        };

        for (const [a, b] of options.bonds) {
            if (a < 0 || b < 0 || a >= this.count || b >= this.count || a === b) continue;
            addBond(a, b);
            addBond(b, a);
        }

        // 去重键表：CPU 侧算势能（每对只算一次）
        const seen = new Set<number>();

        for (const [a, b] of options.bonds) {
            if (a < 0 || b < 0 || a >= this.count || b >= this.count || a === b) continue;

            const lo = Math.min(a, b);
            const hi = Math.max(a, b);
            const key = lo * this.count + hi;

            if (seen.has(key)) continue;
            seen.add(key);

            const ax = data[lo * SPHERE_STRIDE_FLOATS];
            const ay = data[lo * SPHERE_STRIDE_FLOATS + 1];
            const az = data[lo * SPHERE_STRIDE_FLOATS + 2];
            const bx = data[hi * SPHERE_STRIDE_FLOATS];
            const by = data[hi * SPHERE_STRIDE_FLOATS + 1];
            const bz = data[hi * SPHERE_STRIDE_FLOATS + 2];

            this.uniqueBonds.push({a: lo, b: hi, rest: Math.hypot(bx - ax, by - ay, bz - az)});
        }

        const rm = renderer.rm;

        this.posA = rm.create("storage-buffer", this.count * 16, {label: "md:posA", copySrc: true});
        this.posB = rm.create("storage-buffer", this.count * 16, {label: "md:posB", copySrc: true});
        this.vel = rm.create("storage-buffer", this.count * 16, {label: "md:vel", copySrc: true});
        this.params = rm.create("storage-buffer", this.count * 16, {label: "md:params"});
        this.bondStart = rm.create("storage-buffer", bondStart.byteLength, {label: "md:bondStart"});
        this.bondRefs = rm.create("storage-buffer", bondRefs.byteLength, {label: "md:bonds"});
        this.uniformBuffer = rm.create("uniform-buffer", 16, "md:uniforms");

        // 能量回读只在中小体系开启（100k 每次 3.2 MB 拷贝不值得）
        if (this.count <= 20000) {
            this.posRead = rm.create("readback-buffer", this.count * 16, "md:pos-read");
            this.velRead = rm.create("readback-buffer", this.count * 16, "md:vel-read");
        } else {
            this.posRead = null;
            this.velRead = null;
        }

        rm.writeBuffer(this.posA, this.initialPositions);
        rm.writeBuffer(this.posB, this.initialPositions);
        rm.writeBuffer(this.vel, initialVel);
        rm.writeBuffer(this.params, prm);
        rm.writeBuffer(this.bondStart, bondStart);
        rm.writeBuffer(this.bondRefs, bondRefs);
        this.writeUniforms();

        const bgl = renderer.pm.getBindGroupLayouts("md", [
            {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
            {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}},
            {binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: {type: "read-only-storage"}},
            {binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: {type: "uniform"}},
            {binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: {type: "storage"}}
        ]);

        const module = renderer.shaders.compile("md");

        this.pipeline = renderer.pm.getComputePipeline("md", {
            layout: renderer.pm.getPipelineLayout("md", [bgl]),
            compute: {module, entryPoint: "main"}
        });

        const makeBG = (posIn: GPUBuffer, posOut: GPUBuffer): GPUBindGroup =>
            renderer.bg.getOrCreate(bgl, [
                {binding: 0, resource: {buffer: posIn}},
                {binding: 1, resource: {buffer: posOut}},
                {binding: 2, resource: {buffer: this.vel}},
                {binding: 3, resource: {buffer: this.params}},
                {binding: 4, resource: {buffer: this.bondStart}},
                {binding: 5, resource: {buffer: this.bondRefs}},
                {binding: 6, resource: {buffer: this.uniformBuffer}},
                {binding: 7, resource: {buffer: options.batch.storageBuffer!}}
            ], `md:${posIn === this.posA ? "ab" : "ba"}`);

        this.bindGroupAB = makeBG(this.posA, this.posB);
        this.bindGroupBA = makeBG(this.posB, this.posA);
    }

    get steps(): number {
        return this.#steps;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 更新参数（时间步长 / 阻尼 / LJ ε） */
    setParams(params: {dt?: number; damping?: number; ljEpsilon?: number}): void {
        if (params.dt !== undefined) this.opts.dt = params.dt;
        if (params.damping !== undefined) this.opts.damping = params.damping;
        if (params.ljEpsilon !== undefined) this.opts.ljEpsilon = params.ljEpsilon;

        this.writeUniforms();
    }

    /**
     * 推进 n 步。命令录制后一次提交；渲染在下一帧读到新坐标。
     */
    step(n = 1): void {
        if (this.#disposed || this.count === 0 || n <= 0) return;

        const device = this.renderer.gpu.device;
        const encoder = device.createCommandEncoder({label: "md:step"});
        const pass = encoder.beginComputePass();
        const groups = Math.ceil(this.count / MD_WORKGROUP_SIZE);

        pass.setPipeline(this.pipeline);

        let useAB = this.#steps % 2 === 0;

        for (let s = 0; s < n; s++) {
            pass.setBindGroup(0, useAB ? this.bindGroupAB : this.bindGroupBA);
            pass.dispatchWorkgroups(groups);
            useAB = !useAB;
        }

        pass.end();
        device.queue.submit([encoder.finish()]);

        this.batch.dynamic = true;
        this.#steps += n;
    }

    /**
     * 采样能量（每 N 帧调用一次，不在渲染路径上）。
     *
     * 读回当前位置/速度（≤20k 原子才开启），CPU 侧算：
     *   KE = Σ ½m|v|²，PE = Σ ½k(r−r0)²；单位换算 1 u·Å²/ps² = 0.01 kJ/mol。
     *   T = 2KE / (3N·R)，R = 0.008314 kJ·mol⁻¹·K⁻¹。
     *
     * 读回是异步的；同一时刻只允许一个采样在飞。
     */
    async sampleEnergy(): Promise<{potential: number; kinetic: number; temperature: number} | null> {
        if (this.#disposed || this.#energyBusy || !this.posRead || !this.velRead) return null;

        const count = this.count;
        if (count === 0) return null;

        this.#energyBusy = true;

        const current = this.#steps % 2 === 1 ? this.posB : this.posA;
        const encoder = this.renderer.gpu.device.createCommandEncoder({label: "md:energy"});

        encoder.copyBufferToBuffer(current, 0, this.posRead, 0, count * 16);
        encoder.copyBufferToBuffer(this.vel, 0, this.velRead, 0, count * 16);
        this.renderer.gpu.device.queue.submit([encoder.finish()]);

        try {
            await Promise.all([
                this.posRead.mapAsync(GPUMapMode.READ),
                this.velRead.mapAsync(GPUMapMode.READ)
            ]);

            const pos = new Float32Array(this.posRead.getMappedRange().slice(0));
            const vel = new Float32Array(this.velRead.getMappedRange().slice(0));

            this.posRead.unmap();
            this.velRead.unmap();

            const mass = this.opts.mass;
            let kinetic = 0;

            for (let i = 0; i < count; i++) {
                const o = i * 4;
                kinetic += 0.5 * mass * (
                    vel[o] * vel[o] + vel[o + 1] * vel[o + 1] + vel[o + 2] * vel[o + 2]
                );
            }

            let potential = 0;

            for (const bond of this.uniqueBonds) {
                const ao = bond.a * 4;
                const bo = bond.b * 4;

                const dist = Math.hypot(
                    pos[bo] - pos[ao],
                    pos[bo + 1] - pos[ao + 1],
                    pos[bo + 2] - pos[ao + 2]
                );
                const dr = dist - bond.rest;

                potential += 0.5 * this.opts.bondK * dr * dr;
            }

            // u·Å²/ps² → kJ/mol
            kinetic *= 0.01;
            potential *= 0.01;

            const temperature = (2 * kinetic) / (3 * count * 0.008314);

            return {potential, kinetic, temperature};
        } catch {
            return null;
        } finally {
            if (this.posRead.mapState === "mapped") this.posRead.unmap();
            if (this.velRead.mapState === "mapped") this.velRead.unmap();

            this.#energyBusy = false;
        }
    }

    /** 回到初始位置与零速度（同时恢复实例缓冲里的球心） */
    reset(): void {
        if (this.#disposed) return;

        this.#steps = 0;
        this.batch.dynamic = false;

        this.batch.setInstances(this.batch.data, this.batch.count);
        this.renderer.rm.writeBuffer(this.posA, this.initialPositions);
        this.renderer.rm.writeBuffer(this.posB, this.initialPositions);
        this.renderer.rm.writeBuffer(this.vel, new Float32Array(this.count * 4));
        this.writeUniforms();
    }

    dispose(): void {
        if (this.#disposed) return;

        const rm = this.renderer.rm;

        for (const buffer of [this.posA, this.posB, this.vel, this.params, this.bondStart, this.bondRefs, this.uniformBuffer])
            rm.destroy(buffer);

        if (this.posRead) rm.destroy(this.posRead);
        if (this.velRead) rm.destroy(this.velRead);

        this.#disposed = true;
    }

    private writeUniforms(): void {
        const data = new ArrayBuffer(16);
        const f = new Float32Array(data);

        f[0] = this.opts.dt;
        new Uint32Array(data)[1] = this.count;
        f[2] = this.opts.damping;
        f[3] = this.opts.ljEpsilon;

        this.renderer.rm.writeBuffer(this.uniformBuffer, data);
    }
}


/** 依据当前球批次与键表创建 MD；批次不可用时返回 null */
export function createGpuMd(
    renderer: Renderer,
    batch: Nullable<Batch>,
    bonds: ReadonlyArray<readonly [number, number]>,
    options: Omit<GpuMdOptions, "batch" | "bonds"> = {}
): Nullable<GpuMd> {
    if (!batch || batch.kind !== "sphere" || batch.count === 0 || !batch.storageBuffer)
        return null;

    return new GpuMd(renderer, {...options, batch, bonds});
}

