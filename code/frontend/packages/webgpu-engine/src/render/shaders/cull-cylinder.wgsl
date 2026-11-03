// ============================================================================
// cull-cylinder.wgsl
// ----------------------------------------------------------------------------
// 柱批次的视锥剔除（P3）。
//
// 用"轴段中点 + (半长 + 半径)"作为包围球做保守剔除：
//   包围球 ≥ 真实胶囊，因此不会误剔；代价是极端斜视时可能多保留少量实例。
// ============================================================================

#include "common/uniforms"

struct CylinderInst {
  aRadius: vec4<f32>,
  b: vec4<f32>,
  color: u32,
  id: u32,
  pad: vec2u,
}

struct CullU {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> insts: array<CylinderInst>;
@group(1) @binding(1) var<uniform> cull: CullU;
@group(1) @binding(2) var<storage, read_write> visible: array<u32>;
@group(1) @binding(3) var<storage, read_write> args: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;

  if (i >= cull.count) { return; }

  let a = insts[i].aRadius.xyz;
  let radius = insts[i].aRadius.w;
  let b = insts[i].b.xyz;

  let ba = b - a;
  let center = (a + b) * 0.5;
  let bound = length(ba) * 0.5 + radius;

  let clip = scene.viewProj * vec4<f32>(center, 1.0);

  if (clip.w <= 0.0) { return; }

  let ndc = clip.xy / clip.w;
  let ndcZ = clip.z / clip.w;

  if (ndcZ < 0.0 || ndcZ > 1.0) { return; }

  let rx = bound * scene.proj[0][0] / clip.w;
  let ry = bound * scene.proj[1][1] / clip.w;

  if (ndc.x < -1.0 - rx || ndc.x > 1.0 + rx) { return; }
  if (ndc.y < -1.0 - ry || ndc.y > 1.0 + ry) { return; }

  let slot = atomicAdd(&args[1], 1u);

  if (slot >= arrayLength(&visible)) {
    atomicSub(&args[1], 1u);
    return;
  }

  visible[slot] = i;
}


