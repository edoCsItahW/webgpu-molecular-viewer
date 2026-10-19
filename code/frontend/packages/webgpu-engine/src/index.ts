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
 * @date 2026/09/27 18:00
 * @desc @wmv/webgpu-engine 公共 API 出口。导出渲染管线、场景、相机、几何、材质、光照等。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

// ---- GPU 基础层 ----
export { GPUContext } from "./gpu/GPUContext";
export type { GPUContextOptions } from "./gpu/GPUContext";
export { ResourceManager } from "./gpu/ResourceManager";
export { ShaderLibrary } from "./gpu/ShaderLibrary";
export { PipelineManager } from "./gpu/PipelineManager";
export { BindGroupCache } from "./gpu/BindGroupCache";
export { PassManager } from "./gpu/PassManager";

// ---- 渲染层 ----
export { Renderer } from "./render/Renderer";
export type { RendererOptions, RendererFrameContext } from "./render/Renderer";
export { Scene } from "./render/Scene";
export type { SceneOptions, SceneObject, Updatable, Renderable } from "./render/Scene";
export { Camera } from "./render/Camera";
export type { CameraOptions, PerspectiveProjection, OrthographicProjection, Projection, Viewport, Ray } from "./render/Camera";
export { OrbitCamera } from "./render/OrbitCamera";
export type { OrbitCameraOptions } from "./render/OrbitCamera";
export { Mesh } from "./render/Mesh";
export type { MeshOptions } from "./render/Mesh";
export { Geometry } from "./render/Geometry";
export type { Bounds } from "./render/Geometry";
export { Material } from "./render/Material";
export type { MaterialOptions } from "./render/Material";
export { Light, DirectionalLight, AmbientLight, HemisphereLight } from "./render/Light";
export type { LightBase } from "./render/Light";
export { SphereGeometry } from "./render/geometry/SphereGeometry";
export { CylinderGeometry } from "./render/geometry/CylinderGeometry";
export type { FrameStats } from "./render/FrameStats";
