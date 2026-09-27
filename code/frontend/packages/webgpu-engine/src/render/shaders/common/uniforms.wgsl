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
// ============================================================================

// ----------------------------------------------------------------------------
// SceneUniforms
// 布局（float 偏移）：
//   0  ~ 15 : viewProj
//   16 ~ 18 : cameraPos.xyz    (19: pad)
//   20 ~ 22 : lightDir.xyz     (23: pad)
//   24 ~ 26 : lightColor.rgb   (27: pad)
//   28 ~ 30 : ambientColor.rgb (31: pad)
// 合计 32 floats = 128 字节
// ----------------------------------------------------------------------------
struct SceneUniforms {
  viewProj: mat4x4<f32>,
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
