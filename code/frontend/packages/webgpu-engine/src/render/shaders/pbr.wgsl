// ============================================================================
// pbr.wgsl
// ----------------------------------------------------------------------------
// 主渲染管线的 PBR 着色器。
//
// 顶点输入（与 Geometry.vertexLayout 一致）：
//   location 0 = position  (float32x3)
//   location 1 = normal    (float32x3)
//
// 顶点输出：
//   worldPos    —— 世界空间位置（用于计算 V 向量）
//   worldNormal —— 世界空间法线
//
// 片元输出：
//   location 0 = vec4<f32> 颜色（目标格式 bgra8unorm / rgba8unorm）
//
// 光照模型：Blinn-Phong + 半球环境光增强。
//
//   为什么不是完整的 Cook-Torrance PBR：
//     Cook-Torrance 需要 roughness / metallic / 环境 BRDF 等参数，
//     而当前 ObjectUniforms 只有 color。分子可视化里，
//     原子的视觉质感来自颜色 + 立体感，不需要金属度区分。
//     Blinn-Phong + 半球环境光已经足够好看且计算便宜。
//     如果未来需要 PBR，扩展 ObjectUniforms + 换片元函数即可，
//     顶点阶段和绑定布局不用动。
//
//   为什么加了半球环境光：
//     单方向光 + 纯环境光会让背光面死平。
//     用 N.y 混合天空色与地面色，让"上亮下暗"，
//     分子在任意角度都有自然光感。
// ============================================================================

#include "common/uniforms"

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<uniform> obj: ObjectUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
}

// ---------------------------------------------------------------------------
// 顶点阶段
// ---------------------------------------------------------------------------

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;

  // 世界位置
  let worldPos = obj.model * vec4<f32>(in.position, 1.0);
  out.worldPos = worldPos.xyz;

  // 裁剪坐标
  out.clipPosition = scene.viewProj * worldPos;

  // 世界法线
  // 注意：此处假设模型矩阵只含均匀缩放（Mesh 只支持均匀缩放）。
  //       若有非均匀缩放，需要用逆转置矩阵，本项目不支持。
  out.worldNormal = (obj.model * vec4<f32>(in.normal, 0.0)).xyz;

  return out;
}

// ---------------------------------------------------------------------------
// 片元阶段
// ---------------------------------------------------------------------------

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // 归一化向量
  let N = normalize(in.worldNormal);
  let L = normalize(scene.lightDir);
  let V = normalize(scene.cameraPos - in.worldPos);
  let H = normalize(L + V);

  let baseColor = obj.color;

  // ---- 环境光：来自 SceneUniforms ----
  let ambient = scene.ambientColor * baseColor;

  // ---- 半球环境光：上冷下暖，增强立体感 ----
  // 系数是经验值，调参可以更"自然"或更"戏剧"
  let skyColor    = vec3<f32>(0.05, 0.07, 0.12);
  let groundColor = vec3<f32>(0.03, 0.02, 0.02);
  let hemiFactor = N.y * 0.5 + 0.5;  // N.y = 1 朝天，N.y = -1 朝地
  let hemi = mix(groundColor, skyColor, hemiFactor) * baseColor;

  // ---- 漫反射（Lambert） ----
  let NdotL = max(dot(N, L), 0.0);
  let diff = NdotL * scene.lightColor * baseColor;

  // ---- 高光（Blinn-Phong） ----
  // 32 是高光指数，越大越"聚"
  let spec = pow(max(dot(N, H), 0.0), 32.0) * scene.lightColor * 0.6;

  // ---- 合成 ----
  let color = ambient + hemi + diff + spec;
  return vec4<f32>(color, 1.0);
}
