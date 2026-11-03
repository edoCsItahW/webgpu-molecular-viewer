// ============================================================================
// common/impostor.wgsl
// ----------------------------------------------------------------------------
// Impostor（代理几何）的射线求交函数。
//
// 思路：球/柱不再细分网格，而是各画一个 quad（2 个三角形），
// 在片元着色器里用"相机 → 像素"的射线与解析形状求交，
// 得到精确的深度 / 法线。三角形数从 O(细分) 降到 2，形状仍然精确。
//
// 所有计算都在**视图空间**（相机在原点、朝 -Z）进行：
//   - 顶点阶段把中心/端点变换到视图空间；
//   - 片元阶段由 NDC 反解视线方向 dir = normalize(ndc.x/proj00, ndc.y/proj11, -1)；
//   - 求交后写 frag_depth = (proj * p).z / w。
// ============================================================================

/** 射线与球求交（射线起点在原点）。返回最近正交点距离，未命中返回 -1 */
fn raySphere(rd: vec3f, center: vec3f, radius: f32) -> f32 {
  let oc = -center;
  let b = dot(oc, rd);
  let c = dot(center, center) - radius * radius;
  let h = b * b - c;

  if (h < 0.0) { return -1.0; }

  let t = -b - sqrt(h);

  if (t < 0.0) { return -1.0; }

  return t;
}

/**
 * 射线与"有限长圆柱（带端盖）"求交（射线起点在原点）。
 * 参考 Inigo Quilez 的 ray-capped-cylinder，返回最近正交点距离，未命中返回 -1。
 */
fn rayCappedCylinder(rd: vec3f, a: vec3f, b: vec3f, radius: f32) -> f32 {
  let ba = b - a;
  let oa = -a;

  let baba = dot(ba, ba);
  let bard = dot(ba, rd);
  let baoa = dot(ba, oa);
  let rdoa = dot(rd, oa);
  let oaoa = dot(oa, oa);

  let a2 = baba - bard * bard;

  // 射线与轴平行：退化为两个端盖的求交
  if (abs(a2) < 1e-6) { return -1.0; }

  let b2 = baba * rdoa - baoa * bard;
  let c = baba * oaoa - baoa * baoa - radius * radius * baba;
  let h = b2 * b2 - a2 * c;

  if (h < 0.0) { return -1.0; }

  let t = (-b2 - sqrt(h)) / a2;
  let y = baoa + t * bard;

  // 侧面命中
  if (y > 0.0 && y < baba && t > 0.0) { return t; }

  // 端盖命中：y <= 0 用 a 端的球，否则用 b 端的球
  let oc = select(oa, -b, y > 0.0);
  let b3 = dot(rd, oc);
  let c3 = dot(oc, oc) - radius * radius;
  let h3 = b3 * b3 - c3;

  if (h3 < 0.0) { return -1.0; }

  let t3 = -b3 - sqrt(h3);

  if (t3 < 0.0) { return -1.0; }

  return t3;
}

/**
 * 视图空间法线 → 世界空间法线。
 * view 的行向量是相机三轴在世界空间的方向（列主序下 row r = (view[r], view[4+r], view[8+r])）。
 * 半球环境光需要世界空间的 N.y（"朝天/朝地"），否则相机会把光照带着转。
 */
fn viewNormalToWorld(n: vec3f, view: mat4x4<f32>) -> vec3f {
  let r0 = vec3f(view[0].x, view[1].x, view[2].x);
  let r1 = vec3f(view[0].y, view[1].y, view[2].y);
  let r2 = vec3f(view[0].z, view[1].z, view[2].z);

  return normalize(r0 * n.x + r1 * n.y + r2 * n.z);
}

/** 打包颜色（RGBA8）→ 线性 RGB（0..1）。打包端见 Batch.packColor */
fn unpackColor(c: u32) -> vec3<f32> {
  return vec3<f32>(
    f32(c & 255u) / 255.0,
    f32((c >> 8u) & 255u) / 255.0,
    f32((c >> 16u) & 255u) / 255.0
  );
}
