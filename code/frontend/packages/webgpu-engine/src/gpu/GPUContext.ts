// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file GPUContext.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/15 15:15
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Nullable } from "@wmv/common";


export interface GPUContextOptions {
    /** 目标 canvas */
    canvas: HTMLCanvasElement;

    /** 设备偏好，移动端可传 'low-power' */
    powerPreference?: GPUPowerPreference;

    /** 颜色附着的 MSAA 采样数，1 表示不开 MSAA */
    sampleCount?: 1 | 4;

    /** 深度格式，默认 depth24plus */
    depthFormat?: GPUTextureFormat;

    /** 交换链 alpha 模式，默认 opaque */
    alphaMode?: GPUCanvasAlphaMode;

    /** device 丢失时回调（例如标签页长时间后台、驱动崩溃） */
    onDeviceLost?: (info: GPUDeviceLostInfo) => void;

    /** 任意 uncaptured error 时回调 */
    onError?: (error: GPUError) => void;
}


export class GPUContext {
    #width = 0;
    #height = 0;

    #disposed = false;

    private resizeObserver?: ResizeObserver;

    private depthTexture?: GPUTexture;
    private msaaTexture?: GPUTexture;

    private constructor(
        private readonly opts: Required<Pick<GPUContextOptions, "canvas" | "sampleCount" | "depthFormat" | "alphaMode">>,
        public readonly adapter: GPUAdapter,
        public readonly device: GPUDevice,
        public readonly context: GPUCanvasContext,
        public readonly format: GPUTextureFormat
    ) {
    }

    static async create({
                            canvas,
                            powerPreference = "high-performance",
                            sampleCount = 1,
                            depthFormat = "depth24plus",
                            alphaMode = "opaque",
                            onDeviceLost,
                            onError
                        }: GPUContextOptions): Promise<GPUContext> {
        if (!navigator.gpu)
            throw new Error("MsgId: 当前浏览器不支持 WebGPU");

        const adapter = await navigator.gpu.requestAdapter({powerPreference});
        if (!adapter)
            throw new Error("MsgId: 无法获取 GPU 设备（可能硬件设备不支持/驱动不支持）");

        const device = await adapter.requestDevice();

        device.addEventListener("uncapturederror", e => {
            const err = (e as GPUUncapturedErrorEvent).error;

            console.error("MsgId: GPU 未捕获错误: ", err);

            onError?.(err);
        });

        device.lost.then(info => {
            if (device && info.reason !== "destroyed") {
                console.error("MsgId: GPU 设备丢失: ", info);

                onDeviceLost?.(info);
            }
        });

        const context = canvas.getContext("webgpu") as GPUCanvasContext;
        if (!context)
            throw new Error("MsgId: 无法获取 WebGPU 上下文");

        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format,
            alphaMode
        });

        const gpu = new GPUContext({
            canvas,
            sampleCount,
            depthFormat,
            alphaMode
        }, adapter, device, context, format);

        gpu.syncSize();
        gpu.createAttachments();
        gpu.observeResize();

        return gpu;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    get aspect() {
        return this.#height === 0 ? 1 : this.#width / this.#height;
    }

    get disposed() {
        return this.#disposed;
    }

    get options() {
        return this.opts;
    }

    resizeIfNeeded(): boolean {
        if (this.#disposed) return false;

        const changed = this.syncSize();
        if (changed) this.createAttachments();

        return changed;
    }

    getCurrentColorView(): GPUTextureView {
        this.assertAlive();

        return this.context.getCurrentTexture().createView();
    }

    getDepthView(): GPUTextureView {
        this.assertAlive();

        if (!this.depthTexture)
            throw new Error("MsgId: 深度纹理尚未创建");

        return this.depthTexture.createView();
    }

    getMsaaView(): Nullable<GPUTextureView> {
        this.assertAlive();

        return this.msaaTexture ? this.msaaTexture.createView() : null;
    }

    beginFrameAttachments(): {
        colorView: GPUTextureView;
        depthView: GPUTextureView;
        msaaView?: Nullable<GPUTextureView>;
        width: number;
        height: number;
    } {
        this.resizeIfNeeded();

        return {
            colorView: this.getCurrentColorView(),
            depthView: this.getDepthView(),
            msaaView: this.getMsaaView(),
            width: this.#width,
            height: this.#height
        };
    }

    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;

        this.resizeObserver?.disconnect();
        this.resizeObserver = undefined;

        this.depthTexture?.destroy();
        this.depthTexture = undefined;

        this.msaaTexture?.destroy();
        this.msaaTexture = undefined;

        try {
            this.context.unconfigure();
        } catch (e) {
        }

        this.device.destroy();
    }

    private syncSize(): boolean {
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.floor(this.opts.canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(this.opts.canvas.clientHeight * dpr));

        if (w === this.#width && h === this.#height && this.opts.canvas.width === w && this.opts.canvas.height === h)
            return false;

        this.#width = w;
        this.#height = h;
        this.opts.canvas.width = w;
        this.opts.canvas.height = h;

        return true;
    }

    private createAttachments(): void {
        this.depthTexture?.destroy();
        this.depthTexture = this.device.createTexture({
            size: [this.#width, this.#height],
            format: this.opts.depthFormat,
            sampleCount: this.opts.sampleCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.msaaTexture?.destroy();
        if (this.opts.sampleCount > 1)
            this.msaaTexture = this.device.createTexture({
                size: [this.#width, this.#height],
                format: this.format,
                sampleCount: this.opts.sampleCount,
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            });
        else
            this.msaaTexture = undefined;
    }

    private observeResize(): void {
        this.resizeObserver = new ResizeObserver(this.resizeIfNeeded.bind(this));

        this.resizeObserver.observe(this.opts.canvas);
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error("MsgId: 已经销毁，无法获取附着纹理");
    }

}
