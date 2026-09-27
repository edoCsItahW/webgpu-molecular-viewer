// ============================================================================
// picking.wgsl
// ----------------------------------------------------------------------------
// GPU 拾取管线的着色器。
//
// 原理：
//   把每个物体的 objectId 作为颜色渲染到 r32uint 纹理。
//   点击时从纹理读回 u32，即得到被点击对象的 ID。
//
// 相比 CPU 射线求交的优势：
//   - 逐像素精确：可以拾取任意复杂形状
//   - 深度正确处理：被遮挡的对象自动不输出
//   - 无 CPU 循环：几千个原子一次 draw 完成
//
// 顶点阶段与 pbr.wgsl 完全一致（同样的顶点布局 + 同样的矩阵变换）。
// 片元阶段只输出 objectId。
//
// 为什么顶点阶段不 include pbr：
//   虽然顶点逻辑一致，但刻意保持独立。
//   PBR 顶点将来可能加更多输出（UV、切线等），
//   而 picking 只需 clipPosition。
//   过早抽象反而让两边互相牵制。
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
}

// ---------------------------------------------------------------------------
// 顶点阶段：只输出裁剪坐标
// ---------------------------------------------------------------------------

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  let worldPos = obj.model * vec4<f32>(in.position, 1.0);
  out.clipPosition = scene.viewProj * worldPos;
  return out;
}

// ---------------------------------------------------------------------------
// 片元阶段：输出 objectId
// ---------------------------------------------------------------------------
//
// 说明：
//   - 输出类型是 u32，对应 r32uint 格式的渲染目标
//   - objectId = 0 保留给"空"，真实对象的 ID 从 1 开始分配
//     （RenderPass 的 clearValue 也设为 0）
//   - 若要支持"实例化"拾取（一个 Mesh 内含多个原子），
//     需要把 objectId 改为从 instance buffer 读取；
//     当前设计是"一个 Mesh 一个 objectId"，够用于粗略拾取，
//     精确到原子的拾取由 AtomMesh 子类扩展。
//
// ---------------------------------------------------------------------------

@fragment
fn fs_main() -> @location(0) u32 {
  return obj.objectId;
}
