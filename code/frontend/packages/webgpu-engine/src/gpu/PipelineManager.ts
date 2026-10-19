// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PipelineManager.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/16 14:25
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {GPUContext} from "./GPUContext";
import { Console } from "@wmv/common";
import { t } from "../locales";


export interface PipelineManagerOptions {
    /**
     * 开发期是否打印每次管线创建的耗时与 key。
     * 默认 false。生产环境关掉，避免 log 抖动。
     */
    verbose?: boolean;

    /**
     * 是否自动把 GPUContext 的 format / depthFormat / sampleCount
     * 填进每个 render pipeline 描述符。
     *
     * 默认 true —— 强烈建议保留，可以避免"某个 pass 忘了跟 renderer 对齐"这类 bug。
     * 只有在做离屏渲染（格式与交换链不同）时才关掉，手动指定。
     */
    autoFillContextState?: boolean;
}


interface CachedPipeline {
    key: string;
    createdAt: number;
}


const DEFAULT_PIPELINE_MANAGER_OPTIONS: PipelineManagerOptions = {
    verbose: false,
    autoFillContextState: true
}


export class PipelineManager {
    private opts: PipelineManagerOptions;

    #disposed = false;
    private meta: Map<string, CachedPipeline> = new Map();

    private pendingRender: Map<string, Promise<GPURenderPipeline>> = new Map();

    private pendingCompute: Map<string, Promise<GPUComputePipeline>> = new Map();

    #stats = {
        bindGroupLayouts: new Map<string, GPUBindGroupLayout>(),
        pipelineLayouts: new Map<string, GPUPipelineLayout>(),
        renderPipelines: new Map<string, GPURenderPipeline>(),
        computePipelines: new Map<string, GPUComputePipeline>()
    };

    constructor(public readonly gpu: GPUContext, options: PipelineManagerOptions = {}) {
        this.opts = {...DEFAULT_PIPELINE_MANAGER_OPTIONS, ...options};
    }

    get stats() {
        return PipelineManager.sizes(this.#stats);
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    listRenderPipelineKeys(): string[] {
        return [...this.#stats.renderPipelines.keys()];
    }

    listComputePipelineKeys(): string[] {
        return [...this.#stats.computePipelines.keys()];
    }

    getBindGroupLayouts(key: string, entries: GPUBindGroupLayoutEntry[]): GPUBindGroupLayout {
        this.assertAlive();

        const cached = this.#stats.bindGroupLayouts.get(key);
        if (cached) return cached;

        const layout = this.gpu.device.createBindGroupLayout({
            entries,
            label: `bgl:${key}`
        });

        this.#stats.bindGroupLayouts.set(key, layout);
        this.meta.set(`bgl:${key}`, {key, createdAt: performance.now()});

        if (this.opts.verbose) Console.info(t("PipelineManager.getBindGroupLayouts.info_1", { key }));
        return layout;
    }

    getPipelineLayout(key: string, layouts: GPUBindGroupLayout[]): GPUPipelineLayout {
        this.assertAlive();

        const cached = this.#stats.pipelineLayouts.get(key);
        if (cached) return cached;

        const layout = this.gpu.device.createPipelineLayout({
            bindGroupLayouts: layouts,
            label: `pl:${key}`
        });

        this.#stats.pipelineLayouts.set(key, layout);
        this.meta.set(`pl:${key}`, {key, createdAt: performance.now()});

        if (this.opts.verbose) Console.info(t("PipelineManager.getPipelineLayout.info_1", { key }));
        return layout;
    }

    getRenderPipeline(key: string, descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
        this.assertAlive();

        const cached = this.#stats.renderPipelines.get(key);
        if (cached) return cached;

        const filled = this.fillRenderDefaults(descriptor);
        filled.label ??= `rp:${key}`;

        const t0 = this.opts.verbose ? performance.now() : 0;
        const pipeline = this.gpu.device.createRenderPipeline(filled);

        this.#stats.renderPipelines.set(key, pipeline);
        this.meta.set(`rp:${key}`, {key, createdAt: performance.now()});

        if (this.opts.verbose)
            Console.info(t("PipelineManager.getRenderPipeline.info_1", { key, duration: (performance.now() - t0).toFixed(2) }));

        return pipeline;
    }

    async getRenderPipelineAsync(key: string, descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
        this.assertAlive();

        const cached = this.#stats.renderPipelines.get(key);
        if (cached) return cached;

        const pending = this.pendingRender.get(key);
        if (pending) return pending;

        const filled = this.fillRenderDefaults(descriptor);
        filled.label ??= `rp:${key}`;

        const promise = this.gpu.device.createRenderPipelineAsync(filled)
            .then(pipeline => {
                this.#stats.renderPipelines.set(key, pipeline);
                this.pendingRender.delete(key);
                this.meta.set(`rp:${key}`, {key, createdAt: performance.now()});
                if (this.opts.verbose)
                    Console.info(t("PipelineManager.getRenderPipelineAsync.info_1", { key }));

                return pipeline;
            }).catch(err => {
                this.pendingRender.delete(key);
                throw err;
            });

        this.pendingRender.set(key, promise);
        return promise;
    }

    getComputePipeline(key: string, descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
        this.assertAlive();

        const cached = this.#stats.computePipelines.get(key);
        if (cached) return cached;

        descriptor.label ??= `cp:${key}`;

        const t0 = this.opts.verbose ? performance.now() : 0;
        const pipeline = this.gpu.device.createComputePipeline(descriptor);

        this.#stats.computePipelines.set(key, pipeline);
        this.meta.set(`cp:${key}`, {key, createdAt: performance.now()});

        if (this.opts.verbose)
            Console.info(t("PipelineManager.getComputePipeline.info_1", { key, duration: (performance.now() - t0).toFixed(2) }));

        return pipeline;
    }

    async getComputePipelineAsync(key: string, descriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
        this.assertAlive();

        const cached = this.#stats.computePipelines.get(key);
        if (cached) return cached;

        const pending = this.pendingCompute.get(key);
        if (pending) return pending;

        descriptor.label ??= `cp:${key}`;

        const promise = this.gpu.device.createComputePipelineAsync(descriptor)
            .then(pipeline => {
                this.#stats.computePipelines.set(key, pipeline);
                this.pendingCompute.delete(key);
                this.meta.set(`cp:${key}`, {key, createdAt: performance.now()});
                if (this.opts.verbose)
                    Console.info(t("PipelineManager.getComputePipelineAsync.info_1", { key }));

                return pipeline;
            }).catch(err => {
                this.pendingCompute.delete(key);
                throw err;
            });

        this.pendingCompute.set(key, promise);
        return promise;
    }

    hasRenderPipeline(key: string): boolean {
        return this.#stats.renderPipelines.has(key);
    }

    hasComputePipeline(key: string): boolean {
        return this.#stats.computePipelines.has(key);
    }

    invalidateRenderPipeline(key: string): void {
        this.#stats.renderPipelines.delete(key);
        this.meta.delete(`rp:${key}`);
    }

    invalidateComputePipeline(key: string): void {
        this.#stats.computePipelines.delete(key);
        this.meta.delete(`cp:${key}`);
    }

    clear(): void {
        this.#stats.bindGroupLayouts.clear();
        this.#stats.pipelineLayouts.clear();
        this.#stats.renderPipelines.clear();
        this.#stats.computePipelines.clear();
        this.meta.clear();
        this.pendingRender.clear();
        this.pendingCompute.clear();
    }

    dispose(): void {
        if (this.#disposed) return;

        if (this.opts.verbose && this.meta.size > 0) {
            Console.info(t("PipelineManager.dispose.info_1", { size: this.meta.size }));

            for (const meta of this.meta.values())
                Console.info(t("PipelineManager.dispose.info_2", { key: meta.key }));
        }

        this.clear();
        this.#disposed = true;
    }

    private fillRenderDefaults(descriptor: GPURenderPipelineDescriptor): GPURenderPipelineDescriptor {
        if (!this.opts.autoFillContextState) return {...descriptor};

        const gpu = this.gpu;
        const out = {...descriptor};

        out.multisample = {
            count: gpu.options.sampleCount, ...out.multisample
        };

        if (out.fragment)
            out.fragment = {
                ...out.fragment, targets: out.fragment.targets.map(t => {
                    if (!t) return t;

                    return {...t, format: t.format ?? gpu.format};
                })
            };

        if (out.depthStencil)
            out.depthStencil = {
                ...out.depthStencil,
                format: out.depthStencil.format ?? gpu.options.depthFormat
            };

        return out;
    }

    static sizes<T extends Record<string, { size: number; }>>(obj: T): { [K in keyof T]: number; } {
        return Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k, v.size])
        ) as { [K in keyof T]: number };
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("PipelineManager.assertAlive.error_1"));
    }
}
