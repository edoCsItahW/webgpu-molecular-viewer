// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Scene.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 场景容器：持有相机 / 灯光 / 物体 / 可更新对象，并打包场景级 uniform
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Camera } from "./Camera";
import { Light, DirectionalLight, isAmbientLight, isDirectionalLight, isHemisphereLight } from "./Light";
import type { GPUContext } from "../gpu/GPUContext";
import type { ResourceManager } from "../gpu/ResourceManager";
import type { Nullable } from "@wmv/common";


/**
 * 场景级 uniform 的 float 个数。
 *
 * 布局（必须与 WGSL 侧一致）：
 *   viewProj     : mat4x4<f32> —— 16 floats
 *   cameraPos    : vec3<f32>   ——  3 floats + 1 pad
 *   lightDir     : vec3<f32>   ——  3 floats + 1 pad
 *   lightColor   : vec3<f32>   ——  3 floats + 1 pad
 *   ambientColor : vec3<f32>   ——  3 floats + 1 pad
 * */
export const SCENE_UNIFORM_FLOATS = 32;

/** 场景级 uniform 的字节数（32 floats × 4 = 128） */
export const SCENE_UNIFORM_BYTES = SCENE_UNIFORM_FLOATS * 4;


/** 任何可以加进场景的对象。visible 由对象自己维护 */
export interface SceneObject {
    /** 可选名字，用于 findByName */
    name?: string;

    /** 可选：是否可见。默认为 true */
    visible?: boolean;

    /** 可选：释放资源。Scene.dispose 会调用 */
    dispose?(): void;
}


/** 每帧需要 update(dt) 的对象（Simulation、动画、相机阻尼……） */
export interface Updatable extends SceneObject {
    update(dt: number): void;
}


/**
 * 可渲染对象。
 *
 * Scene 只负责在每帧"打包它的 uniform"，具体 draw call 由 Pass 自己做。
 * */
export interface Renderable extends SceneObject {
    visible: boolean;

    /** 打包此对象的 uniform 数据；返回 null 表示该对象本帧不用 uniform buffer */
    packObjectUniform(): Nullable<Float32Array>;

    /** 对象持有的 uniform buffer（可能为 null） */
    readonly uniformBuffer: Nullable<GPUBuffer>;
}


export interface SceneOptions {
    /** 可选的 GPU 上下文。传入后 Scene 会创建 scene uniform buffer */
    gpu?: GPUContext;

    /** 可选的资源管理器。与 gpu 成对传入 */
    rm?: ResourceManager;

    /** 背景色（0~1）。默认深蓝灰 */
    background?: [number, number, number];
}


/**
 * 场景容器。一个 Scene 描述"这一帧要画什么、在哪画、怎么照亮"。
 *
 * 它做的事：
 *   1. 持有相机、灯光、物体、可更新对象
 *   2. 提供 add / remove / find / findByName / filter / traverse 等接口
 *   3. 持有 scene uniform buffer，并提供 packSceneUniforms 打包数据
 *   4. dispose 时级联销毁所有可销毁对象
 *
 * 它不做的事：
 *   - 不创建 pipeline / bindgroup（那是 PipelineManager / BindGroupCache 的活）
 *   - 不执行渲染（那是 Renderer 的活）
 *   - 不管资源具体是什么类型（Mesh / Simulation / 自定义对象都只是 SceneObject）
 *   - 不实现场景图与视锥剔除：分子可视化里需要剔除的对象数量是个位数，没有收益
 *
 * 设计取舍：Scene 不强依赖 GPUContext。只有需要 scene uniform buffer 时，
 * 才通过构造函数可选传入 gpu + rm；`new Scene()` 的纯 CPU 模式同样可用，
 * packSceneUniforms 返回的 Float32Array 可以在单元测试里直接断言。
 * */
export class Scene {
    /** 主相机。Renderer 每帧读它算 viewProj；为 null 时 packSceneUniforms 返回 null */
    camera: Nullable<Camera> = null;

    /** 所有光源。顺序无关，打包时按类型分派（当前 uniform 布局只容纳一盏方向光） */
    lights: Light[] = [];

    /** 背景色（0~1）。Pass 从 ctx.frame 读取 */
    background: [number, number, number];

    /**
     * 场景级 uniform buffer。
     * 由 Scene 创建并持有，Renderer 每帧 writeBuffer。
     * 未传入 gpu + rm 时为 null（纯 CPU 模式下工作）。
     * */
    sceneUniformBuffer: Nullable<GPUBuffer> = null;

    /** 所有对象。用数组保添加顺序（traverse / update / dispose 都依赖顺序稳定） */
    #objects: SceneObject[] = [];

    /** 每帧需要 update 的对象 */
    #updatables: Updatable[] = [];

    /** 可渲染对象 */
    #renderables: Renderable[] = [];

    /** scene uniform 打包缓存（每帧复用同一块内存） */
    #sceneData = new Float32Array(SCENE_UNIFORM_FLOATS);

    #disposed = false;

    /** 可选的 GPU 上下文。由构造参数或 attachGpu 注入 */
    private gpu: Nullable<GPUContext> = null;

    /** 可选的资源管理器。与 gpu 成对注入 */
    private rm: Nullable<ResourceManager> = null;

    constructor(options: SceneOptions = {}) {
        this.background = options.background ?? [0.04, 0.04, 0.08];

        if (options.gpu && options.rm) {
            this.gpu = options.gpu;
            this.rm = options.rm;
            this.createUniformBuffer();
        }
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 当前所有对象的数量 */
    get objectCount(): number {
        return this.#objects.length;
    }

    /** 可渲染对象只读列表（不暴露内部数组，防止外部改） */
    get renderables(): readonly Renderable[] {
        return this.#renderables;
    }

    /** 可更新对象只读列表 */
    get updatables(): readonly Updatable[] {
        return this.#updatables;
    }

    /**
     * 延迟绑定 GPU。
     *
     * 使用场景：
     *   - 先做纯数据建模（单元测试）
     *   - 拿到渲染器后再 attach
     *
     * 重复调用会先释放旧 buffer（如果有），避免泄漏。
     * */
    attachGpu(gpu: GPUContext, rm: ResourceManager): void {
        this.assertAlive();

        if (this.sceneUniformBuffer && this.rm) {
            this.rm.destroy(this.sceneUniformBuffer);
            this.sceneUniformBuffer = null;
        }

        this.gpu = gpu;
        this.rm = rm;
        this.createUniformBuffer();
    }

    /**
     * 添加一个或多个对象。
     * 自动判断对象是否实现 Updatable / Renderable 接口（鸭子类型），分别登记。
     * 重复添加会抛错 —— 大多数情况下这是 bug。
     * */
    add(...objects: SceneObject[]): this {
        this.assertAlive();

        for (const obj of objects) {
            if (obj == null) continue;

            if (this.#objects.includes(obj))
                throw new Error(`MsgId: 对象已存在于场景中: ${obj.name ?? "<未命名>"}`);

            this.#objects.push(obj);

            if (isUpdatable(obj)) this.#updatables.push(obj);
            if (isRenderable(obj)) this.#renderables.push(obj);
        }

        return this;
    }

    /** 移除一个对象。它会从所有内部列表中移除 */
    remove(object: SceneObject): this {
        const idx = this.#objects.indexOf(object);
        if (idx < 0) return this;

        this.#objects.splice(idx, 1);

        const ui = this.#updatables.indexOf(object as Updatable);
        if (ui >= 0) this.#updatables.splice(ui, 1);

        const ri = this.#renderables.indexOf(object as Renderable);
        if (ri >= 0) this.#renderables.splice(ri, 1);

        return this;
    }

    /** 清空所有对象。不销毁对象本身 —— 想销毁请对每个对象先调 dispose */
    clear(): void {
        this.#objects.length = 0;
        this.#updatables.length = 0;
        this.#renderables.length = 0;
    }

    /** 按名字查找第一个匹配的对象 */
    findByName<T extends SceneObject = SceneObject>(name: string): Nullable<T> {
        for (const obj of this.#objects)
            if (obj.name === name) return obj as T;

        return null;
    }

    /** 按谓词查找第一个匹配的对象 */
    find<T extends SceneObject = SceneObject>(predicate: (obj: SceneObject) => boolean): Nullable<T> {
        for (const obj of this.#objects)
            if (predicate(obj)) return obj as T;

        return null;
    }

    /** 按谓词筛选所有匹配的对象 */
    filter<T extends SceneObject = SceneObject>(predicate: (obj: SceneObject) => boolean): T[] {
        const out: T[] = [];

        for (const obj of this.#objects)
            if (predicate(obj)) out.push(obj as T);

        return out;
    }

    /**
     * 遍历所有对象。
     * 遍历的是"遍历开始时刻"的快照，所以回调里 add / remove 是安全的。
     * */
    traverse(fn: (obj: SceneObject) => void): void {
        const snapshot = [...this.#objects];

        for (const obj of snapshot) fn(obj);
    }

    /**
     * 触发所有 updatables 的 update(dt)。
     *
     * 顺序：相机最先（阻尼、惯性的时间敏感，本帧的 viewProj 必须是平滑后的），
     * 其余按添加顺序。
     * */
    update(dt: number): void {
        const cam = this.camera;
        const camUpdatable: Nullable<Updatable> = cam && isUpdatable(cam) ? cam : null;

        camUpdatable?.update(dt);

        // 相机已在上方更新过，循环里跳过它，避免重复调用
        for (const obj of this.#updatables) {
            if (obj === camUpdatable) continue;

            obj.update(dt);
        }
    }

    /**
     * 打包场景级 uniform。
     *
     * 布局（与 SCENE_UNIFORM_FLOATS 一致）：
     *   0  ~ 15 : viewProj
     *   16 ~ 18 : cameraPos.xyz
     *   19      : pad
     *   20 ~ 22 : lightDir.xyz
     *   23      : pad
     *   24 ~ 26 : lightColor.rgb
     *   27      : pad
     *   28 ~ 30 : ambientColor.rgb
     *   31      : pad
     *
     * 灯光按类型分派：
     *   ambientColor = 所有 AmbientLight 的 color * intensity 之和，
     *                  加上 HemisphereLight 的"天空色 + 地面色"均值；
     *   lightDir / lightColor = 第一盏启用的 DirectionalLight 的方向与 color * intensity。
     *
     * 返回 null 表示当前场景没有相机，Renderer 应跳过本帧绘制。
     * */
    packSceneUniforms(aspect: number): Nullable<Float32Array> {
        const cam = this.camera;
        if (!cam) return null;

        const d = this.#sceneData;

        // viewProj
        d.set(cam.viewProjectionMatrix(aspect), 0);

        // cameraPos
        const pos = cam.position;
        d[16] = pos[0];
        d[17] = pos[1];
        d[18] = pos[2];
        d[19] = 0;

        // 累加环境光 + 半球光
        let ambR = 0, ambG = 0, ambB = 0;
        let dirLight: Nullable<DirectionalLight> = null;

        for (const light of this.lights) {
            if (!light.enabled) continue;

            if (isDirectionalLight(light)) {
                if (!dirLight) dirLight = light;
            } else if (isAmbientLight(light)) {
                ambR += light.color[0] * light.intensity;
                ambG += light.color[1] * light.intensity;
                ambB += light.color[2] * light.intensity;
            } else if (isHemisphereLight(light)) {
                // 半球光近似为"天空 + 地面"的均值
                ambR += (light.skyColor[0] + light.groundColor[0]) * 0.5 * light.intensity;
                ambG += (light.skyColor[1] + light.groundColor[1]) * 0.5 * light.intensity;
                ambB += (light.skyColor[2] + light.groundColor[2]) * 0.5 * light.intensity;
            }
        }

        // 方向光
        if (dirLight) {
            d[20] = dirLight.direction[0];
            d[21] = dirLight.direction[1];
            d[22] = dirLight.direction[2];
            d[23] = 0;

            d[24] = dirLight.color[0] * dirLight.intensity;
            d[25] = dirLight.color[1] * dirLight.intensity;
            d[26] = dirLight.color[2] * dirLight.intensity;
            d[27] = 0;
        } else {
            d[20] = 0; d[21] = 1; d[22] = 0; d[23] = 0;
            d[24] = 0; d[25] = 0; d[26] = 0; d[27] = 0;
        }

        // 环境光
        d[28] = ambR;
        d[29] = ambG;
        d[30] = ambB;
        d[31] = 0;

        return d;
    }

    /**
     * 释放场景资源。幂等。
     *
     * @param options.keepObjects 为 true 时只清空列表，不销毁对象
     *                            （场景切换时复用旧 mesh 用这个）。默认 false，级联 dispose。
     * */
    dispose(options: { keepObjects?: boolean } = {}): void {
        if (this.#disposed) return;

        if (!options.keepObjects)
            for (const obj of this.#objects)
                obj.dispose?.();

        this.#objects.length = 0;
        this.#updatables.length = 0;
        this.#renderables.length = 0;
        this.lights.length = 0;
        this.camera = null;

        if (this.sceneUniformBuffer && this.rm) {
            this.rm.destroy(this.sceneUniformBuffer);
            this.sceneUniformBuffer = null;
        }

        this.#disposed = true;
    }

    private createUniformBuffer(): void {
        if (!this.gpu || !this.rm) return;

        this.sceneUniformBuffer = this.rm.create("uniform-buffer", SCENE_UNIFORM_BYTES, "scene:uniforms");
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error("MsgId: Scene 已经销毁");
    }
}


/** 鸭子类型判定：有 update(dt) 即视为 Updatable */
function isUpdatable(obj: unknown): obj is Updatable {
    return typeof obj === "object" &&
        obj !== null &&
        typeof (obj as { update?: unknown }).update === "function";
}


/** 鸭子类型判定：有 packObjectUniform() 即视为 Renderable */
function isRenderable(obj: unknown): obj is Renderable {
    return typeof obj === "object" &&
        obj !== null &&
        typeof (obj as { packObjectUniform?: unknown }).packObjectUniform === "function";
}
