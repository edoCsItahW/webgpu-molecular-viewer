// ============================================================================
// pbr-cylinder.wgsl（P3：storage buffer + compute 剔除 + indirect draw）
// ----------------------------------------------------------------------------
// 实例布局（48 B）：
//   aRadius vec4（xyz = 端点 A，w = 半径）
//   b       vec4（xyz = 端点 B，w 未用）
//   color   u32（RGBA8）、id u32、pad
//
// 顶点阶段：visible[instance_index] → 实例 → 视图空间端点 → quad 展开；
// 片元阶段：射线与带端盖圆柱求交，写精确深度与法线。
// ============================================================================

#include "common/uniforms"
#include "common/impostor"

struct CylinderInst {
  aRadius: vec4<f32>,
  b: vec4<f32>,
  color: u32,
  id: u32,
  pad: vec2u,
}

@group(0) @binding(0) var<uniform> scene: SceneUniforms;
@group(1) @binding(0) var<storage, read> cylinders: array<CylinderInst>;
@group(1) @binding(1) var<storage, read> visible: array<u32>;

struct VertexOutput {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) @interpolate(flat) a: vec3<f32>,
  @location(1) @interpolate(flat) b: vec3<f32>,
  @location(2) @interpolate(flat) radius: f32,
  @location(3) color: vec3<f32>,
  @location(4) @interpolate(linear) ndc: vec2<f32>,
}

struct FragmentOutput {
  @location(0) color: vec4<f32>,
  @builtin(frag_depth) depth: f32,
}

@vertex
fn vs_main(@location(0) position: vec3<f32>, @builtin(instance_index) ii: u32) -> VertexOutput {
  let inst = cylinders[visible[ii]];

  let a = inst.aRadius.xyz;
  let radius = inst.aRadius.w;
  let b = inst.b.xyz;

  let av = (scene.view * vec4<f32>(a, 1.0)).xyz;
  let bv = (scene.view * vec4<f32>(b, 1.0)).xyz;

  let axis = normalize(bv - av);
  let mid = (av + bv) * 0.5;

  var side = cross(axis, normalize(mid));

  if (length(side) < 1e-4) {
    side = cross(axis, vec3<f32>(0.0, 1.0, 0.0));
  }
  if (length(side) < 1e-4) {
    side = vec3<f32>(1.0, 0.0, 0.0);
  }
  side = normalize(side);

  let aExt = av - axis * radius;
  let bExt = bv + axis * radius;

  let base = select(aExt, bExt, position.y > 0.0);
  let p = base + side * (position.x * radius);
  let clip = scene.proj * vec4<f32>(p, 1.0);

  var out: VertexOutput;
  out.clipPosition = clip;
  out.a = av;
  out.b = bv;
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

  let t = rayCappedCylinder(dir, in.a, in.b, in.radius);

  if (t < 0.0) { discard; }

  let p = dir * t;

  let ba = in.b - in.a;
  let h = clamp(dot(p - in.a, ba) / max(dot(ba, ba), 1e-8), 0.0, 1.0);
  let closest = in.a + ba * h;

  var n = p - closest;
  if (length(n) < 1e-5) {
    n = cross(ba, dir);
  }
  n = normalize(n);

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
