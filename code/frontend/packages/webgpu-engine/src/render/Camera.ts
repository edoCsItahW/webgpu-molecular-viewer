// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file Camera.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 通用相机：把视图参数与投影参数打包成 view / proj / viewProj 矩阵，并提供屏幕-世界坐标互转
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { Nullable } from "@wmv/common";
import { mat4Invert, mat4LookAt, mat4Multiply, mat4Orthographic, mat4Perspective } from "@wmv/mathematical";


/** 透视投影参数 */
export interface PerspectiveProjection {
    type: "perspective";
    /** 垂直视场角，弧度 */
    fov: number;
    /** 近裁剪面 */
    near: number;
    /** 远裁剪面 */
    far: number;
}


/** 正交投影参数 */
export interface OrthographicProjection {
    type: "orthographic";
    /** 正交视口半高（世界单位），宽度由 aspect 推出 */
    size: number;
    /** 近裁剪面 */
    near: number;
    /** 远裁剪面 */
    far: number;
}


/**
 * 投影参数的判别联合。
 *
 * 切换投影时重建整个对象，避免出现“一半是透视参数、一半是正交参数”的状态；
 * 判别字段让 TS 能收窄出 fov 或 size 一定存在。
 */
export type Projection = PerspectiveProjection | OrthographicProjection;


/** 屏幕-世界转换用的视口尺寸（像素） */
export interface Viewport {
    width: number;
    height: number;
}


/** 屏幕点 → 世界射线的结果 */
export interface Ray {
    origin: [number, number, number];
    /** 单位方向向量 */
    direction: [number, number, number];
}


export interface CameraOptions {
    /** 初始位置，默认 [0, 0, 5] */
    position?: [number, number, number];
    /** 初始目标，默认 [0, 0, 0] */
    target?: [number, number, number];
    /** 初始上方向，默认 [0, 1, 0] */
    up?: [number, number, number];
    /** 初始投影，默认透视：fov=45°，near=0.1，far=1000 */
    projection?: Projection;
}


const DEFAULT_CAMERA_OPTIONS: Required<CameraOptions> = {
    position: [0, 0, 5],
    target: [0, 0, 0],
    up: [0, 1, 0],
    projection: {
        type: "perspective",
        fov: Math.PI / 4,
        near: 0.1,
        far: 1000
    }
};


/**
 * 通用相机：视图变换 + 投影变换。
 *
 * 职责：
 *   1. 持有视图参数（position / target / up）
 *   2. 持有投影参数（透视或正交的判别联合）
 *   3. 按需计算并缓存 view / proj / viewProj 矩阵（脏标记 + aspect）
 *   4. 提供屏幕-世界坐标互转（CPU 拾取、原子标签）
 *
 * 边界：
 *   - 不处理输入事件，交互是策略，交给 OrbitCamera 等子类
 *   - 不持有宽高比，aspect 由调用方按视口传入（同一相机可用于主视图 + 缩略图）
 *   - 是纯数学对象，不依赖 GPU
 *
 * 约定：
 *   - 右手坐标系、列主序 mat4
 *   - 投影矩阵遵循 WebGPU 的 NDC，Z∈[0,1]（与 OpenGL 的 [-1,1] 不同）；
 *     若矩阵要交给别的后端，需要自行转换 Z 范围
 */
export class Camera {
    #position: [number, number, number];
    #target: [number, number, number];
    #up: [number, number, number];

    #projection: Projection;

    /** 视图矩阵缓存，视图参数变化时置 null */
    #viewMatrix: Nullable<Float32Array> = null;

    /** 投影矩阵缓存，投影参数或 aspect 变化时置 null */
    #projMatrix: Nullable<Float32Array> = null;

    /** #projMatrix 对应的 aspect */
    #projAspect = -1;

    /** viewProj 缓存，任一上游变化时置 null */
    #viewProjMatrix: Nullable<Float32Array> = null;

    /** #viewProjMatrix 对应的 aspect */
    #viewProjAspect = -1;

    constructor(options: CameraOptions = {}) {
        this.#position = copyVec3(options.position ?? DEFAULT_CAMERA_OPTIONS.position);
        this.#target = copyVec3(options.target ?? DEFAULT_CAMERA_OPTIONS.target);
        this.#up = copyVec3(options.up ?? DEFAULT_CAMERA_OPTIONS.up);
        this.#projection = copyProjection(options.projection ?? DEFAULT_CAMERA_OPTIONS.projection);
    }

    /** 相机世界坐标。返回内部数组，只读使用 */
    get position(): readonly [number, number, number] {
        return this.#position;
    }
    set position(p: readonly [number, number, number]) {
        this.#position[0] = p[0];
        this.#position[1] = p[1];
        this.#position[2] = p[2];

        this.invalidateView();
    }

    /** 相机看向的目标点。返回内部数组，只读使用 */
    get target(): readonly [number, number, number] {
        return this.#target;
    }
    set target(t: readonly [number, number, number]) {
        this.#target[0] = t[0];
        this.#target[1] = t[1];
        this.#target[2] = t[2];

        this.invalidateView();
    }

    /** 上方向，一般保持 [0, 1, 0]。返回内部数组，只读使用 */
    get up(): readonly [number, number, number] {
        return this.#up;
    }
    set up(u: readonly [number, number, number]) {
        this.#up[0] = u[0];
        this.#up[1] = u[1];
        this.#up[2] = u[2];

        this.invalidateView();
    }

    /** 投影参数，返回内部对象，只读使用 */
    get projection(): Readonly<Projection> {
        return this.#projection;
    }
    set projection(p: Projection) {
        this.#projection = copyProjection(p);

        this.invalidateProjection();
    }

    /**
     * 让相机看向某个点。
     * 不改变相机位置，只改 target。
     */
    lookAt(target: readonly [number, number, number], up?: readonly [number, number, number]): this {
        this.target = target;
        if (up) this.up = up;

        return this;
    }

    /** 把相机放到某个位置，并看向某个目标 */
    setView(
        position: readonly [number, number, number],
        target: readonly [number, number, number],
        up?: readonly [number, number, number]
    ): this {
        this.position = position;
        this.target = target;
        if (up) this.up = up;

        return this;
    }

    /**
     * 把相机放到能完整看到某个包围盒的位置。
     *
     * 用包围球半径（旋转无关，视角怎么转距离都不变）：
     *   1. 目标设为包围盒中心
     *   2. 沿当前视线方向把相机推到“包围球刚好放下”的距离
     *
     * 透视时距离 = radius / tan(fov / 2)；
     * 正交时按半径改 size，距离取 radius * 4 只是为了避免被近裁剪面切掉。
     *
     * @param bounds 包围盒
     * @param padding 余量系数，默认 1.2
     */
    frameBounds(
        bounds: {
            min: readonly [number, number, number];
            max: readonly [number, number, number];
        },
        padding = 1.2
    ): this {
        const cx = (bounds.min[0] + bounds.max[0]) / 2;
        const cy = (bounds.min[1] + bounds.max[1]) / 2;
        const cz = (bounds.min[2] + bounds.max[2]) / 2;

        const dx = bounds.max[0] - bounds.min[0];
        const dy = bounds.max[1] - bounds.min[1];
        const dz = bounds.max[2] - bounds.min[2];
        const radius = Math.hypot(dx, dy, dz) / 2 * padding;

        // 当前视线方向（从相机指向目标）
        const fx = this.#target[0] - this.#position[0];
        const fy = this.#target[1] - this.#position[1];
        const fz = this.#target[2] - this.#position[2];
        const flen = Math.hypot(fx, fy, fz) || 1;
        const dirX = fx / flen;
        const dirY = fy / flen;
        const dirZ = fz / flen;

        const projection = this.#projection;
        let distance: number;

        if (projection.type === "perspective") {
            distance = radius / Math.tan(projection.fov / 2);
        } else {
            this.#projection = {
                type: "orthographic",
                size: radius,
                near: projection.near,
                far: projection.far
            };
            this.invalidateProjection();

            distance = radius * 4;
        }

        this.position = [cx - dirX * distance, cy - dirY * distance, cz - dirZ * distance];
        this.target = [cx, cy, cz];

        return this;
    }

    /**
     * 前方向（单位向量，指向 target）。
     * 不传 out 时返回新数组，热路径请自行传 out 复用。
     */
    getForward(out?: [number, number, number]): [number, number, number] {
        const o = out ?? [0, 0, 0];

        o[0] = this.#target[0] - this.#position[0];
        o[1] = this.#target[1] - this.#position[1];
        o[2] = this.#target[2] - this.#position[2];

        const len = Math.hypot(o[0], o[1], o[2]) || 1;
        o[0] /= len;
        o[1] /= len;
        o[2] /= len;

        return o;
    }

    /**
     * 右方向（单位向量），由 forward × up 得到。
     * 不传 out 时返回新数组。
     */
    getRight(out?: [number, number, number]): [number, number, number] {
        const f = this.getForward();
        const u = this.#up;
        const o = out ?? [0, 0, 0];

        o[0] = f[1] * u[2] - f[2] * u[1];
        o[1] = f[2] * u[0] - f[0] * u[2];
        o[2] = f[0] * u[1] - f[1] * u[0];

        const len = Math.hypot(o[0], o[1], o[2]) || 1;
        o[0] /= len;
        o[1] /= len;
        o[2] /= len;

        return o;
    }

    /** 沿前方向平移 distance，distance 为负表示后退。target 同向移动，视角不变 */
    moveForward(distance: number): this {
        const f = this.getForward();

        this.position = [
            this.#position[0] + f[0] * distance,
            this.#position[1] + f[1] * distance,
            this.#position[2] + f[2] * distance
        ];
        this.target = [
            this.#target[0] + f[0] * distance,
            this.#target[1] + f[1] * distance,
            this.#target[2] + f[2] * distance
        ];

        return this;
    }

    /** 沿右方向平移 */
    moveRight(distance: number): this {
        const r = this.getRight();

        this.position = [
            this.#position[0] + r[0] * distance,
            this.#position[1] + r[1] * distance,
            this.#position[2] + r[2] * distance
        ];
        this.target = [
            this.#target[0] + r[0] * distance,
            this.#target[1] + r[1] * distance,
            this.#target[2] + r[2] * distance
        ];

        return this;
    }

    /** 视图矩阵。首次调用或视图参数变化后重算，否则返回缓存 */
    viewMatrix(): Float32Array {
        if (this.#viewMatrix) return this.#viewMatrix;

        const matrix = mat4LookAt(this.#position, this.#target, this.#up);
        this.#viewMatrix = matrix;

        return matrix;
    }

    /** 投影矩阵。投影参数或 aspect 变化时重算 */
    projectionMatrix(aspect: number): Float32Array {
        if (this.#projMatrix && this.#projAspect === aspect) return this.#projMatrix;

        const p = this.#projection;
        let matrix: Float32Array;

        if (p.type === "perspective") {
            matrix = mat4Perspective(p.fov, aspect, p.near, p.far);
        } else {
            const h = p.size;
            const w = h * aspect;

            matrix = mat4Orthographic(-w, w, -h, h, p.near, p.far);
        }

        this.#projMatrix = matrix;
        this.#projAspect = aspect;
        // viewProj 依赖 proj，一并失效
        this.#viewProjMatrix = null;
        this.#viewProjAspect = -1;

        return matrix;
    }

    /** viewProj = proj * view。与 Scene.packSceneUniforms 配合使用 */
    viewProjectionMatrix(aspect: number): Float32Array {
        if (this.#viewProjMatrix && this.#viewProjAspect === aspect) return this.#viewProjMatrix;

        const matrix = mat4Multiply(this.projectionMatrix(aspect), this.viewMatrix());
        this.#viewProjMatrix = matrix;
        this.#viewProjAspect = aspect;

        return matrix;
    }

    /**
     * 屏幕坐标 → 世界射线。
     *
     * 用途：GPU 拾取不可用时的 CPU 拾取、鼠标悬浮射线检测。
     *
     * @param screenX 屏幕 x，单位像素，原点左上
     * @param screenY 屏幕 y，单位像素，原点左上
     * @param viewport 视口尺寸
     */
    screenToRay(screenX: number, screenY: number, viewport: Viewport): Ray {
        // NDC（x∈[-1,1]，y∈[-1,1]，原点中心，y 向上）
        const ndcX = screenX / viewport.width * 2 - 1;
        const ndcY = 1 - screenY / viewport.height * 2;

        const aspect = viewport.width / viewport.height;

        const nearNdc: [number, number, number, number] = [ndcX, ndcY, 0, 1];
        const farNdc: [number, number, number, number] = [ndcX, ndcY, 1, 1];

        const invViewProj = mat4Invert(this.viewProjectionMatrix(aspect));

        const nearWorld = mulMat4Vec4(invViewProj, nearNdc);
        const farWorld = mulMat4Vec4(invViewProj, farNdc);

        // 透视除法
        const nw = nearWorld[3] || 1;
        const fw = farWorld[3] || 1;

        const nearPoint: [number, number, number] = [
            nearWorld[0] / nw,
            nearWorld[1] / nw,
            nearWorld[2] / nw
        ];
        const farPoint: [number, number, number] = [
            farWorld[0] / fw,
            farWorld[1] / fw,
            farWorld[2] / fw
        ];

        let dx = farPoint[0] - nearPoint[0];
        let dy = farPoint[1] - nearPoint[1];
        let dz = farPoint[2] - nearPoint[2];

        const dlen = Math.hypot(dx, dy, dz) || 1;
        dx /= dlen;
        dy /= dlen;
        dz /= dlen;

        return {
            origin: nearPoint,
            direction: [dx, dy, dz]
        };
    }

    /**
     * 世界坐标 → 屏幕坐标（像素）。
     * 返回 null 表示点在相机背后或视锥之外。
     *
     * 用途：给原子贴标签、显示鼠标悬浮提示。
     */
    worldToScreen(
        point: readonly [number, number, number],
        viewport: Viewport
    ): Nullable<[number, number]> {
        const aspect = viewport.width / viewport.height;

        const clip = mulMat4Vec4(this.viewProjectionMatrix(aspect), [point[0], point[1], point[2], 1]);

        // 视锥裁剪（含背面）
        if (clip[3] <= 0) return null;

        const ndcX = clip[0] / clip[3];
        const ndcY = clip[1] / clip[3];

        if (ndcX < -1 || ndcX > 1 || ndcY < -1 || ndcY > 1) return null;

        return [(ndcX + 1) / 2 * viewport.width, (1 - ndcY) / 2 * viewport.height];
    }

    /** 视图参数变化：view 与 viewProj 失效（proj 不受影响） */
    private invalidateView(): void {
        this.#viewMatrix = null;
        this.#viewProjMatrix = null;
        this.#viewProjAspect = -1;
    }

    /** 投影参数变化：proj 与 viewProj 失效 */
    private invalidateProjection(): void {
        this.#projMatrix = null;
        this.#projAspect = -1;
        this.#viewProjMatrix = null;
        this.#viewProjAspect = -1;
    }
}


/** 拷贝 vec3，避免外部持有同一数组后改动影响相机 */
function copyVec3(v: readonly [number, number, number]): [number, number, number] {
    return [v[0], v[1], v[2]];
}


/** 拷贝投影参数，避免调用方后续修改原对象时影响相机 */
function copyProjection(p: Projection): Projection {
    return p.type === "perspective"
        ? {type: "perspective", fov: p.fov, near: p.near, far: p.far}
        : {type: "orthographic", size: p.size, near: p.near, far: p.far};
}


/** mat4 × vec4（列主序，不做透视除法） */
function mulMat4Vec4(
    m: Float32Array,
    v: readonly [number, number, number, number]
): [number, number, number, number] {
    return [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
    ];
}
