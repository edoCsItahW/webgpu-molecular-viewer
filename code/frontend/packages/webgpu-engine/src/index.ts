// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc @wmv/webgpu-engine 的公共 API 入口：按层重新导出 GPU / 渲染 / 计算 三大模块的类与类型
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

// ============================================================================
// GPU 基础层：上下文 / 资源 / 着色器 / 管线 / 绑定组 / Pass 调度
// ============================================================================
export {
    GPUContext,
    type GPUContextOptions
} from "./gpu/GPUContext";

export {
    ResourceManager,
    type ResourceManagerOptions
} from "./gpu/ResourceManager";

export {
    ShaderLibrary,
    type ShaderLibraryOptions
} from "./gpu/ShaderLibrary";

export { PipelineManager } from "./gpu/PipelineManager";

export {
    BindGroupCache,
    type BindGroupCacheOptions
} from "./gpu/BindGroupCache";

export {
    PassManager,
    type PassManagerOptions,
    type Pass,
    type PassContext,
    type FrameContext,
    type IntermediateTextureDesc
} from "./gpu/PassManager";

// ============================================================================
// 渲染层：渲染器 / 场景 / 网格 / 几何 / 相机 / 材质 / 灯光
// ============================================================================
export {
    Renderer,
    type RendererOptions,
    type RendererFrameContext
} from "./render/Renderer";

export {
    Scene,
    type SceneOptions,
    type SceneObject,
    type Updatable,
    type Renderable,
    SCENE_UNIFORM_FLOATS,
    SCENE_UNIFORM_BYTES
} from "./render/Scene";

export {
    Mesh,
    type MeshOptions,
    type Vec3 as MeshVec3,
    OBJECT_UNIFORM_FLOATS,
    OBJECT_UNIFORM_BYTES
} from "./render/Mesh";

export {
    Geometry,
    type Bounds,
    INTERLEAVED_FLOATS_PER_VERTEX,
    INTERLEAVED_BYTES_PER_VERTEX,
    ATTRIB_POSITION,
    ATTRIB_NORMAL
} from "./render/Geometry";

export { SphereGeometry } from "./render/geometry/SphereGeometry";

export {
    Camera,
    type CameraOptions,
    type Projection,
    type PerspectiveProjection,
    type OrthographicProjection,
    type Viewport,
    type Ray
} from "./render/Camera";

export {
    OrbitCamera,
    type OrbitCameraOptions
} from "./render/OrbitCamera";

export {
    Material,
    type MaterialOptions
} from "./render/Material";

export {
    Light,
    type LightBase,
    DirectionalLight,
    AmbientLight,
    HemisphereLight,
    isDirectionalLight,
    isAmbientLight,
    isHemisphereLight
} from "./render/Light";

export type { FrameStats } from "./render/FrameStats";

// ============================================================================
// 渲染 Pass：PBR / SSAO / Picking
// ============================================================================
export {
    PBRPass,
    type PBRPassOptions
} from "./render/passes/PBRPass";

export {
    SSAOPass,
    type SSAOPassOptions
} from "./render/passes/SSAOPass";

export {
    PickingPass,
    type PickingPassOptions
} from "./render/passes/PickingPass";

// ============================================================================
// 计算层：ComputeContext / ComputePass / StorageBuffer / PingPongBuffer
// ============================================================================
export {
    ComputeContext,
    type ComputeContextOptions,
    type DispatchOptions,
    type TimingResult
} from "./compute/ComputeContext";

export {
    ComputePass,
    type ComputePassOptions,
    type ExecuteOptions
} from "./compute/ComputePass";

export {
    StorageBuffer,
    type StorageBufferOptions
} from "./compute/StorageBuffer";

export {
    PingPongBuffer,
    type PingPongBufferOptions
} from "./compute/PingPongBuffer";

// ============================================================================
// 内置着色器登记（Renderer 内部已自动调用，外部一般不需要直接使用）
// ============================================================================
export { registerBuiltinShaders } from "./render/shaders";
