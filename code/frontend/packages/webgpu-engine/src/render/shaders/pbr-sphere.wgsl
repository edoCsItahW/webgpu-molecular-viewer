// ============================================================================
// pbr-sphere.wgsl（P3：storage buffer + compute 剔除 + indirect draw）
// ----------------------------------------------------------------------------
// 顶点阶段不再从实例属性读 mat4，而是：
//   instance_index → visible[instance_index] → spheres[实例下标]
// 这样 cull pass 可以把"不可见实例"压缩掉，drawIndexedIndirect 只画可见的。
//
// 实例布局（32 B）：
//   centerRadius vec4（xyz = 球心，w = 半径）
//   color u32（RGBA8）、id u32、pad
// ============================================================================

#include "common/uniforms"
#include "common/impostor"

struct SphereInst {
  centerRadius: vec4<f32>,
  color: u32,
  id: u32,
  pad: vec2u,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> spheres: array<SphereInst>;
@group(1) @binding(1) var<storage, read> visible: array<u32>;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) centerView: vec3<f32>,
  @location(1) radius: f32,
  @location(2) color: vec3<f32>,
  @location(3) @interpolate(linear) ndc: vec2<f32>,
}

struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>, @builtin(instance_index) ii: u32) -> VertexOutput {
  let inst = spheres[visible[ii]];

  let center = inst.centerRadius.xyz;
  let radius = inst.centerRadius.w;
  let centerView = (scene.view * vec4<f32>(center, 1.0)).xyz;

  let p = centerView + vec3<f32>(position.x * radius, position.y * radius, 0.0);
  let clip = scene.proj * vec4<f32>(p, 1.0);

  var out: VertexOutput;
  out.clipPosition = clip;
  out.centerView = centerView;
  out.radius = radius;
  out.color = unpackColor(inst.color);
  out.ndc = clip.xy / clip.w;

  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> FragmentOutput {
  let dir = normalize(vec3<f32>(
    in.ndc.x / scene.proj[0][0],
    in.ndc.y / scene.proj[1][1],
    -1.0
  ));

  let t = raySphere(dir, in.centerView, in.radius);

  if (t < 0.0) { discard; }

  let p = dir * t;
  let n = normalize(p - in.centerView);
  let worldN = viewNormalToWorld(n, scene.view);

  let L = normalize((scene.view * vec4<f32>(scene.lightDir, 0.0)).xyz);
  let V = normalize(-p);
  let H = normalize(L + V);

  let baseColor = in.color;
  let ambient = scene.ambientColor * baseColor;

  let skyColor = vec3<f32>(0.05, 0.07, 0.12);
  let groundColor = vec3<f32>(0.03, 0.02, 0.02);
  let hemiFactor = worldN.y * 0.5 + 0.5;
  let hemi = mix(groundColor, skyColor, hemiFactor) * baseColor;

  let NdotL = max(dot(n, L), 0.0);
  let diff = NdotL * scene.lightColor * baseColor;
  let spec = pow(max(dot(n, H), 0.0), 32.0) * scene.lightColor * 0.6;

  let clip = scene.proj * vec4<f32>(p, 1.0);

  var out: FragmentOutput;
  out.color = vec4<f32>(ambient + hemi + diff + spec, 1.0);
  out.depth = clip.z / clip.w;

  return out;
}
