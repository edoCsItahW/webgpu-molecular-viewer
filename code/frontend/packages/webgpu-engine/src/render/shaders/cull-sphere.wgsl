// ============================================================================
// cull-sphere.wgsl
// ----------------------------------------------------------------------------
// 球批次的视锥剔除（P3）：每个实例一个线程，投影中心与半径，
// 完全在视锥外则丢弃；可见实例写入压缩索引，并原子递增 indirect args 的 instanceCount。
//
// 为什么用"屏幕半径"而不是纯 AABB：
//   球在 NDC 里的半径 = r * proj[1][1] / w（y 方向）。用 x/y 两个方向的半径做
//   保守测试即可，既不会误剔，又比 6 平面测试便宜。
// ============================================================================

#include "common/uniforms"

struct SphereInst {
  centerRadius: vec4<f32>,
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
@group(1) @binding(0) var<storage, read> insts: array<SphereInst>;
@group(1) @binding(1) var<uniform> cull: CullU;
@group(1) @binding(2) var<storage, read_write> visible: array<u32>;
@group(1) @binding(3) var<storage, read_write> args: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;

  if (i >= cull.count) { return; }

  let center = insts[i].centerRadius.xyz;
  let radius = insts[i].centerRadius.w;

  let clip = scene.viewProj * vec4<f32>(center, 1.0);

  if (clip.w <= 0.0) { return; }

  let ndc = clip.xy / clip.w;
  let ndcZ = clip.z / clip.w;

  if (ndcZ < 0.0 || ndcZ > 1.0) { return; }

  let rx = radius * scene.proj[0][0] / clip.w;
  let ry = radius * scene.proj[1][1] / clip.w;

  if (ndc.x < -1.0 - rx || ndc.x > 1.0 + rx) { return; }
  if (ndc.y < -1.0 - ry || ndc.y > 1.0 + ry) { return; }

  let slot = atomicAdd(&args[1], 1u);

  // 防御：理论上 args 每帧清零后 slot < count；越界时不写坏缓冲
  if (slot >= arrayLength(&visible)) {
    atomicSub(&args[1], 1u);
    return;
  }

  visible[slot] = i;
}


