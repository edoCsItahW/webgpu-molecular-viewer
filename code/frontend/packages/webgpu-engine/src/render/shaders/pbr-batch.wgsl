// ============================================================================
// pbr-batch.wgsl
// ----------------------------------------------------------------------------
// 实例化批次的主渲染着色器（P1）。
//
// 与 pbr.wgsl 的区别：
//   旧管线：每对象一个 ObjectUniforms（model / color / objectId），一次 draw 一个对象。
//   新管线：整个批次共用 scene uniform，实例数据从顶点属性读：
//     location 2 ~ 5 = model   mat4x4<f32>（列主序）
//     location 6     = color   vec4<f32>
//     location 7     = objectId u32（拾取用，本管线不读）
//   一次 drawIndexed(indexCount, instanceCount) 画完整个批次。
//
// 光照与 pbr.wgsl 完全一致（Blinn-Phong + 半球环境光），保证切换前后观感不漂移。
// ============================================================================

#include "common/uniforms"

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) m0: vec4<f32>,
  @location(3) m1: vec4<f32>,
  @location(4) m2: vec4<f32>,
  @location(5) m3: vec4<f32>,
  @location(6) color: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) worldPos: vec3<f32>,
  @location(1) worldNormal: vec3<f32>,
  @location(2) color: vec3<f32>,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  let model = mat4x4<f32>(in.m0, in.m1, in.m2, in.m3);

  var out: VertexOutput;
  let worldPos = model * vec4<f32>(in.position, 1.0);
  out.worldPos = worldPos.xyz;
  out.clipPosition = scene.viewProj * worldPos;
  out.worldNormal = (model * vec4<f32>(in.normal, 0.0)).xyz;
  out.color = in.color.rgb;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let N = normalize(in.worldNormal);
  let L = normalize(scene.lightDir);
  let V = normalize(scene.cameraPos - in.worldPos);
  let H = normalize(L + V);

  let baseColor = in.color;

  let ambient = scene.ambientColor * baseColor;

  let skyColor    = vec3<f32>(0.05, 0.07, 0.12);
  let groundColor = vec3<f32>(0.03, 0.02, 0.02);
  let hemiFactor = N.y * 0.5 + 0.5;
  let hemi = mix(groundColor, skyColor, hemiFactor) * baseColor;

  let NdotL = max(dot(N, L), 0.0);
  let diff = NdotL * scene.lightColor * baseColor;

  let spec = pow(max(dot(N, H), 0.0), 32.0) * scene.lightColor * 0.6;

  return vec4<f32>(ambient + hemi + diff + spec, 1.0);
}
