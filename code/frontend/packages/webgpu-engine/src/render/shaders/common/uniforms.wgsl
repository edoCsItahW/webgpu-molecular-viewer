// ============================================================================
// common/uniforms.wgsl
// ----------------------------------------------------------------------------
// 三个 shader 共享的 uniform 结构体定义。
// 与 TypeScript 侧的 Scene.packSceneUniforms / Mesh.packObjectUniform
// 一一对应，任何字段变化必须同步修改两端。
//
// 为什么单独成文件：
//   1. PBR 与 Picking 都需要 SceneUniforms / ObjectUniforms
//   2. 结构体字段改了，只改这一个文件，所有引用它的 shader 一起更新
//   3. ShaderLibrary 的 #include 保证字段定义只有一份真值
//
// P2 变更：SceneUniforms 增加 view / proj 两个矩阵（供 impostor 在视图空间
// 做射线求交与深度计算）。总大小 32 → 64 floats（128 → 256 B）。
// ============================================================================

// ----------------------------------------------------------------------------
// SceneUniforms
// 布局（float 偏移）：
//   0  ~ 15 : viewProj
//   16 ~ 31 : view
//   32 ~ 47 : proj
//   48 ~ 50 : cameraPos.xyz    (51: pad)
//   52 ~ 54 : lightDir.xyz     (55: pad)
//   56 ~ 58 : lightColor.rgb   (59: pad)
//   60 ~ 62 : ambientColor.rgb (63: pad)
// 合计 64 floats = 256 字节
// ----------------------------------------------------------------------------
struct SceneUniforms {
  viewProj: mat4x4<f32>,
  view: mat4x4<f32>,
  proj: mat4x4<f32>,
  cameraPos: vec3<f32>,
  _pad0: f32,
  lightDir: vec3<f32>,
  _pad1: f32,
  lightColor: vec3<f32>,
  _pad2: f32,
  ambientColor: vec3<f32>,
  _pad3: f32,
}

// ----------------------------------------------------------------------------
// ObjectUniforms
// 布局：
//   0  ~ 15 : model
//   16 ~ 18 : color.rgb
//   19      : objectId (picking 用，pbr 忽略)
// 合计 20 floats = 80 字节
//
// 说明：objectId 复用 pad 槽位，PBR 不做 special 处理（写 0 即可），
//       Picking 写入原子索引。这样两个 shader 可以共享同一个 BindGroupLayout，
//       只需切换 fragment target 格式（bgra8unorm vs r32uint）。
// ----------------------------------------------------------------------------
struct ObjectUniforms {
  model: mat4x4<f32>,
  color: vec3<f32>,
  objectId: u32,
}
