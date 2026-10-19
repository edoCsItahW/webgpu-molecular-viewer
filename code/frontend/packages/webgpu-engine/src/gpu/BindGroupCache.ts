// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file BindGroupCache.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/16 17:30
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { GPUContext } from "./GPUContext";
import { Console } from "@wmv/common";
import { t } from "../locales";


export interface BindGroupCacheOptions {
    verbose?: boolean;

    warnOnLeak?: boolean;
}


type Signature = string;

const DEFAULT_BIND_GROUP_CACHE_OPTIONS: BindGroupCacheOptions = {
    verbose: false,
    warnOnLeak: true
};


export class BindGroupCache {
    private readonly opts: BindGroupCacheOptions;

    #disposed = false;

    private cache: Map<Signature, GPUBindGroup> = new Map();
    private resourceToSignatures: Map<object, Set<Signature>> = new Map();
    private signatureToResources: Map<Signature, object[]> = new Map();

    private nextObjectId = 1;
    private objectIds = new Map<object, number>();

    constructor(private readonly gpu: GPUContext, options: BindGroupCacheOptions = {}) {
        this.opts = {...DEFAULT_BIND_GROUP_CACHE_OPTIONS, ...options};
    }

    get size(): number {
        return this.cache.size;
    }

    get disposed() {
        return this.#disposed;
    }

    listSignatures(): string[] {
        return [...this.cache.keys()];
    }

    listSignaturesForResource(resource: object): string[] {
        const set = this.resourceToSignatures.get(resource);
        return set ? [...set] : [];
    }

    getOrCreate(layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[], label?: string): GPUBindGroup {
        this.assertAlive();

        const signature = this.makeSignature(layout, entries);

        const cached = this.cache.get(signature);
        if (cached) return cached;

        const resources = this.collectResources(entries);

        const bindGroup = this.gpu.device.createBindGroup({
            layout,
            entries,
            label: label ?? `bg:${signature}`
        });

        this.cache.set(signature, bindGroup);
        this.signatureToResources.set(signature, resources);

        for (const resource of resources) {
            let set = this.resourceToSignatures.get(resource);
            if (!set) {
                set = new Set();
                this.resourceToSignatures.set(resource, set);
            }

            set.add(signature);
        }

        if (this.opts.verbose)
            Console.info(t("BindGroupCache.getOrCreate.info_1", { signature, length: entries.length }));

        return bindGroup;
    }

    invalidate(signature: Signature): void {
        if (!this.cache.has(signature)) return;

        this.cache.delete(signature);

        const resources = this.signatureToResources.get(signature);
        if (resources) {
            for (const resource of resources) {
                const set = this.resourceToSignatures.get(resource);
                if (set) {
                    set.delete(signature);

                    if (set.size === 0) this.resourceToSignatures.delete(resource);
                }
            }

            this.signatureToResources.delete(signature);
        }

        if (this.opts.verbose)
            Console.info(t("BindGroupCache.invalidate.info_1", { signature }));
    }

    invalidateResource(resource: object): void {
        const set = this.resourceToSignatures.get(resource);
        if (!set) return;

        const signatures = [...set];
        for (const signature of signatures)
            this.invalidate(signature);
    }

    invalidateLayout(layout: GPUBindGroupLayout): void {
        this.invalidateResource(layout);
    }

    clear(): void {
        this.cache.clear();
        this.resourceToSignatures.clear();
        this.signatureToResources.clear();
    }

    dispose(): void {
        if (this.#disposed) return;

        if (this.opts.warnOnLeak && this.cache.size > 0) {
            Console.warning(t("BindGroupCache.dispose.warning_1", { size: this.cache.size }));

            if (this.opts.verbose)
                for (const sig of this.cache.keys())
                    Console.info(t("BindGroupCache.dispose.info_1", { sig }));
        }

        this.clear();
        this.#disposed = true;
    }

    private makeSignature(layout: GPUBindGroupLayout, entries: GPUBindGroupEntry[]): Signature {
        const layoutId = this.getObjectId(layout);
        const parts = [`L${layoutId}`];

        for (const entry of entries)
            parts.push(this.entryToSignaturePart(entry));

        parts.sort();

        return parts.join("|");
    }

    private entryToSignaturePart(entry: GPUBindGroupEntry): string {
        const r = entry.resource;

        if (BindGroupCache.isBufferBinding(r)) {
            const bufferId = this.getObjectId(r.buffer);

            return `B${entry.binding}:${bufferId}:${r.offset ?? 0}:${r.size ?? 0}`;
        }

        if (BindGroupCache.looksLikeSampler(r))
            return `S${entry.binding}:${this.getObjectId(r)}`;

        return `B${entry.binding}:${this.getObjectId(r)}`;
    }

    private static isBufferBinding(r: GPUBindingResource): r is GPUBufferBinding {
        return (
            typeof r === "object" &&
            r !== null &&
            "buffer" in r &&
            (r as GPUBufferBinding).buffer instanceof GPUBuffer
        );
    }

    /**
     * 粗略判断是否是 GPUSampler。
     *
     * GPUSampler 与 GPUTextureView 都是接口，没有可用的共享构造函数，
     * 鸭子类型检测不可靠。因此这里统一返回 false：
     * sampler 与 view 都由对象 ID 区分，签名唯一性不受影响。
     */
    private static looksLikeSampler(r: GPUBindingResource): boolean {
        return false;
    }

    private collectResources(entries: GPUBindGroupEntry[]): object[] {
        const resources: object[] = [];

        for (const entry of entries) {
            const r = entry.resource;

            if (BindGroupCache.isBufferBinding(r))
                resources.push(r.buffer);

            else
                resources.push(r);
        }

        return resources;
    }

    private getObjectId(obj: object): number {
        let id = this.objectIds.get(obj);

        if (id === undefined) {
            id = this.nextObjectId++;
            this.objectIds.set(obj, id);
        }

        return id;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("BindGroupCache.assertAlive.error_1"));
    }

}
