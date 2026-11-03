// ============================================================================
// composite.wgsl
// ----------------------------------------------------------------------------
// SSAO 合成（P4 补齐）：scene-color（全分辨率） × SSAO 因子（半分辨率），
// 直接写交换链。用 textureLoad 而不是 sampler，避免额外采样器与过滤差异。
// ============================================================================

@group(0) @binding(0) var sceneTex: texture_2d<f32>;
@group(0) @binding(1) var aoTex: texture_2d<f32>;

struct CompositeU {
  useAo: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

@group(0) @binding(2) var<uniform> u: CompositeU;

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> @builtin(position) vec4<f32> {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );

  return vec4<f32>(positions[index], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) vec4<f32> {
  let sceneSize = vec2<f32>(textureDimensions(sceneTex));
  let aoSize = vec2<f32>(textureDimensions(aoTex));

  let color = textureLoad(sceneTex, vec2<i32>(position.xy), 0).rgb;

  var ao = 1.0;

  if (u.useAo != 0u) {
    let uv = position.xy / sceneSize;
    ao = textureLoad(aoTex, vec2<i32>(uv * aoSize), 0).r;
  }

  // AO 只压暗环境项：保留 35% 的基础亮度，避免死黑
  return vec4<f32>(color * mix(1.0, ao, 0.65), 1.0);
}
