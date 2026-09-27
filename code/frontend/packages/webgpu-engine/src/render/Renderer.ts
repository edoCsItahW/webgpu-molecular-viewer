// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Renderer.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 帧渲染编排层：组合 GPU 子模块，按 更新 → 上传 uniform → 执行 pass 的顺序驱动一帧
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {GPUContext} from "../gpu/GPUContext";
import type {GPUContextOptions} from "../gpu/GPUContext";
import {ResourceManager} from "../gpu/ResourceManager";
import {ShaderLibrary} from "../gpu/ShaderLibrary";
import {PipelineManager} from "../gpu/PipelineManager";
import {BindGroupCache} from "../gpu/BindGroupCache";
import {PassManager} from "../gpu/PassManager";
import * as builtinShaders from "./shaders";
import {PBRPass} from "./passes/PBRPass";
import {PickingPass} from "./passes/PickingPass";
import {SSAOPass} from "./passes/SSAOPass";
import type {Scene} from "./Scene";
import type {FrameStats} from "./FrameStats";
import type {Nullable} from "@wmv/common";


export interface RendererOptions {
    /**
     * 是否开启帧耗时统计。
     * 默认 true，用 performance.now() 采样 CPU 帧时间。
     */
    enableStats?: boolean;

    /**
     * 是否尝试用 WebGPU timestamp-query 测量 GPU 帧时间。
     * 需要 adapter 支持 'timestamp-query' feature，默认 false。
     * 具体实现交给 PassManager 的 profilePasses / 专用 GpuTimer，Renderer 不展开。
     */
    enableGpuTiming?: boolean;

    /**
     * 是否启用屏幕空间环境光遮蔽（SSAO）pass。
     * 默认 false —— 见 registerPasses 的说明：开启后还需一个 CompositePass
     * 把 ssao 合成回屏幕，那部分 passes.md §五 未展开。
     */
    ssao?: boolean;

    /**
     * 是否启用拾取（Picking）pass。
     * 默认 false。开启后才有 picking pass 与 onPick 回调。
     */
    picking?: boolean;

    /**
     * 每帧结束的回调，用于 profiler / 状态栏。
     * 不要在这里做重活，它跑在帧循环里。
     */
    onFrame?: (stats: FrameStats) => void;

    /**
     * 帧前回调。此时附着纹理已就绪、uniform 尚未上传。
     * 适合插入自定义的 buffer 上传逻辑。
     */
    onBeforeFrame?: (ctx: RendererFrameContext) => void;

    /**
     * 帧后回调。此时所有 pass 已提交。
     * 适合读时间戳、做异步回读。
     */
    onAfterFrame?: (ctx: RendererFrameContext) => void;
}


/** 每帧传给外部 hook 的上下文 */
export interface RendererFrameContext {
    /** 当前帧号，从 0 开始 */
    frameIndex: number;
    /** 距上一帧的秒数，首帧为 0 */
    deltaTime: number;
    /** 当前物理宽度（canvas 像素） */
    width: number;
    /** 当前物理高度（canvas 像素） */
    height: number;
    /** 当前场景 */
    scene: Scene;
}


/** 补齐默认值后的渲染器选项 */
type ResolvedRendererOptions =
    Required<Pick<RendererOptions, "enableStats" | "enableGpuTiming" | "ssao" | "picking">> & RendererOptions;


const DEFAULT_RENDERER_OPTIONS: Required<Pick<RendererOptions, "enableStats" | "enableGpuTiming" | "ssao" | "picking">> = {
    enableStats: true,
    enableGpuTiming: false,
    ssao: false,
    picking: false
};


/** CPU 帧时间的近似滑动窗口长度（帧），120 帧 ≈ 2 秒 */
const FRAME_SAMPLE_WINDOW = 120;


export class Renderer {
    /** GPU 上下文（一个 canvas 一个实例） */
    readonly gpu: GPUContext;

    /** 资源管理器：buffer / texture / sampler 的创建与释放 */
    readonly rm: ResourceManager;

    /** shader 库：WGSL 注册与编译缓存 */
    readonly shaders: ShaderLibrary;

    /** 管线管理器：bindGroupLayout / pipelineLayout / pipeline 缓存 */
    readonly pm: PipelineManager;

    /** bindgroup 缓存 */
    readonly bg: BindGroupCache;

    /** pass 管理器：负责 pass 顺序与命令提交 */
    readonly passes: PassManager;

    #scene: Nullable<Scene> = null;

    #frameIndex = 0;

    /** 上一帧时间戳（毫秒），0 表示还没有基准 */
    #lastFrameTime = 0;

    /** raf 句柄，null 表示未在循环中 */
    #rafId: Nullable<number> = null;

    #disposed = false;

    /** 滑动的帧耗时累加值 */
    #frameTimeMs = 0;

    /** 当前窗口内的样本数 */
    #frameTimeSamples = 0;

    /** 最近一帧的 CPU 耗时 */
    #lastCpuFrameMs = 0;

    /** 本渲染器装配出来的 pass，dispose 时逐个释放 */
    #createdPasses: Array<{dispose(): void;}> = [];

    /** pass 当前是为哪个 scene 装配的。null 表示还没装配过 */
    #passesScene: Nullable<Scene> = null;

    /** picking pass 的引用，用于按需请求拾取 */
    #pickingPass: Nullable<PickingPass> = null;

    /** 上层注册的拾取回调 */
    #onPickCallbacks: Array<(info: {id: number; screenX: number; screenY: number;}) => void> = [];

    private readonly opts: ResolvedRendererOptions;


    /**
     * 组装渲染器。
     *
     * 传入的 GPUContext 必须已初始化完成 —— 这一点由 GPUContext 自身保证：
     * 它的构造函数是私有的，实例只能来自 `await GPUContext.create(...)`。
     * 因此这里公开构造，允许与其它使用者共享同一个 GPUContext
     * （例如 Vue 层的 useRenderer 先建 GPUContext 再建 Renderer）。
     * 只想要"一步到位"时用 `Renderer.create(canvas, ...)` 更省事。
     */
    constructor(gpu: GPUContext, options: RendererOptions = {}) {
        this.gpu = gpu;
        this.opts = {
            enableStats: options.enableStats ?? DEFAULT_RENDERER_OPTIONS.enableStats,
            enableGpuTiming: options.enableGpuTiming ?? DEFAULT_RENDERER_OPTIONS.enableGpuTiming,
            ssao: options.ssao ?? DEFAULT_RENDERER_OPTIONS.ssao,
            picking: options.picking ?? DEFAULT_RENDERER_OPTIONS.picking,
            onFrame: options.onFrame,
            onBeforeFrame: options.onBeforeFrame,
            onAfterFrame: options.onAfterFrame
        };

        this.rm = new ResourceManager(gpu, {warnOnLeak: false});
        this.shaders = new ShaderLibrary(gpu, {verbose: false});
        this.pm = new PipelineManager(gpu, {verbose: false});
        this.bg = new BindGroupCache(gpu, {verbose: false});
        this.passes = new PassManager(gpu, {profilePasses: false, warnOnLeak: true});

        // 顺序不能反：pass 构造时会 compile('pbr' | 'picking' | 'ssao')，
        // 源码必须先注册进 ShaderLibrary，否则 compile 会抛"未注册的shader"。
        // 注意：pass 本身要等 scene 就位后装配，见 ensurePasses()。
        this.registerBuiltinShaders();
    }

    /**
     * 异步工厂：初始化 WebGPU 并组装渲染器。
     *
     * ```ts
     * const renderer = await Renderer.create(canvas, {sampleCount: 4});
     * ```
     */
    static async create(
        canvas: HTMLCanvasElement,
        gpuOptions?: Omit<GPUContextOptions, "canvas">,
        rendererOptions?: RendererOptions
    ): Promise<Renderer> {
        const gpu = await GPUContext.create({canvas, ...gpuOptions});

        return new Renderer(gpu, rendererOptions);
    }

    /** 是否正在帧循环中 */
    get isRunning(): boolean {
        return this.#rafId !== null;
    }

    /** 当前场景 */
    get scene(): Nullable<Scene> {
        return this.#scene;
    }

    /** 最近一帧的 CPU 耗时（毫秒） */
    get lastCpuFrameMs(): number {
        return this.#lastCpuFrameMs;
    }

    /** 最近 120 帧的近似滑动平均帧时间（毫秒），无样本时为 0 */
    get averageFrameMs(): number {
        return this.#frameTimeSamples === 0 ? 0 : this.#frameTimeMs / this.#frameTimeSamples;
    }

    /** 帧号，从 0 开始 */
    get frameIndex(): number {
        return this.#frameIndex;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /**
     * 启动帧循环。
     * 已在运行时再次调用只替换 scene，不重开循环。
     *
     * pass 是**跟着 scene 一起装配**的（三个 pass 的 bindgroup 都要绑到
     * `scene.sceneUniformBuffer` 上，所以 scene 必须先就位），
     * 换 scene 时会重建 pass 并释放旧的。
     */
    start(scene: Scene): void {
        this.assertAlive();

        this.#scene = scene;
        this.ensurePasses(scene);

        if (this.#rafId !== null) return;

        this.#lastFrameTime = 0;

        const loop = (): void => {
            this.#rafId = requestAnimationFrame(loop);
            this.renderOneFrame();
        };

        this.#rafId = requestAnimationFrame(loop);
    }

    /** 暂停帧循环。资源保留，可 resume */
    stop(): void {
        if (this.#rafId === null) return;

        cancelAnimationFrame(this.#rafId);
        this.#rafId = null;
    }

    /** 恢复帧循环，要求先前已设置过 scene */
    resume(): void {
        if (this.#scene) this.start(this.#scene);
    }

    /**
     * 手动渲染一帧，不进入循环。
     * 用于截图、单步调试、自动化测试。
     */
    step(scene?: Scene): void {
        this.assertAlive();

        if (scene) this.#scene = scene;
        if (!this.#scene) throw new Error("MsgId: step() 时 scene 为空");

        this.ensurePasses(this.#scene);

        this.renderOneFrame();
    }

    /**
     * 注册拾取回调。
     *
     * engine 层只报 `{id, screenX, screenY}`，不知道 id 是第几个原子 ——
     * 把 id 映射成原子索引是 molecule 层的事（design.md §7 的数据流）。
     * 需要构造时开启 `picking` 选项，否则永远不会有回调。
     */
    onPick(callback: (info: {id: number; screenX: number; screenY: number;}) => void): void {
        this.#onPickCallbacks.push(callback);
    }

    /**
     * 请求拾取某个屏幕像素（物理像素坐标，非 CSS 像素）。
     * 由 viewport 层的点击事件调用；结果在之后的某一帧通过 onPick 回调返回。
     * 未开启 picking 时是空操作。
     */
    requestPick(screenX: number, screenY: number): void {
        this.#pickingPass?.requestPick(screenX, screenY);
    }

    /**
     * 释放渲染器自身持有的全部资源。
     *
     * 顺序从依赖最深的到最浅的：passes → bg → pm → shaders → rm → gpu，
     * 反过来的话 pass 里可能还持有已销毁纹理的引用。
     *
     * 不释放 scene 里的对象 —— scene 可能被复用，由调用方决定何时销毁。
     */
    dispose(): void {
        if (this.#disposed) return;

        this.stop();

        // 0. pass 自己可能持有 pipeline / bindgroup 引用
        for (const pass of this.#createdPasses)
            pass.dispose();

        this.#createdPasses = [];
        this.#pickingPass = null;
        this.#passesScene = null;
        this.#onPickCallbacks = [];

        // 1. 中间纹理可能被 bindgroup 引用
        this.passes.dispose();

        // 2. bindgroup 引用 pipelineLayout
        this.bg.dispose();

        // 3. pipeline 引用 shader module
        this.pm.dispose();

        // 4. shader 只持有源码与 module
        this.shaders.dispose();

        // 5. buffer / texture / sampler
        this.rm.disposeAll();

        // 6. 底座
        this.gpu.dispose();

        this.#disposed = true;
    }

    /** 串起一帧：更新 → 附着 → uniform → pass → 统计 */
    private renderOneFrame(): void {
        const scene = this.#scene;
        if (!scene) return;

        const t0 = performance.now();

        const dt = this.#lastFrameTime === 0 ? 0 : (t0 - this.#lastFrameTime) / 1000;
        this.#lastFrameTime = t0;

        // ---- 1. 场景更新（相机阻尼、仿真、动画） ----
        this.updateScene(scene, dt);

        // ---- 2. 本帧附着纹理（内含 resize 检测） ----
        const attachments = this.gpu.beginFrameAttachments();

        // ---- 3. 帧上下文 + 帧前 hook ----
        const frameCtx: RendererFrameContext = {
            frameIndex: this.#frameIndex,
            deltaTime: dt,
            width: attachments.width,
            height: attachments.height,
            scene
        };
        this.opts.onBeforeFrame?.(frameCtx);

        // ---- 4. 上传场景级与对象级 uniform ----
        this.uploadUniforms(scene, attachments.width, attachments.height);

        // ---- 5. 交给 PassManager 执行并提交 ----
        this.passes.execute({
            colorView: attachments.colorView,
            depthView: attachments.depthView,
            msaaView: attachments.msaaView,
            width: attachments.width,
            height: attachments.height,
            deltaTime: dt
        });

        // ---- 6. 帧后 hook ----
        this.opts.onAfterFrame?.(frameCtx);

        // ---- 7. CPU 帧耗时统计 ----
        const cpuMs = performance.now() - t0;
        this.#lastCpuFrameMs = cpuMs;

        if (this.opts.enableStats) {
            this.#frameTimeMs += cpuMs;
            this.#frameTimeSamples++;

            // 近似的滑动平均：超出窗口就把当前均值当作一个样本剔除，O(1)
            if (this.#frameTimeSamples > FRAME_SAMPLE_WINDOW) {
                this.#frameTimeMs -= this.#frameTimeMs / this.#frameTimeSamples;
                this.#frameTimeSamples--;
            }
        }

        // ---- 8. 帧回调 ----
        this.opts.onFrame?.({
            frameIndex: this.#frameIndex,
            deltaTime: dt,
            cpuMs,
            averageCpuMs: this.averageFrameMs,
            isRunning: this.isRunning
        });

        this.#frameIndex++;
    }

    /**
     * 触发场景自身的每帧更新。
     * 相机阻尼、Simulation、动画都挂在 scene.updatables 上，
     * 由 Scene.update 统一分发（它会让相机先行，并避免相机被重复 update）。
     */
    private updateScene(scene: Scene, dt: number): void {
        scene.update(dt);
    }

    /**
     * 上传场景级 uniform 与每个可渲染对象的对象级 uniform。
     * 只负责写 buffer，buffer 由对象的构造阶段创建。
     */
    private uploadUniforms(scene: Scene, width: number, height: number): void {
        const aspect = height === 0 ? 1 : width / height;

        const sceneData = scene.packSceneUniforms(aspect);
        if (sceneData && scene.sceneUniformBuffer)
            this.rm.writeBuffer(scene.sceneUniformBuffer, sceneData);

        for (const obj of scene.renderables) {
            if (!obj.visible) continue;

            const data = obj.packObjectUniform();
            if (data && obj.uniformBuffer)
                this.rm.writeBuffer(obj.uniformBuffer, data);
        }
    }

    /** 注册引擎内置 WGSL（common/* 与 pbr / picking / ssao 三条管线） */
    private registerBuiltinShaders(): void {
        builtinShaders.registerBuiltinShaders(this.shaders);
    }

    /**
     * 确保 pass 已按当前 scene 装配。
     *
     * 三个 pass 在**构造时**就要把 `scene.sceneUniformBuffer` 绑进 bindgroup，
     * 所以装配时机是"第一次 start / step 拿到 scene 时"，而不是 Renderer 构造时
     * —— 那时还没有任何 scene。
     * 换 scene 意味着换 uniform buffer，必须重建 pass，否则 bindgroup 会一直指向旧 buffer。
     */
    private ensurePasses(scene: Scene): void {
        if (this.#passesScene === scene) return;

        if (!scene.sceneUniformBuffer)
            throw new Error(
                "MsgId: 渲染前必须先把 GPU 交给 Scene（new Scene({gpu, rm}) 或 scene.attachGpu(gpu, rm)）"
            );

        for (const pass of this.#createdPasses)
            pass.dispose();

        this.#createdPasses = [];
        this.#pickingPass = null;

        // 旧 pass 已移除，注册表也要清干净（名字不允许重复）
        for (const name of this.passes.listPassNames())
            this.passes.remove(name);

        this.registerPasses();
        this.#passesScene = scene;
    }

    /**
     * 装配三个内置 pass：PBR 必装，SSAO / Picking 按选项开启。
     *
     * 中间纹理只按名字声明，pass 按名字取用，实际的创建与尺寸重建由 PassManager 惰性完成。
     *
     * 与 passes.md §五 的两点差异（都是有意的）：
     *   1. `scene-color` 与 `depth` 只在开启 SSAO 时声明 —— 它们只有 SSAOPass 会读，
     *      无条件声明会让 PassManager 每帧白建两张全分辨率纹理。
     *   2. `depth` 的格式取 `gpu.options.depthFormat` 而不是写死 'depth24plus'，
     *      避免 GPUContext 换了深度格式后这里漂移（同 PipelineManager 的自动填充理由）。
     *
     * 注意：PBR 只在 `targetTexture === null` 时直接写屏幕。开启 SSAO 后 PBR 改写到
     * scene-color，而"把 ssao 与 scene-color 合成回屏幕"还需要一个 CompositePass ——
     * passes.md §五 明确说当前不展开它，所以 SSAO 默认关闭。
     */
    private registerPasses(): void {
        const useSsao = this.opts.ssao;
        const usePicking = this.opts.picking;

        if (useSsao) {
            this.passes.declareTexture("scene-color", {
                format: this.gpu.format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });

            this.passes.declareTexture("depth", {
                format: this.gpu.options.depthFormat,
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });

            this.passes.declareTexture("ssao", {
                format: "r8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
                scale: 0.5
            });
        }

        if (usePicking)
            this.passes.declareTexture("pick-id", {
                format: "r32uint",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
            });

        // updateUniforms: false —— scene / object 的 uniform 已由 Renderer.uploadUniforms
        // 每帧上传（Render.md 的分工），pass 再写一遍是重复劳动。
        const pbrPass = new PBRPass(this, {
            targetTexture: useSsao ? "scene-color" : null,
            updateUniforms: false
        });
        this.passes.add(pbrPass);
        this.#createdPasses.push(pbrPass);

        if (useSsao) {
            const ssaoPass = new SSAOPass(this, {
                depthTexture: "depth",
                outputTexture: "ssao",
                radius: 0.6,
                intensity: 0.9
            });

            this.passes.add(ssaoPass);
            this.#createdPasses.push(ssaoPass);
        }

        if (usePicking) {
            const pickingPass = new PickingPass(this, {
                textureName: "pick-id",
                onPick: info => {
                    for (const callback of this.#onPickCallbacks)
                        callback(info);
                }
            });

            this.passes.add(pickingPass);
            this.#createdPasses.push(pickingPass);
            this.#pickingPass = pickingPass;
        }
    }

    private assertAlive(): void {
        if (this.#disposed) throw new Error("MsgId: 已经销毁，无法继续渲染");
    }
}
