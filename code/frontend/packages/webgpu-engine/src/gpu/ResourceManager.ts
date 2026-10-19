// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ResourceManager.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/15 19:54
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {GPUContext} from "./GPUContext";
import { Console } from "@wmv/common";
import { t } from "../locales";


type GPUResource = GPUBuffer | GPUTexture | GPUSampler;


type SampleKind = "buffer" | "texture" | "sampler";


interface TrackedEntry {
    type: SampleKind;
    label: string;
    object: GPUResource;
    createAt: number;
}


export interface ResourceManagerOptions {
    warnOnLeak?: boolean;

    trackCreationTime?: boolean;
}


const DEFAULT_RESOURCE_MANAGER_OPTIONS: ResourceManagerOptions = {
    warnOnLeak: true,
    trackCreationTime: false
};

function alignUp(n: number, alignment = 4): number {
    return Math.ceil(n / alignment) * alignment;
}

type DescriptorOfEntryCreate<T extends SampleKind> = {
    buffer: GPUBufferDescriptor;
    texture: GPUTextureDescriptor;
    sampler: GPUSamplerDescriptor;
}[T];

type ResultOfEntryCreate<T extends SampleKind> = {
    buffer: GPUBuffer;
    texture: GPUTexture;
    sampler: GPUSampler;
}[T];

type BufferKind =
    "vertex-buffer"
    | "index-buffer"
    | "uniform-buffer"
    | "storage-buffer"
    | "readback-buffer";

type ResourceKind = BufferKind | SampleKind;


export class ResourceManager {
    #disposed = false;

    private readonly opts: ResourceManagerOptions;

    private entries: Map<GPUResource, TrackedEntry> = new Map();

    private counts: Record<SampleKind, number> = {
        buffer: 0,
        texture: 0,
        sampler: 0
    };

    constructor(public readonly gpu: GPUContext, options: Partial<ResourceManagerOptions> = {}) {
        this.opts = {...DEFAULT_RESOURCE_MANAGER_OPTIONS, ...options};
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    get bufferCount(): number {
        return this.counts.buffer;
    }

    get textureCount(): number {
        return this.counts.texture;
    }

    get samplerCount(): number {
        return this.counts.sampler;
    }

    get totalCount(): number {
        return this.entries.size;
    }

    snapshot(): Array<{ type: SampleKind; label: string; age: number; }> {
        const now = performance.now();
        const out: Array<{ type: SampleKind; label: string; age: number; }> = [];

        for (const entry of this.entries.values())
            out.push({
                type: entry.type,
                label: entry.label,
                age: this.opts.trackCreationTime ? now - entry.createAt : 0
            });

        return out;
    }

    create<T extends SampleKind>(
        type: T,
        desc: DescriptorOfEntryCreate<T>
    ): ResultOfEntryCreate<T>;
    create(type: "vertex-buffer", data: ArrayBufferView, label?: string): GPUBuffer;
    create(type: "index-buffer", data: Uint16Array | Uint32Array, label?: string): GPUBuffer;
    create(type: "uniform-buffer", size: number, label?: string): GPUBuffer;
    create(
        type: "storage-buffer",
        size: number,
        options?: { vertex?: boolean; copySrc?: boolean; label?: string }
    ): GPUBuffer;
    create(type: "readback-buffer", size: number, label?: string): GPUBuffer;
    create(type: ResourceKind, descOrData: any, labelOrOpt?: any): GPUResource {
        if (ResourceManager.endsWithBuffer(type)) {
            let opts: Partial<GPUBufferDescriptor> & {
                usage: GPUBufferDescriptor["usage"];
            } = {
                usage: GPUBufferUsage.COPY_DST
            };
            switch (type) {
                case "vertex-buffer":
                    opts.size = alignUp(ResourceManager.byteLengthOf(descOrData));
                    opts.usage |= GPUBufferUsage.VERTEX;
                    break;
                case "index-buffer":
                    opts.size = alignUp(ResourceManager.byteLengthOf(descOrData));
                    opts.usage |= GPUBufferUsage.INDEX;
                    break;
                case "uniform-buffer":
                    opts.size = alignUp(ResourceManager.byteLengthOf(descOrData), 16);
                    opts.usage |= GPUBufferUsage.UNIFORM;
                    break;
                case "storage-buffer": {
                    const storageOpts = labelOrOpt ?? {};

                    opts.size = alignUp(ResourceManager.byteLengthOf(descOrData), 16);
                    opts.usage |= GPUBufferUsage.STORAGE;
                    if (storageOpts.vertex)
                        opts.usage |= GPUBufferUsage.VERTEX;
                    if (storageOpts.copySrc)
                        opts.usage |= GPUBufferUsage.COPY_SRC;
                    opts.label = storageOpts.label ?? `<${type} buffer>`;
                    break;
                }
                case "readback-buffer":
                    opts.size = alignUp(ResourceManager.byteLengthOf(descOrData), 4);
                    opts.usage |= GPUBufferUsage.MAP_READ;
                    break;
            }

            opts.label ??= labelOrOpt;

            const result = this.createTrackedBuffer(opts as GPUBufferDescriptor);

            if (type !== "vertex-buffer" && type !== "index-buffer")
                return result;

            this.writeBuffer(result, descOrData);

            return result;
        } else {
            this.assertAlive();

            switch (type) {
                case "buffer":
                    return this.createTrackedBuffer(descOrData);
                case "texture": {
                    const texture = this.gpu.device.createTexture(descOrData);

                    this.track(texture, "texture", descOrData.label ?? "<unnamed texture>");

                    return texture;
                }
                case "sampler": {
                    const sampler = this.gpu.device.createSampler(descOrData);

                    this.track(sampler, "sampler", descOrData.label ?? "<unnamed sampler>");

                    return sampler;
                }
            }
        }
    };

    writeBuffer(buffer: GPUBuffer, data: ArrayBufferView | ArrayBuffer, offset = 0): void {
        this.assertAlive();

        if (ArrayBuffer.isView(data))
            this.gpu.device.queue.writeBuffer(
                buffer,
                offset,
                data.buffer,
                data.byteOffset,
                data.byteLength
            );
        else
            this.gpu.device.queue.writeBuffer(buffer, offset, data);
    }

    disposeAll(): void {
        if (this.#disposed) return;

        if (this.opts.warnOnLeak && this.entries.size > 0) {
            Console.warning(t("ResourceManager.disposeAll.warning_1", { size: this.entries.size }));

            for (const entry of this.entries.values())
                Console.warning(t("ResourceManager.disposeAll.warning_2", { label: entry.label }));
        }

        for (const entry of this.entries.values())
            this.destroyObject(entry.object);

        this.entries.clear();
        this.counts = {buffer: 0, texture: 0, sampler: 0};
        this.#disposed = true;
    }

    destroy(resource: GPUResource): void {
        const entry = this.entries.get(resource);

        if (!entry) {
            if (this.opts.warnOnLeak)
                Console.warning(t("ResourceManager.destroy.warning_1", { resource: String(resource) }));

            this.destroyObject(resource);
            return;
        }

        this.destroyObject(resource);
        this.untrack(resource, entry);
    }

    private track(resource: GPUResource, type: SampleKind, label: string): void {
        this.entries.set(resource, {
            type,
            label,
            object: resource,
            createAt: this.opts.trackCreationTime ? performance.now() : 0
        });

        this.counts[type]++;
    }

    /**
     * 创建 GPUBuffer 并登记。
     * 所有 buffer 都必须经由此处创建，否则 dispose/泄漏审计会漏掉它们。
     */
    private createTrackedBuffer(desc: GPUBufferDescriptor): GPUBuffer {
        this.assertAlive();

        const buffer = this.gpu.device.createBuffer(desc);

        this.track(buffer, "buffer", desc.label ?? "<unnamed buffer>");

        return buffer;
    }

    private untrack(resource: GPUResource, entry: TrackedEntry): void {
        this.entries.delete(resource);
        this.counts[entry.type]--;
    }

    private destroyObject(resource: GPUResource): void {
        if ("destroy" in resource && typeof (resource as GPUBuffer).destroy === "function")
            try {
                (resource as GPUBuffer | GPUTexture).destroy();
            } catch {
            }
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("ResourceManager.assertAlive.error_1"));
    }

    private static endsWithBuffer(type: ResourceKind): type is BufferKind {
        return type.endsWith("-buffer");
    }

    /**
     * 取入参的字节数。
     * 顶点/索引缓冲传的是 TypedArray，其余缓冲传的是字节数。
     */
    private static byteLengthOf(value: ArrayBufferView | number): number {
        return typeof value === "number" ? value : value.byteLength;
    }

}
