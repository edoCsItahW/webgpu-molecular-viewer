// ============================================================================
// md.wgsl
// ----------------------------------------------------------------------------
// GPU 分子动力学（P4）：Lennard-Jones（非键）+ 谐振键（成键）+ 半隐式积分。
// 公式与 packages/mathematical/src/physics 的 CPU 实现保持一致（LJ 的 24ε 形式、
// 谐振键 F = k·(r - r0)、velocity Verlet 的半步速度更新），但这里是演示级力场：
//   - 非键用 all-pairs（无邻居表），4779 原子约 2 ms/步；
//   - 成键用 CSR 邻接表（每个原子只遍历自己的键）。
//
// 与渲染的关系：每个线程在积分后**直接写回球实例缓冲的 center**，
// 渲染管线下一帧就能看到新位置 —— 没有 CPU 读回、没有重新上传。
// 双缓冲：读 posIn、写 posOut，下一步交换 bind group，避免同一步内的读写竞争。
// ============================================================================

struct SphereInst {
  centerRadius: vec4<f32>,
  color: u32,
  id: u32,
  pad: vec2u,
}

struct BondRef {
  other: u32,
  rest: f32,
  k: f32,
  pad: f32,
}

struct MdU {
  dt: f32,
  count: u32,
  damping: f32,
  ljEpsilon: f32,
}

@group(0) @binding(0) var<storage, read> posIn: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read_write> posOut: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> prm: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> bondStart: array<u32>;
@group(0) @binding(5) var<storage, read> bonds: array<BondRef>;
@group(0) @binding(6) var<uniform> u: MdU;
@group(0) @binding(7) var<storage, read_write> inst: array<SphereInst>;

/** LJ 参数：sigma 固定 3.0 Å；epsilon 由 uniform 给（演示级，避免把分子炸开） */
const LJ_SIGMA: f32 = 3.0;

@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;

  if (i >= u.count) { return; }

  let pi = posIn[i].xyz;

  var f = vec3<f32>(0.0);

  // ---- 1. 非键：all-pairs Lennard-Jones ----
  for (var j = 0u; j < u.count; j = j + 1u) {
    if (j == i) { continue; }

    let d = pi - posIn[j].xyz;
    let r2 = max(dot(d, d), 1.0);
    let inv2 = (LJ_SIGMA * LJ_SIGMA) / r2;
    let inv6 = inv2 * inv2 * inv2;

    f += d * (24.0 * u.ljEpsilon * (2.0 * inv6 * inv6 - inv6) / r2);
  }

  // ---- 2. 成键：谐振键（CSR：每个原子只遍历自己的键） ----
  let start = bondStart[i];
  let end = bondStart[i + 1u];

  for (var k = start; k < end; k = k + 1u) {
    let bond = bonds[k];
    let d = posIn[bond.other].xyz - pi;
    let dist = max(length(d), 1e-4);
    let fMag = bond.k * (dist - bond.rest);

    f += (d / dist) * fMag;
  }

  // ---- 3. 半隐式积分（velocity Verlet 的简化形式） ----
  let mass = prm[i].x;
  var v = vel[i].xyz + (f / mass) * u.dt;
  v = v * (1.0 - u.damping);

  let next = pi + v * u.dt;

  posOut[i] = vec4<f32>(next, 0.0);
  vel[i] = vec4<f32>(v, 0.0);

  // ---- 4. 直接写回渲染实例（保持半径不变） ----
  var instData = inst[i];
  instData.centerRadius = vec4<f32>(next, instData.centerRadius.w);
  inst[i] = instData;
}

