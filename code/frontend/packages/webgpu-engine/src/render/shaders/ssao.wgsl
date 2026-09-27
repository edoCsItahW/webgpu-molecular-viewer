// ============================================================================
// ssao.wgsl
// ----------------------------------------------------------------------------
// 屏幕空间环境光遮蔽（Screen-Space Ambient Occlusion）。
//
// 原理：
//   对每个像素，在其视图空间邻域采样若干点。
//   如果邻域内存在"更靠近相机"的几何，说明当前像素被遮挡，
//   减少它的环境光贡献。
//
// 本实现采用简化版（Crytek 风格）：
//   - 只读深度纹理，不需要法线纹理
//   - 用固定 8 方向圆环采样
//   - 输出 r8unorm 单通道 AO 因子
//
// 顶点阶段：全屏三角形
//   用 vertex_index 0/1/2 生成一个大三角形覆盖整个屏幕。
//   比"全屏四边形"少一个三角形，且顶点只有 3 个。
//
// 采样半径 radius：
//   视图空间的半径（世界单位）。太大则跨物体边界出现"光晕"，
//   太小则看不到细节。0.3 ~ 1.0 对分子可视化比较合适。
//
// 强度 intensity：
//   0 表示完全无遮挡，1 表示最大遮挡。0.8 ~ 1.2 比较自然。
// ============================================================================

#include "common/uniforms"
#include "common/reconstruct"

// ---- group(0): scene uniform（复用 PBR 的 group 0）----
@group(0) @binding(0) var<uniform> scene: SceneUniforms;

// ---- group(0): SSAO 专用 uniform + 深度纹理 ----
// 说明：把 SSAO 参数放在 group 0 的额外 binding，
//       好处是 SSAO pass 只需要一个 BindGroup 就够。

struct SsaoUniforms {
  // 逆投影矩阵，用于从 (ndc, depth) 重建视图空间位置
  invProj: mat4x4<f32>,
  // x: 采样半径（视图空间单位）
  // y: 遮蔽强度
  // z: 深度偏置（避免自遮挡）
  // w: 未使用
  params: vec4<f32>,
  // 屏幕像素尺寸
  screenSize: vec2<f32>,
  _pad: vec2<f32>,
}

@group(0) @binding(1) var<uniform> ssao: SsaoUniforms;
@group(0) @binding(2) var depthTex: texture_depth_2d;

// ---------------------------------------------------------------------------
// 顶点阶段：全屏三角形
// ---------------------------------------------------------------------------

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  // 片元阶段需要 NDC 坐标来反查纹理
  @location(0) ndc: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) idx: u32) -> VertexOutput {
  var out: VertexOutput;

  // 通过位运算生成三个顶点：
  //   idx=0 → (-1, -1)
  //   idx=1 → ( 3, -1)
  //   idx=2 → (-1,  3)
  // 三角形覆盖整个 NDC 空间（超出部分被裁剪）
  let x = f32((idx << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(idx & 2u) * 2.0 - 1.0;

  out.clipPosition = vec4<f32>(x, y, 0.0, 1.0);
  out.ndc = vec2<f32>(x, y);
  return out;
}

// ---------------------------------------------------------------------------
// 片元阶段：SSAO
// ---------------------------------------------------------------------------

@fragment
fn fs_main(in: VertexOutput) -> @location(0) f32 {
  // ---- 1. 当前像素的深度 ----
  // NDC → 屏幕像素坐标
  let screenUV = in.ndc * 0.5 + vec2<f32>(0.5, 0.5);
  let pixelCoord = vec2<i32>(screenUV * ssao.screenSize);

  let depth = textureLoad(depthTex, pixelCoord, 0);

  // 深度为 1 表示背景（没有几何），不做遮蔽
  if (depth >= 1.0) {
    return 1.0;
  }

  // ---- 2. 重建当前像素的视图空间位置 ----
  let viewPos = reconstructViewPos(in.ndc, depth, ssao.invProj);

  // ---- 3. 采样邻域 ----
  let radius = ssao.params.x;
  let intensity = ssao.params.y;
  let bias = ssao.params.z;

  // 屏幕空间半径：把视图空间半径近似映射到像素
  // 这个映射不精确，但视觉上够用；精确做法需要用到相机投影参数
  let screenRadius = radius * 100.0;

  var occlusion = 0.0;
  let samples = 8;

  for (var i = 0u; i < samples; i = i + 1u) {
    // 8 方向均匀分布
    let angle = f32(i) / f32(samples) * 6.2831853;
    let dir = vec2<f32>(cos(angle), sin(angle));
    let sampleCoord = pixelCoord + vec2<i32>(dir * screenRadius);

    // 越界跳过
    if (sampleCoord.x < 0 || sampleCoord.y < 0 ||
        sampleCoord.x >= i32(ssao.screenSize.x) ||
        sampleCoord.y >= i32(ssao.screenSize.y)) {
      continue;
    }

    // 采样邻居深度
    let sampleDepth = textureLoad(depthTex, sampleCoord, 0);
    if (sampleDepth >= 1.0) {
      continue;  // 邻居是背景
    }

    // 邻居的 NDC 坐标
    let sampleNdc = (vec2<f32>(sampleCoord) / ssao.screenSize) * 2.0 - 1.0;
    // 注意：NDC 的 y 方向与屏幕像素 y 方向相反
    let sampleNdcFlipped = vec2<f32>(sampleNdc.x, -sampleNdc.y);

    // 重建邻居的视图空间位置
    let sampleViewPos = reconstructViewPos(
      sampleNdcFlipped, sampleDepth, ssao.invProj
    );

    // ---- 4. 遮挡判断 ----
    // 视图空间中，相机在原点看向 -Z。
    // sampleViewPos.z > viewPos.z 意味着邻居更靠近相机。
    let diffZ = sampleViewPos.z - viewPos.z;
    // 在半径范围内
    let dist = length(sampleViewPos - viewPos);

    // range check：距离越近权重越高
    let rangeCheck = smoothstep(0.0, 1.0, radius / max(dist, 0.0001));

    if (diffZ > bias) {
      occlusion += rangeCheck;
    }
  }

  // ---- 5. 合成最终 AO ----
  let ao = 1.0 - (occlusion / f32(samples)) * intensity;

  // 钳制到 [0, 1]
  return clamp(ao, 0.0, 1.0);
}
