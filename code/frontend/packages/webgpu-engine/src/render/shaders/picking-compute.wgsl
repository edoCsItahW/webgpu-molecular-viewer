// ============================================================================
// picking-compute.wgsl
// ----------------------------------------------------------------------------
// 计算拾取（P3）：不再把整个场景画一遍 id pass，而是对球实例做一次
// "屏幕射线 vs 球"的并行求交，用 atomicMin 取最近命中的 objectId。
//
// 两趟 dispatch：
//   1) minDepth：命中的实例里取最小深度（bitcast u32 后 atomicMin）
//   2) minIndex：深度等于最小值的实例里取最小 id（同一深度几乎不会并列）
// 只回读 8 字节（depth + id），比 1 像素 id 纹理回读更轻。
// ============================================================================

#include "common/uniforms"
#include "common/impostor"

struct SphereInst {
  centerRadius: vec4<f32>,
  color: u32,
  id: u32,
  pad: vec2u,
}

struct PickU {
  click: vec2<f32>,
  screen: vec2<f32>,
  count: u32,
  pad: vec3u,
}

@group(0) @binding(0) var<storage, read> spheres: array<SphereInst>;
@group(0) @binding(1) var<uniform> scene: SceneUniforms;
@group(0) @binding(2) var<uniform> pick: PickU;
@group(0) @binding(3) var<storage, read_write> res: array<atomic<u32>, 2>;

/** 屏幕像素 → 视图空间射线方向 */
fn rayDir() -> vec3<f32> {
  let ndcX = pick.click.x / pick.screen.x * 2.0 - 1.0;
  let ndcY = 1.0 - pick.click.y / pick.screen.y * 2.0;

  return normalize(vec3<f32>(
    ndcX / scene.proj[0][0],
    ndcY / scene.proj[1][1],
    -1.0
  ));
}

/** 命中返回深度（NDC z），否则返回 -1 */
fn hitDepth(i: u32, dir: vec3<f32>) -> f32 {
  let inst = spheres[i];

  if (inst.id == 0u) { return -1.0; }

  let radius = inst.centerRadius.w;
  if (radius <= 0.0) { return -1.0; }

  let centerView = (scene.view * vec4<f32>(inst.centerRadius.xyz, 1.0)).xyz;
  let t = raySphere(dir, centerView, radius);

  if (t < 0.0) { return -1.0; }

  let p = dir * t;
  let clip = scene.proj * vec4<f32>(p, 1.0);

  return clip.z / clip.w;
}

@compute @workgroup_size(64)
fn minDepth(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= pick.count) { return; }

  let z = hitDepth(i, rayDir());
  if (z < 0.0) { return; }

  atomicMin(&res[0], bitcast<u32>(z));
}

@compute @workgroup_size(64)
fn minIndex(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= pick.count) { return; }

  let z = hitDepth(i, rayDir());
  if (z < 0.0) { return; }

  if (bitcast<u32>(z) != atomicLoad(&res[0])) { return; }

  let id = spheres[i].id;
  if (id != 0u) {
    atomicMin(&res[1], id);
  }
}
