// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PassManager.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/16 19:57
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {GPUContext} from "./GPUContext";
import type {Nullable, Optional} from "@wmv/common";


/** 中间纹理描述符。size 省略时表示跟随帧尺寸（canvas 物理像素） */
export interface IntermediateTextureDesc {
    format: GPUTextureFormat;
    usage: GPUTextureUsageFlags;
    /** 不填 = 跟随帧尺寸 */
    size?: [number, number];
    /** 采样数，默认 1 */
    sampleCount?: 1 | 4;
    /** 固定尺寸（如 SSAO 半分辨率）时用这个比例 */
    scale?: number;
}


/** 帧级只读上下文，每帧构建一次，传给所有 pass */
export interface FrameContext {
    /** 交换链颜色 view（最终 resolve 目标） */
    colorView: GPUTextureView;
    /** 深度纹理 view（来自 GPUContext） */
    depthView: GPUTextureView;
    /** MSAA 颜色 view。非 MSAA 时与 colorView 相同 */
    msaaView: GPUTextureView;
    /** 当前物理尺寸 */
    width: number;
    /** 当前物理高度 */
    height: number;
    /** 帧序号，从 0 开始 */
    frameIndex: number;
    /** 距上一帧的秒数，首帧为 0 */
    deltaTime: number;
}


/** 传给每个 pass 的执行上下文 */
export interface PassContext {
    /** 命令编码器，由 PassManager 统一创建和提交 */
    readonly encoder: GPUCommandEncoder;

    /** 帧上下文 */
    readonly frame: FrameContext;

    /** GPUContext 快捷引用 */
    readonly gpu: GPUContext;

    /**
     * 开启一个 render pass。
     * colorAttachments / depthStencilAttachment 未指定时，
     * 自动使用 frame 的 msaaView（或 colorView）和 depthView。
     */
    beginRenderPass(
        descriptor?: Partial<GPURenderPassDescriptor>
    ): GPURenderPassEncoder;

    /**
     * 开启一个 compute pass。
     */
    beginComputePass(
        descriptor?: GPUComputePassDescriptor
    ): GPUComputePassEncoder;

    /**
     * 获取一张中间纹理的 view。
     * 名字随便起，只要注册过 desc。
     */
    getTexture(name: string): GPUTextureView;

    /**
     * 获取一张中间纹理的原始 GPUTexture。
     * 用于需要拿它做 copy / resolve 的场景。
     */
    getTextureRaw(name: string): GPUTexture;

    /**
     * 每个 pass 私有的存储区。
     * Pass 自己往里塞临时状态，跨帧保留。
     * PassManager 不解析这个对象。
     */
    readonly state: Record<string, unknown>;
}


/** 单个 pass 的定义 */
export interface Pass {
    /** 唯一名字，用于依赖引用和调试 */
    name: string;

    /**
     * 声明"必须在这些 pass 之后执行"。
     * 不声明则视为与所有 pass 无依赖，顺序按注册顺序。
     */
    after?: string[];

    /** 执行体 */
    execute(ctx: PassContext): void;

    /**
     * 是否启用。
     * 可以是布尔值，也可以是每帧求值的函数（用于动态开关 SSAO 等）。
     */
    enabled?: boolean | ((frame: FrameContext) => boolean);
}


export interface PassManagerOptions {
    /**
     * 开发期打印每个 pass 的耗时。
     * 默认 false。生产环境关掉。
     */
    profilePasses?: boolean;

    /**
     * 是否在 dispose 时打印未释放的中间纹理。
     * 默认 true。
     */
    warnOnLeak?: boolean;
}


const DEFAULT_PASS_MANAGER_OPTIONS: PassManagerOptions = {
    profilePasses: false,
    warnOnLeak: true
};


export class PassManager {
    private opts: PassManagerOptions;

    #disposed = false;

    private frameIndex = 0;
    private lastFrameTime = 0;

    private passes: Pass[] = [];
    private passByName: Map<string, Pass> = new Map();
    private passStates: Map<string, Record<string, unknown>> = new Map();
    private sortedPasses: Optional<Pass[]>;

    private textures: Map<string, GPUTexture> = new Map();
    private textureDescs: Map<string, IntermediateTextureDesc> = new Map();

    constructor(public readonly gpu: GPUContext, options: PassManagerOptions = {}) {
        this.opts = {...DEFAULT_PASS_MANAGER_OPTIONS, ...options};
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    add(pass: Pass): this {
        this.assertAlive();

        if (this.passByName.has(pass.name))
            throw new Error(`MsgId: pass名字重复: ${pass.name}`);

        this.passes.push(pass);
        this.passByName.set(pass.name, pass);
        this.passStates.set(pass.name, {});
        this.sortedPasses = undefined;

        return this;
    }

    addMany(...passes: Pass[]): this {
        for (const passe of passes)
            this.add(passe);

        return this;
    }

    remove(name: string): void {
        const idx = this.passes.findIndex(p => p.name === name);

        if (idx >= 0) this.passes.splice(idx, 1);

        this.passByName.delete(name);
        this.passStates.delete(name);
        this.sortedPasses = undefined;
    }

    has(name: string): boolean {
        return this.passByName.has(name);
    }

    listPassNames(): string[] {
        return this.passes.map(p => p.name);
    }

    declareTexture(name: string, desc: IntermediateTextureDesc): this {
        this.assertAlive();

        this.textureDescs.set(name, desc);

        return this;
    }

    hasTexture(name: string): boolean {
        return this.textureDescs.has(name);
    }

    clearTextures(): void {
        for (const tex of this.textures.values())
            tex.destroy();

        this.textures.clear();
    }

    execute(frame: {
        colorView: GPUTextureView;
        depthView: GPUTextureView;
        msaaView?: Nullable<GPUTextureView>;
        width: number;
        height: number;
        deltaTime?: number;
    }): void {
        this.assertAlive();

        const now = performance.now();
        const dt = frame.deltaTime ?? (this.lastFrameTime === 0 ? 0 : (now - this.lastFrameTime) / 1000);
        this.lastFrameTime = now;

        const msaaView = frame.msaaView ?? frame.colorView;

        const frameCtx: FrameContext = {
            colorView: frame.colorView,
            depthView: frame.depthView,
            msaaView,
            width: frame.width,
            height: frame.height,
            frameIndex: this.frameIndex,
            deltaTime: dt
        };

        this.syncTextures(frame.width, frame.height);

        const sorted = this.getSortedPasses();

        const encoder = this.gpu.device.createCommandEncoder({label: `frame:${this.frameIndex}`});

        for (const pass of sorted) {
            const enabled = typeof pass.enabled === "function" ? pass.enabled(frameCtx) : pass.enabled !== false;
            if (!enabled) continue;

            const t0 = this.opts.profilePasses ? performance.now() : 0;

            const ctx = this.createPassContext(encoder, frameCtx, pass);
            try {
                pass.execute(ctx);
            } catch (err) {
                console.error(`MsgId: pass执行错误: ${pass.name}`, err);
                throw err;
            }

            if (this.opts.profilePasses)
                console.log(`MsgId: pass ${pass.name} 执行耗时: ${(performance.now() - t0).toFixed(2)}ms`);
        }

        // 一帧只提交一次：pass 之间可能通过 compute/render 交错依赖，
        // 统一提交才能保证 GPU 端时序（见 PassManager.md 九.9）
        this.gpu.device.queue.submit([encoder.finish()]);
        this.frameIndex++;
    }

    dispose(): void {
        if (this.#disposed) return;

        if (this.opts.warnOnLeak && this.textures.size > 0)
            console.warn(`MsgId: dispose，释放 ${this.textures.size} 张中间纹理`);

        for (const tex of this.textures.values())
            tex.destroy();

        this.textures.clear();
        this.textureDescs.clear();
        this.passes = [];
        this.passByName.clear();
        this.passStates.clear();
        this.sortedPasses = undefined;
        this.#disposed = true;
    }

    private getSortedPasses(): Pass[] {
        if (this.sortedPasses) return this.sortedPasses;

        const indegree = new Map<string, number>();
        const dependents = new Map<string, string[]>();

        for (const pass of this.passes)
            if (!indegree.has(pass.name)) indegree.set(pass.name, 0);

        for (const pass of this.passes) {
            const after = pass.after ?? [];
            for (const dep of after) {
                if (!this.passByName.has(dep))
                    throw new Error(`MsgId: pass "${pass.name}" 依赖了不存在的 pass "${dep}"`);

                indegree.set(pass.name, (indegree.get(pass.name) ?? 0) + 1);

                if (!dependents.has(dep))
                    dependents.set(dep, []);

                dependents.get(dep)!.push(pass.name);
            }
        }

        const queue: string[] = [];

        for (const pass of this.passes)
            if ((indegree.get(pass.name) ?? 0) === 0) queue.push(pass.name);

        const sorted: Pass[] = [];
        while (queue.length > 0) {
            const name = queue.shift()!;

            sorted.push(this.passByName.get(name)!);

            const nexts = dependents.get(name) ?? [];
            for (const next of nexts) {
                const deg = (indegree.get(next) ?? 0) - 1;
                indegree.set(next, deg);
                if (deg === 0) queue.push(next);
            }
        }

        if (sorted.length !== this.passes.length) {
            const cycle = this.passes.filter(p => !sorted.includes(p)).map(p => p.name).join(', ');

            throw new Error(`MsgId: 依赖循环: ${cycle}`);
        }

        this.sortedPasses = sorted;
        return sorted;
    }

    private syncTextures(frameW: number, frameH: number): void {
        for (const [name, desc] of this.textureDescs) {
            const scale = desc.scale ?? 1;
            const width = desc.size?.[0] ?? Math.max(1, Math.floor(frameW * scale));
            const height = desc.size?.[1] ?? Math.max(1, Math.floor(frameH * scale));
            const sampleCount = desc.sampleCount ?? 1;

            const existing = this.textures.get(name);
            if (existing) {
                if (existing.width === width &&
                    existing.height === height &&
                    existing.format === desc.format &&
                    existing.sampleCount === sampleCount)
                    continue;

                existing.destroy();
                this.textures.delete(name);
            }

            this.textures.set(name, this.gpu.device.createTexture({
                size: [width, height],
                format: desc.format,
                usage: desc.usage,
                sampleCount,
                label: `intermediate:${name}`
            }));
        }
    }

    private createPassContext(encoder: GPUCommandEncoder, frame: FrameContext, pass: Pass): PassContext {
        const self = this;
        const state = this.passStates.get(pass.name) ?? {};

        return {
            encoder,
            frame,
            gpu: this.gpu,
            state,
            beginRenderPass(descriptor?: Partial<GPURenderPassDescriptor>): GPURenderPassEncoder {
                const desc = self.mergeRenderPassDescriptor(descriptor, frame);
                return encoder.beginRenderPass(desc);
            },
            beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
                return encoder.beginComputePass(descriptor);
            },
            getTexture(name: string): GPUTextureView {
                const tex = self.textures.get(name);
                if (!tex)
                    throw new Error(`MsgId: 未找到中间纹理: ${name}`);

                return tex.createView();
            },
            getTextureRaw(name: string): GPUTexture {
                const tex = self.textures.get(name);
                if (!tex)
                    throw new Error(`MsgId: 未找到中间纹理: ${name}`);

                return tex;
            }
        };
    }

    private mergeRenderPassDescriptor(
        descriptor: Optional<Partial<GPURenderPassDescriptor>>,
        frame: FrameContext
    ): GPURenderPassDescriptor {
        // 默认颜色附着
        const defaultColorAttachment: GPURenderPassColorAttachment = {
            view: frame.msaaView,
            resolveTarget: frame.msaaView === frame.colorView ? undefined : frame.colorView,
            clearValue: {r: 0, g: 0, b: 0, a: 1},
            loadOp: 'clear',
            storeOp: 'store'
        };

        // 默认深度附着
        const defaultDepthAttachment: GPURenderPassDepthStencilAttachment = {
            view: frame.depthView,
            depthClearValue: 1.0,
            depthLoadOp: 'clear',
            depthStoreOp: 'store'
        };

        const colorAttachments =
            descriptor?.colorAttachments && descriptor.colorAttachments.length > 0
                ? descriptor.colorAttachments
                : [defaultColorAttachment];

        const depthStencilAttachment =
            descriptor?.depthStencilAttachment !== undefined
                ? descriptor.depthStencilAttachment
                : defaultDepthAttachment;

        return {
            ...descriptor,
            colorAttachments,
            depthStencilAttachment
        };
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error("MsgId: PassManager 已经销毁");
    }
}
