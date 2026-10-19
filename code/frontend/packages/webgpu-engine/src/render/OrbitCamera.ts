// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file OrbitCamera.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 轨道相机：用球坐标轨道参数驱动 Camera 的位置，支持鼠标拖拽 / 滚轮缩放与阻尼插值
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { Camera, type CameraOptions } from "./Camera";
import { Console } from "@wmv/common";
import { t } from "../locales";


export interface OrbitCameraOptions extends CameraOptions {
    /** 初始轨道半径，默认 5 */
    distance?: number;
    /** 初始水平角（弧度），默认 π/4 */
    theta?: number;
    /** 初始俯仰角（弧度），默认 π/6 */
    phi?: number;
    /** 最近距离，默认 0.5 */
    minDistance?: number;
    /** 最远距离，默认 500 */
    maxDistance?: number;
    /** 俯仰角下限，默认 -π/2 + 0.1 */
    minPhi?: number;
    /** 俯仰角上限，默认 π/2 - 0.1 */
    maxPhi?: number;
    /** 阻尼系数（0~1），0 表示无阻尼，值越大收敛越慢，默认 0 */
    damping?: number;
    /** 传入 canvas 后自动绑定鼠标事件 */
    canvas?: HTMLCanvasElement;
}


/** OrbitCamera 自有选项（不含相机与 canvas）的必填化 */
type OrbitConfig = Required<Pick<OrbitCameraOptions,
    "distance" | "theta" | "phi" | "minDistance" | "maxDistance" | "minPhi" | "maxPhi" | "damping">>;


const DEFAULT_ORBIT_CAMERA_OPTIONS: OrbitConfig = {
    distance: 5,
    theta: Math.PI / 4,
    phi: Math.PI / 6,
    minDistance: 0.5,
    maxDistance: 500,
    minPhi: -Math.PI / 2 + 0.1,
    maxPhi: Math.PI / 2 - 0.1,
    damping: 0
};


/**
 * 轨道相机：鼠标拖拽改轨道角，滚轮改距离，可选阻尼插值。
 *
 * 它只维护轨道参数（theta / phi / distance）并把它算成基类的 position，
 * 矩阵计算、缓存、屏幕-世界转换全部由 Camera 负责 —— 这就是职责分离。
 *
 * 输入绑定：
 *   - mousedown 绑在 canvas 上，mousemove / mouseup 绑在 window 上（拖出画布也能收到）
 *   - wheel 绑在 canvas 上并 preventDefault，避免页面跟着滚
 *   - dispose() 会摘掉全部监听
 */
export class OrbitCamera extends Camera {
    #disposed = false;

    /** 轨道参数（当前值） */
    #theta: number;
    #phi: number;
    #distance: number;

    /** 轨道参数（阻尼插值的目标值） */
    #targetTheta: number;
    #targetPhi: number;
    #targetDistance: number;

    #minDistance: number;
    #maxDistance: number;
    #minPhi: number;
    #maxPhi: number;
    #damping: number;

    /** 拖拽状态 */
    #dragging = false;
    #lastX = 0;
    #lastY = 0;

    private canvas?: HTMLCanvasElement;

    private readonly onMouseDown = (e: MouseEvent): void => {
        this.#dragging = true;
        this.#lastX = e.clientX;
        this.#lastY = e.clientY;
    };

    private readonly onMouseMove = (e: MouseEvent): void => {
        if (!this.#dragging) return;

        const dx = e.clientX - this.#lastX;
        const dy = e.clientY - this.#lastY;
        this.#lastX = e.clientX;
        this.#lastY = e.clientY;

        this.#targetTheta -= dx * 0.01;
        this.#targetPhi = clamp(this.#targetPhi + dy * 0.01, this.#minPhi, this.#maxPhi);

        this.applyOrbitTargets();
    };

    private readonly onMouseUp = (): void => {
        this.#dragging = false;
    };

    private readonly onWheel = (e: WheelEvent): void => {
        e.preventDefault();

        const next = this.#targetDistance * (1 + e.deltaY * 0.001);
        this.#targetDistance = clamp(next, this.#minDistance, this.#maxDistance);

        this.applyOrbitTargets();
    };

    constructor(options: OrbitCameraOptions = {}) {
        super(options);

        const defaults = DEFAULT_ORBIT_CAMERA_OPTIONS;

        this.#theta = options.theta ?? defaults.theta;
        this.#phi = options.phi ?? defaults.phi;
        this.#distance = options.distance ?? defaults.distance;

        this.#targetTheta = this.#theta;
        this.#targetPhi = this.#phi;
        this.#targetDistance = this.#distance;

        this.#minDistance = options.minDistance ?? defaults.minDistance;
        this.#maxDistance = options.maxDistance ?? defaults.maxDistance;
        this.#minPhi = options.minPhi ?? defaults.minPhi;
        this.#maxPhi = options.maxPhi ?? defaults.maxPhi;
        this.#damping = options.damping ?? defaults.damping;

        this.updatePositionFromOrbit();

        if (options.canvas) this.attachCanvas(options.canvas);
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    /** 当前水平角（弧度） */
    get theta(): number {
        return this.#theta;
    }

    /** 当前俯仰角（弧度） */
    get phi(): number {
        return this.#phi;
    }

    /** 当前轨道半径 */
    get distance(): number {
        return this.#distance;
    }

    /** 轨道中心，等同基类的 target */
    get orbitTarget(): readonly [number, number, number] {
        return this.target;
    }

    /**
     * 每帧调用，把当前轨道参数向目标值插值（阻尼）。
     * Scene.update(dt) 会用 isUpdatable 判断并自动调用。
     *
     * 插值系数只由 damping 决定，不随 dt 变化；
     * damping <= 0 时不做插值（输入已经即时生效）。
     */
    update(_dt: number): void {
        this.assertAlive();

        if (this.#damping <= 0) return;

        const k = 1 - this.#damping;

        this.#theta += (this.#targetTheta - this.#theta) * k;
        this.#phi += (this.#targetPhi - this.#phi) * k;
        this.#distance += (this.#targetDistance - this.#distance) * k;

        this.updatePositionFromOrbit();
    }

    /**
     * 覆盖基类：改完目标点后反推轨道参数。
     * 否则下一次拖拽会跳回旧的 theta / phi / distance 上。
     */
    override lookAt(target: readonly [number, number, number], up?: readonly [number, number, number]): this {
        super.lookAt(target, up);

        this.syncOrbitFromView();

        return this;
    }

    /** 覆盖基类：改完视点后反推轨道参数 */
    override setView(
        position: readonly [number, number, number],
        target: readonly [number, number, number],
        up?: readonly [number, number, number]
    ): this {
        super.setView(position, target, up);

        this.syncOrbitFromView();

        return this;
    }

    /** 覆盖基类：套住包围盒后反推轨道参数，保证随后拖拽的半径正确 */
    override frameBounds(
        bounds: {
            min: readonly [number, number, number];
            max: readonly [number, number, number];
        },
        padding = 1.2
    ): this {
        super.frameBounds(bounds, padding);

        this.syncOrbitFromView();

        return this;
    }

    /** 摘掉所有 DOM 监听并标记销毁，幂等 */
    dispose(): void {
        if (this.#disposed) return;

        this.#disposed = true;

        this.detachCanvas();
    }

    /** 绑定鼠标事件。mousemove / mouseup 绑在 window 上，拖出画布也能继续转 */
    private attachCanvas(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;

        canvas.addEventListener("mousedown", this.onMouseDown);
        canvas.addEventListener("wheel", this.onWheel, {passive: false});

        window.addEventListener("mousemove", this.onMouseMove);
        window.addEventListener("mouseup", this.onMouseUp);
    }

    private detachCanvas(): void {
        this.canvas?.removeEventListener("mousedown", this.onMouseDown);
        this.canvas?.removeEventListener("wheel", this.onWheel);

        window.removeEventListener("mousemove", this.onMouseMove);
        window.removeEventListener("mouseup", this.onMouseUp);

        this.canvas = undefined;
        this.#dragging = false;
    }

    /** 按轨道参数算出相机位置并写回 position，target 即轨道中心 */
    private updatePositionFromOrbit(): void {
        const t = this.target;
        const cosPhi = Math.cos(this.#phi);

        this.position = [
            t[0] + this.#distance * cosPhi * Math.sin(this.#theta),
            t[1] + this.#distance * Math.sin(this.#phi),
            t[2] + this.#distance * cosPhi * Math.cos(this.#theta)
        ];
    }

    /** 无阻尼时把当前值立即对齐到目标值并写回 position */
    private applyOrbitTargets(): void {
        if (this.#damping > 0) return;

        this.#theta = this.#targetTheta;
        this.#phi = this.#targetPhi;
        this.#distance = this.#targetDistance;

        this.updatePositionFromOrbit();
    }

    /**
     * 用当前 position / target 反推轨道参数，并把阻尼目标值一并对齐。
     *
     * 供 lookAt / setView / frameBounds 使用：这些方法直接改写视图参数，
     * 不反推的话轨道参数会与相机实际位置脱节。
     */
    private syncOrbitFromView(): void {
        const t = this.target;
        const p = this.position;

        const dx = p[0] - t[0];
        const dy = p[1] - t[1];
        const dz = p[2] - t[2];

        const distance = Math.hypot(dx, dy, dz) || this.#minDistance;

        this.#theta = Math.atan2(dx, dz);
        this.#phi = clamp(Math.asin(clamp(dy / distance, -1, 1)), this.#minPhi, this.#maxPhi);
        this.#distance = clamp(distance, this.#minDistance, this.#maxDistance);

        this.#targetTheta = this.#theta;
        this.#targetPhi = this.#phi;
        this.#targetDistance = this.#distance;
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("OrbitCamera.assertAlive.error_1"));
    }
}


/** 把 v 夹到 [lo, hi] */
function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
}
