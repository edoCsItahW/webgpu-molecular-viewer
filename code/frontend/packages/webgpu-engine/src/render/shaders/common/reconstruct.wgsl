// ============================================================================
// common/reconstruct.wgsl
// ----------------------------------------------------------------------------
// 从深度纹理重建视图空间位置。
//
// 输入：
//   ndc      —— NDC 坐标（x, y ∈ [-1, 1]，y 向上）
//   depth    —— 采样得到的深度值 ∈ [0, 1]（WebGPU 约定）
//   invProj  —— 逆投影矩阵（相机 projectionMatrix 的逆）
//
// 输出：视图空间位置（相机在原点，看向 -Z）
//
// 推导：
//   1. 构造 clip space 点：(ndc.x, ndc.y, depth, 1)
//   2. 乘 invProj 得到投影前的齐次坐标
//   3. 除以 w 得到视图空间位置
// ============================================================================

fn reconstructViewPos(
  ndc: vec2<f32>,
  depth: f32,
  invProj: mat4x4<f32>,
) -> vec3<f32> {
  let clipPos = vec4<f32>(ndc, depth, 1.0);
  let viewPos4 = invProj * clipPos;
  return viewPos4.xyz / viewPos4.w;
}
