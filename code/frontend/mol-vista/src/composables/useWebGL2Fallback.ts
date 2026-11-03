// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file useWebGL2Fallback.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc WebGPU 不可用时的 WebGL2 兼容渲染。
 *
 *       定位：保证“能看、能转、能点、能测”，不追求 WebGPU 的 GPU-driven 能力。
 *       - 球/柱用低多边形几何 + 实例化
 *       - 球棍/空间填充/线框/卡通管 + 配体叠加
 *       - CPU 屏幕空间拾取；OrbitCamera 复用
 *       - 不支持 SSAO、GPU MD、GPU 剔除；由 UI 显示兼容模式并禁用模拟
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {onBeforeUnmount, ref, shallowRef, watch} from 'vue';
import {OrbitCamera} from '@wmv/webgpu-engine';
import {useMoleculeStore} from '@/stores/molecule.store';
import {buildWebGL2Instances, type WebGL2Instances} from '@/utils/webgl2-instances';

export interface FallbackMetrics {
    fps: string;
    ms: string;
    inst: string;
}

interface Geometry {
    vao: WebGLVertexArrayObject;
    indexCount: number;
    buffer: WebGLBuffer;
    indexBuffer: WebGLBuffer;
    instanceBuffer: WebGLBuffer;
}

const SPHERE_RINGS = 14;
const SPHERE_SEGMENTS = 20;
const CYLINDER_SEGMENTS = 14;

const CLICK_MOVE_TOLERANCE_PX = 4;
const CLICK_MAX_DURATION_MS = 450;

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (near - far);

    // WebGL NDC z ∈ [-1,1]
    return new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0,
    ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
    const out = new Float32Array(16);

    for (let col = 0; col < 4; col++) {
        for (let row = 0; row < 4; row++) {
            let sum = 0;

            for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;

            out[col * 4 + row] = sum;
        }
    }

    return out;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);

    if (!shader) throw new Error('createShader failed');

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? 'shader compile failed';

        gl.deleteShader(shader);
        throw new Error(log);
    }

    return shader;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
    const program = gl.createProgram();

    if (!program) throw new Error('createProgram failed');

    const vertex = compile(gl, gl.VERTEX_SHADER, vs);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fs);

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? 'program link failed';

        gl.deleteProgram(program);
        throw new Error(log);
    }

    return program;
}

const SPHERE_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 iCenter;
layout(location = 3) in float iRadius;
layout(location = 4) in vec3 iColor;

uniform mat4 uViewProj;

out vec3 vNormal;
out vec3 vColor;

void main() {
    vec3 world = aPosition * iRadius + iCenter;

    vNormal = aNormal;
    vColor = iColor;
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const CYLINDER_VS = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 iA;
layout(location = 3) in float iRadiusA;
layout(location = 4) in vec3 iB;
layout(location = 5) in float iRadiusB;
layout(location = 6) in vec3 iColor;

uniform mat4 uViewProj;

out vec3 vNormal;
out vec3 vColor;

void main() {
    vec3 axis = iB - iA;
    float axisLength = max(length(axis), 1e-6);
    vec3 yAxis = axis / axisLength;
    vec3 helper = abs(yAxis.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 xAxis = normalize(cross(helper, yAxis));
    vec3 zAxis = cross(yAxis, xAxis);
    float radius = mix(iRadiusA, iRadiusB, aPosition.y);

    vec3 world = iA
        + xAxis * (aPosition.x * radius)
        + yAxis * (aPosition.y * axisLength)
        + zAxis * (aPosition.z * radius);

    mat3 basis = mat3(xAxis, yAxis, zAxis);

    vNormal = normalize(basis * aNormal);
    vColor = iColor;
    gl_Position = uViewProj * vec4(world, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vColor;

uniform vec3 uLightDir;

out vec4 outColor;

void main() {
    vec3 n = normalize(vNormal);
    float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
    vec3 color = vColor * (0.34 + 0.8 * diffuse);

    outColor = vec4(color, 1.0);
}`;

function sphereGeometry(gl: WebGL2RenderingContext): {positions: Float32Array; normals: Float32Array; indices: Uint16Array} {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    for (let lat = 0; lat <= SPHERE_RINGS; lat++) {
        const theta = (lat / SPHERE_RINGS) * Math.PI;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let lon = 0; lon <= SPHERE_SEGMENTS; lon++) {
            const phi = (lon / SPHERE_SEGMENTS) * Math.PI * 2;
            const x = sinTheta * Math.cos(phi);
            const y = cosTheta;
            const z = sinTheta * Math.sin(phi);

            positions.push(x, y, z);
            normals.push(x, y, z);
        }
    }

    for (let lat = 0; lat < SPHERE_RINGS; lat++) {
        for (let lon = 0; lon < SPHERE_SEGMENTS; lon++) {
            const a = lat * (SPHERE_SEGMENTS + 1) + lon;
            const b = a + SPHERE_SEGMENTS + 1;

            indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}

function cylinderGeometry(gl: WebGL2RenderingContext): {positions: Float32Array; normals: Float32Array; indices: Uint16Array} {
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];

    // 侧面：y ∈ [0,1]，半径 1
    for (let i = 0; i <= CYLINDER_SEGMENTS; i++) {
        const angle = (i / CYLINDER_SEGMENTS) * Math.PI * 2;
        const x = Math.cos(angle);
        const z = Math.sin(angle);

        positions.push(x, 0, z, x, 1, z);
        normals.push(x, 0, z, x, 0, z);
    }

    for (let i = 0; i < CYLINDER_SEGMENTS; i++) {
        const a = i * 2;

        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }

    // 端盖
    for (const [y, sign] of [[0, -1], [1, 1]] as const) {
        const center = positions.length / 3;

        positions.push(0, y, 0);
        normals.push(0, sign, 0);

        for (let i = 0; i <= CYLINDER_SEGMENTS; i++) {
            const angle = (i / CYLINDER_SEGMENTS) * Math.PI * 2;

            positions.push(Math.cos(angle), y, Math.sin(angle));
            normals.push(0, sign, 0);
        }

        for (let i = 0; i < CYLINDER_SEGMENTS; i++) {
            if (sign > 0) indices.push(center, center + 1 + i, center + 2 + i);
            else indices.push(center, center + 2 + i, center + 1 + i);
        }
    }

    return {
        positions: new Float32Array(positions),
        normals: new Float32Array(normals),
        indices: new Uint16Array(indices),
    };
}

/**
 * @param canvasRef 视口 canvas
 */
export function useWebGL2Fallback(canvasRef: {value: HTMLCanvasElement | null}) {
    const store = useMoleculeStore();

    const ready = ref(false);
    const active = ref(false);
    const metrics = ref<FallbackMetrics>({fps: '0.0', ms: '0.00', inst: '0'});

    const camera = shallowRef<OrbitCamera | null>(null);

    let gl: WebGL2RenderingContext | null = null;
    let sphereProgram: WebGLProgram | null = null;
    let cylinderProgram: WebGLProgram | null = null;
    let sphereVpLoc: WebGLUniformLocation | null = null;
    let sphereLightLoc: WebGLUniformLocation | null = null;
    let cylinderVpLoc: WebGLUniformLocation | null = null;
    let cylinderLightLoc: WebGLUniformLocation | null = null;
    let sphere: Geometry | null = null;
    let cylinder: Geometry | null = null;
    let raf: number | null = null;
    let observer: ResizeObserver | null = null;
    let lastTime = 0;
    let frames = 0;
    let hudTime = 0;
    let instanceCount = 0;
    let fittedStructure: unknown = null;
    let pointerDown: {x: number; y: number; time: number} | null = null;
    let cameraAnim: number | null = null;

    function createGeometry(
        attributes: Array<{location: number; size: number; stride: number; offset: number; divisor: number}>,
        data: {positions: Float32Array; normals: Float32Array; indices: Uint16Array}
    ): Geometry {
        const context = gl!;
        const vao = context.createVertexArray()!;
        const buffer = context.createBuffer()!;
        const indexBuffer = context.createBuffer()!;
        const instanceBuffer = context.createBuffer()!;

        context.bindVertexArray(vao);

        context.bindBuffer(context.ARRAY_BUFFER, buffer);
        const interleaved = new Float32Array(data.positions.length + data.normals.length);

        for (let i = 0; i < data.positions.length / 3; i++) {
            interleaved[i * 6] = data.positions[i * 3]!;
            interleaved[i * 6 + 1] = data.positions[i * 3 + 1]!;
            interleaved[i * 6 + 2] = data.positions[i * 3 + 2]!;
            interleaved[i * 6 + 3] = data.normals[i * 3]!;
            interleaved[i * 6 + 4] = data.normals[i * 3 + 1]!;
            interleaved[i * 6 + 5] = data.normals[i * 3 + 2]!;
        }

        context.bufferData(context.ARRAY_BUFFER, interleaved, context.STATIC_DRAW);

        const stride = 24;

        context.enableVertexAttribArray(0);
        context.vertexAttribPointer(0, 3, context.FLOAT, false, stride, 0);
        context.enableVertexAttribArray(1);
        context.vertexAttribPointer(1, 3, context.FLOAT, false, stride, 12);

        context.bindBuffer(context.ELEMENT_ARRAY_BUFFER, indexBuffer);
        context.bufferData(context.ELEMENT_ARRAY_BUFFER, data.indices, context.STATIC_DRAW);

        context.bindBuffer(context.ARRAY_BUFFER, instanceBuffer);

        for (const attribute of attributes) {
            context.enableVertexAttribArray(attribute.location);
            context.vertexAttribPointer(
                attribute.location,
                attribute.size,
                context.FLOAT,
                false,
                attribute.stride,
                attribute.offset
            );
            context.vertexAttribDivisor(attribute.location, attribute.divisor);
        }

        context.bindVertexArray(null);

        return {vao, buffer, indexBuffer, instanceBuffer, indexCount: data.indices.length};
    }

    function initGeometry(): void {
        const context = gl!;
        const sphereData = sphereGeometry(context);
        const cylinderData = cylinderGeometry(context);

        sphere = createGeometry(
            [
                {location: 2, size: 3, stride: 28, offset: 0, divisor: 1},
                {location: 3, size: 1, stride: 28, offset: 12, divisor: 1},
                {location: 4, size: 3, stride: 28, offset: 16, divisor: 1},
            ],
            sphereData
        );

        cylinder = createGeometry(
            [
                {location: 2, size: 3, stride: 44, offset: 0, divisor: 1},
                {location: 3, size: 1, stride: 44, offset: 12, divisor: 1},
                {location: 4, size: 3, stride: 44, offset: 16, divisor: 1},
                {location: 5, size: 1, stride: 44, offset: 28, divisor: 1},
                {location: 6, size: 3, stride: 44, offset: 32, divisor: 1},
            ],
            cylinderData
        );
    }

    function resize(): boolean {
        const canvas = canvasRef.value;

        if (!canvas || !gl) return false;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));

        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        gl.viewport(0, 0, width, height);

        return true;
    }

    function viewProjection(): Float32Array | null {
        const canvas = canvasRef.value;
        const cam = camera.value;

        if (!canvas || !cam || !gl) return null;

        const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);

        const projection = cam.projection;
        const fov = 'fov' in projection ? projection.fov : Math.PI / 4;

        return multiply(perspective(fov, aspect, projection.near, projection.far), cam.viewMatrix());
    }

    function project(position: readonly [number, number, number]): {x: number; y: number; z: number} | null {
        const canvas = canvasRef.value;
        const vp = viewProjection();

        if (!canvas || !vp) return null;

        const x = position[0];
        const y = position[1];
        const z = position[2];
        const w = vp[3]! * x + vp[7]! * y + vp[11]! * z + vp[15]!;

        if (w <= 0) return null;

        const cx = vp[0]! * x + vp[4]! * y + vp[8]! * z + vp[12]!;
        const cy = vp[1]! * x + vp[5]! * y + vp[9]! * z + vp[13]!;
        const cz = vp[2]! * x + vp[6]! * y + vp[10]! * z + vp[14]!;
        const ndcX = cx / w;
        const ndcY = cy / w;

        return {
            x: (ndcX * 0.5 + 0.5) * canvas.clientWidth,
            y: (1 - (ndcY * 0.5 + 0.5)) * canvas.clientHeight,
            z: cz / w,
        };
    }

    function projectPoint(position: readonly [number, number, number]): {x: number; y: number} | null {
        const result = project(position);

        return result ? {x: result.x, y: result.y} : null;
    }

    function rebuild(fitAfter = false): void {
        const context = gl;
        const data = store.structure;

        if (!active.value || !context || !data) return;

        const instances = buildWebGL2Instances(data, {
            mode: store.displayMode,
            colorScheme: store.colorScheme,
            ballScale: store.ballRadiusScale,
            bondScale: store.bondRadiusScale,
            showHydrogens: store.showHydrogens,
            showWaters: store.showWaters,
            showLigands: store.showLigands,
            showSidechains: store.showSidechains,
            focus: store.focus,
            selection: store.selection,
        });

        upload(instances);
        lastSphereCount = instances.sphereCount;
        lastCylinderCount = instances.cylinderCount;
        instanceCount = instances.sphereCount + instances.cylinderCount;
        metrics.value = {...metrics.value, inst: String(instanceCount)};

        if (fitAfter && fittedStructure !== data) {
            fittedStructure = data;
            fit();
        }
    }

    function upload(instances: WebGL2Instances): void {
        const context = gl!;

        if (sphere) {
            context.bindBuffer(context.ARRAY_BUFFER, sphere.instanceBuffer);
            context.bufferData(context.ARRAY_BUFFER, instances.spheres, context.DYNAMIC_DRAW);
        }

        if (cylinder) {
            context.bindBuffer(context.ARRAY_BUFFER, cylinder.instanceBuffer);
            context.bufferData(context.ARRAY_BUFFER, instances.cylinders, context.DYNAMIC_DRAW);
        }
    }

    function fit(): void {
        const canvas = canvasRef.value;
        const cam = camera.value;
        const data = store.structure;

        if (!canvas || !cam || !data || data.meta.atomCount === 0) return;

        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        const positions = data.atoms.positions;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const x = positions[i * 3]!;
            const y = positions[i * 3 + 1]!;
            const z = positions[i * 3 + 2]!;

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            minZ = Math.min(minZ, z);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
            maxZ = Math.max(maxZ, z);
        }

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;
        const radius = Math.max(1, Math.hypot(maxX - minX, maxY - minY, maxZ - minZ) / 2);
        const aspect = Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight);
        const projection = cam.projection;
        const fov = 'fov' in projection ? projection.fov : Math.PI / 4;
        const vertical = radius / Math.tan(fov / 2);
        const horizontal = vertical / aspect;
        const distance = Math.max(vertical, horizontal) * 1.25;

        const dx = cam.position[0] - cam.target[0];
        const dy = cam.position[1] - cam.target[1];
        const dz = cam.position[2] - cam.target[2];
        const length = Math.hypot(dx, dy, dz) || 1;

        cam.setView(
            [cx + (dx / length) * distance, cy + (dy / length) * distance, cz + (dz / length) * distance],
            [cx, cy, cz]
        );
        cam.update(0);
    }

    function cameraPose(): {position: [number, number, number]; target: [number, number, number]} | null {
        const cam = camera.value;

        if (!cam) return null;

        return {
            position: [cam.position[0], cam.position[1], cam.position[2]],
            target: [cam.target[0], cam.target[1], cam.target[2]],
        };
    }

    function setCameraPose(position: readonly [number, number, number], target: readonly [number, number, number]): void {
        camera.value?.setView(position, target);
        camera.value?.update(0);
    }

    function animateCameraPose(
        position: readonly [number, number, number],
        target: readonly [number, number, number],
        duration = 800
    ): Promise<void> {
        const cam = camera.value;

        if (!cam) return Promise.resolve();

        if (cameraAnim !== null) cancelAnimationFrame(cameraAnim);

        const start = performance.now();
        const fromPosition: [number, number, number] = [cam.position[0], cam.position[1], cam.position[2]];
        const fromTarget: [number, number, number] = [cam.target[0], cam.target[1], cam.target[2]];

        return new Promise(resolve => {
            const tick = (now: number): void => {
                const t = Math.min(1, (now - start) / duration);
                const ease = t * t * (3 - 2 * t);

                cam.setView(
                    [
                        fromPosition[0] + (position[0] - fromPosition[0]) * ease,
                        fromPosition[1] + (position[1] - fromPosition[1]) * ease,
                        fromPosition[2] + (position[2] - fromPosition[2]) * ease,
                    ],
                    [
                        fromTarget[0] + (target[0] - fromTarget[0]) * ease,
                        fromTarget[1] + (target[1] - fromTarget[1]) * ease,
                        fromTarget[2] + (target[2] - fromTarget[2]) * ease,
                    ]
                );

                if (t < 1) {
                    cameraAnim = requestAnimationFrame(tick);
                } else {
                    cameraAnim = null;
                    resolve();
                }
            };

            cameraAnim = requestAnimationFrame(tick);
        });
    }
    function pick(clientX: number, clientY: number): number | null {
        const canvas = canvasRef.value;
        const data = store.structure;

        if (!canvas || !data) return null;

        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        let best: {id: number; distance: number; z: number} | null = null;

        for (let i = 0; i < data.meta.atomCount; i++) {
            const p = project([
                data.atoms.positions[i * 3]!,
                data.atoms.positions[i * 3 + 1]!,
                data.atoms.positions[i * 3 + 2]!,
            ]);

            if (!p) continue;

            const distance = Math.hypot(p.x - x, p.y - y);

            if (distance > 14) continue;
            if (!best || distance < best.distance || (distance === best.distance && p.z < best.z)) {
                best = {id: i, distance, z: p.z};
            }
        }

        return best?.id ?? null;
    }

    function onClick(event: MouseEvent): void {
        const start = pointerDown;

        pointerDown = null;

        if (!start || !active.value) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_MOVE_TOLERANCE_PX) return;
        if (performance.now() - start.time > CLICK_MAX_DURATION_MS) return;

        const atom = pick(event.clientX, event.clientY);

        if (store.measureMode) {
            if (atom !== null) {
                store.measureAtom(atom);
                store.selectAtom(atom);
            }

            return;
        }

        store.selectAtom(atom);
    }

    function onPointerDown(event: PointerEvent): void {
        if (event.button !== 0) return;

        pointerDown = {x: event.clientX, y: event.clientY, time: performance.now()};
    }

    function draw(): void {
        const context = gl;

        if (!context || !sphere || !cylinder) return;

        const vp = viewProjection();

        if (!vp) return;

        context.enable(context.DEPTH_TEST);
        context.depthFunc(context.LEQUAL);
        context.disable(context.CULL_FACE);
        context.clearColor(0.016, 0.024, 0.039, 1);
        context.clear(context.COLOR_BUFFER_BIT | context.DEPTH_BUFFER_BIT);

        context.useProgram(sphereProgram);
        context.uniformMatrix4fv(sphereVpLoc, false, vp);
        context.uniform3f(sphereLightLoc, 0.5, 1.0, 0.7);
        context.bindVertexArray(sphere.vao);
        context.drawElementsInstanced(context.TRIANGLES, sphere.indexCount, context.UNSIGNED_SHORT, 0, lastSphereCount);

        context.useProgram(cylinderProgram);
        context.uniformMatrix4fv(cylinderVpLoc, false, vp);
        context.uniform3f(cylinderLightLoc, 0.5, 1.0, 0.7);
        context.bindVertexArray(cylinder.vao);
        context.drawElementsInstanced(context.TRIANGLES, cylinder.indexCount, context.UNSIGNED_SHORT, 0, lastCylinderCount);

        context.bindVertexArray(null);
    }

    let lastSphereCount = 0;
    let lastCylinderCount = 0;

    function frame(now: number): void {
        if (!active.value) return;

        const dt = lastTime ? (now - lastTime) / 1000 : 0;

        lastTime = now;
        frames++;
        camera.value?.update(dt);
        resize();
        draw();

        if (!hudTime) hudTime = now;

        if (now - hudTime >= 500) {
            const elapsed = Math.max(1, now - hudTime);

            metrics.value = {
                fps: (frames / (elapsed / 1000)).toFixed(1),
                ms: (elapsed / Math.max(1, frames)).toFixed(2),
                inst: String(instanceCount),
            };
            frames = 0;
            hudTime = now;
        }

        raf = requestAnimationFrame(frame);
    }

    async function start(): Promise<boolean> {
        if (active.value) return true;

        let canvas = canvasRef.value;

        if (!canvas) return false;

        let context = canvas.getContext('webgl2', {
            alpha: false,
            antialias: true,
            depth: true,
            premultipliedAlpha: false,
            // 截图/分享直接 canvas.toDataURL；不保留绘制缓冲会得到空白图
            preserveDrawingBuffer: true,
        });

        // 若 WebGPU 已先在这个 canvas 上创建过 context（初始化在更后面失败），
        // 同一 canvas 不能再建 WebGL2。替换成同 class 的新 canvas，保证降级仍可用。
        if (!context && canvas.parentElement) {
            const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
            const width = canvas.width;
            const height = canvas.height;

            canvas.parentElement.replaceChild(replacement, canvas);
            canvasRef.value = replacement;
            canvas = replacement;
            canvas.width = width;
            canvas.height = height;
            context = canvas.getContext('webgl2', {
                alpha: false,
                antialias: true,
                depth: true,
                premultipliedAlpha: false,
                preserveDrawingBuffer: true,
            });
        }

        if (!context) return false;

        try {
            gl = context;
            sphereProgram = link(context, SPHERE_VS, FRAGMENT);
            cylinderProgram = link(context, CYLINDER_VS, FRAGMENT);
            sphereVpLoc = context.getUniformLocation(sphereProgram, 'uViewProj');
            sphereLightLoc = context.getUniformLocation(sphereProgram, 'uLightDir');
            cylinderVpLoc = context.getUniformLocation(cylinderProgram, 'uViewProj');
            cylinderLightLoc = context.getUniformLocation(cylinderProgram, 'uLightDir');
            initGeometry();

            const cam = new OrbitCamera({
                canvas,
                distance: 12,
                theta: Math.PI / 4,
                phi: Math.PI / 6,
                damping: 0.1,
            });

            camera.value = cam;
            active.value = true;
            ready.value = true;
            store.setEngineBackend('webgl2');

            rebuild(true);

            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('click', onClick);

            observer = new ResizeObserver(() => {
                resize();
            });
            observer.observe(canvas);

            lastTime = 0;
            frames = 0;
            hudTime = 0;
            raf = requestAnimationFrame(frame);

            return true;
        } catch (error) {
            console.error('[MolVista] WebGL2 fallback init failed:', error);
            dispose();

            return false;
        }
    }

    // 只有 fallback 激活后才写 GPU 缓冲；WebGPU 正常时这些 watcher 是 no-op。
    watch(
        () => [store.displayMode, store.colorScheme, store.ballRadiusScale, store.bondRadiusScale,
            store.showHydrogens, store.showWaters, store.showLigands, store.showSidechains,
            store.selection, store.focus] as const,
        () => {
            if (active.value) rebuild(false);
        },
        {deep: false}
    );

    watch(
        () => store.structure,
        () => {
            if (active.value) {
                    rebuild(true);
            }
        }
    );

    function dispose(): void {
        active.value = false;
        ready.value = false;

        if (raf !== null) cancelAnimationFrame(raf);
        if (cameraAnim !== null) cancelAnimationFrame(cameraAnim);

        raf = null;
        cameraAnim = null;

        const canvas = canvasRef.value;

        canvas?.removeEventListener('pointerdown', onPointerDown);
        canvas?.removeEventListener('click', onClick);
        observer?.disconnect();
        observer = null;

        camera.value?.dispose();
        camera.value = null;

        const context = gl;

        if (context) {
            if (sphere) {
                context.deleteVertexArray(sphere.vao);
                context.deleteBuffer(sphere.buffer);
                context.deleteBuffer(sphere.indexBuffer);
                context.deleteBuffer(sphere.instanceBuffer);
            }

            if (cylinder) {
                context.deleteVertexArray(cylinder.vao);
                context.deleteBuffer(cylinder.buffer);
                context.deleteBuffer(cylinder.indexBuffer);
                context.deleteBuffer(cylinder.instanceBuffer);
            }

            if (sphereProgram) context.deleteProgram(sphereProgram);
            if (cylinderProgram) context.deleteProgram(cylinderProgram);
        }

        sphere = null;
        cylinder = null;
        sphereProgram = null;
        cylinderProgram = null;
        gl = null;
    }

    onBeforeUnmount(dispose);

    return {
        ready,
        active,
        metrics,
        camera,
        start,
        dispose,
        fit,
        cameraPose,
        setCameraPose,
        animateCameraPose,
        projectPoint,
        pick,
    };
}












