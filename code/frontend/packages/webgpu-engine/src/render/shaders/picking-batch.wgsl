// ============================================================================
// picking-batch.wgsl
// ----------------------------------------------------------------------------
// 实例化批次的拾取着色器（P1）。
//
// 与 picking.wgsl 的区别：objectId 不再来自 ObjectUniforms，而是
// 实例数据的 location 7（u32）。这样整个批次一次 draw 就能把
// 每个实例各自的 id 写进 r32uint 纹理，不需要 per-object bind group。
//
// id 约定（与分子层一致）：0 = 不可拾取（键 / 背景），原子 = 原子 id + 1。
// ============================================================================

#include "common/uniforms"

@group(0) @binding(0) var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) position: vec3<f32>,
  @location(2) m0: vec4<f32>,
  @location(3) m1: vec4<f32>,
  @location(4) m2: vec4<f32>,
  @location(5) m3: vec4<f32>,
  @location(7) id: u32,
}

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) @interpolate(flat) id: u32,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  let model = mat4x4<f32>(in.m0, in.m1, in.m2, in.m3);

  var out: VertexOutput;
  out.clipPosition = scene.viewProj * model * vec4<f32>(in.position, 1.0);
  out.id = in.id;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) u32 {
  return in.id;
}
