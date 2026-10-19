// 微基准：同一 4HHB 场景，测 WebGPU/WebGL2 的实例化 vs 逐对象、拾取与 compute
/* global GPUBufferUsage, GPUTextureUsage, GPUShaderStage, GPUMapMode */

const W = 1002;
const H = 928;
const FOV = (45 * Math.PI) / 180;
const BOND_R = 0.12;

const $ = (id) => document.getElementById(id);
const state = {
    api: null, mode: 'instanced', running: false, angle: 0,
    stamps: [], cpu: [], raf: 0,
    scene: null, data: null, viewProj: null,
};

// ---------------- 数学（列主序） ----------------
function mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
    }
    return o;
}
function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = far / (near - far); o[11] = -1;
    o[14] = (far * near) / (near - far);
    return o;
}
function normalize(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
}
function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function lookAt(eye, target, up) {
    const z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    const o = new Float32Array(16);
    o[0] = x[0]; o[1] = y[0]; o[2] = z[0];
    o[4] = x[1]; o[5] = y[1]; o[6] = z[1];
    o[8] = x[2]; o[9] = y[2]; o[10] = z[2];
    o[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    o[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    o[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    o[15] = 1;
    return o;
}
function rotationY(a) {
    const c = Math.cos(a), s = Math.sin(a);
    return Float32Array.of(c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1);
}

// ---------------- 场景与实例 ----------------
async function loadScene() {
    const scene = await (await fetch('./scene.json')).json();
    const [cx, cy, cz] = scene.center;
    for (const a of scene.atoms) { a[0] -= cx; a[1] -= cy; a[2] -= cz; }

    const n = scene.atoms.length, m = scene.bonds.length;
    const atomInst = new Float32Array(n * 20);
    for (let i = 0; i < n; i++) {
        const [x, y, z, r, cr, cg, cb] = scene.atoms[i];
        const o = i * 20;
        atomInst[o] = r; atomInst[o + 5] = r; atomInst[o + 10] = r;
        atomInst[o + 12] = x; atomInst[o + 13] = y; atomInst[o + 14] = z; atomInst[o + 15] = 1;
        atomInst[o + 16] = cr; atomInst[o + 17] = cg; atomInst[o + 18] = cb; atomInst[o + 19] = 1;
    }
    const bondInst = new Float32Array(m * 20);
    for (let i = 0; i < m; i++) {
        const [a, b] = scene.bonds[i];
        const pa = scene.atoms[a], pb = scene.atoms[b];
        const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
        const len = Math.hypot(...d);
        const y = [d[0] / len, d[1] / len, d[2] / len];
        const helper = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
        const x = normalize(cross(y, helper));
        const z = cross(x, y);
        const o = i * 20;
        for (let k = 0; k < 3; k++) {
            bondInst[o + k] = x[k] * BOND_R;
            bondInst[o + 4 + k] = y[k] * len;
            bondInst[o + 8 + k] = z[k] * BOND_R;
        }
        bondInst[o + 12] = (pa[0] + pb[0]) / 2;
        bondInst[o + 13] = (pa[1] + pb[1]) / 2;
        bondInst[o + 14] = (pa[2] + pb[2]) / 2;
        bondInst[o + 15] = 1;
        bondInst[o + 16] = (pa[4] + pb[4]) / 2;
        bondInst[o + 17] = (pa[5] + pb[5]) / 2;
        bondInst[o + 18] = (pa[6] + pb[6]) / 2;
        bondInst[o + 19] = 1;
    }

    const eye = [0, 0, scene.radius / Math.sin(FOV / 2) * 1.05];
    state.scene = scene;
    state.data = {atomInst, bondInst};
    state.viewProj = mul(perspective(FOV, W / H, 1, 600), lookAt(eye, [0, 0, 0], [0, 1, 0]));
    return {atoms: n, bonds: m};
}

// ---------------- 几何 ----------------
function interleave(pos, nrm) {
    const n = pos.length / 3, data = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
        data[i * 6] = pos[i * 3]; data[i * 6 + 1] = pos[i * 3 + 1]; data[i * 6 + 2] = pos[i * 3 + 2];
        data[i * 6 + 3] = nrm[i * 3]; data[i * 6 + 4] = nrm[i * 3 + 1]; data[i * 6 + 5] = nrm[i * 3 + 2];
    }
    return {vertices: data};
}
function buildSphere(lon = 16, lat = 12) {
    const pos = [], nrm = [], idx = [];
    for (let y = 0; y <= lat; y++) {
        const theta = (y / lat) * Math.PI;
        for (let x = 0; x <= lon; x++) {
            const phi = (x / lon) * Math.PI * 2;
            const nx = Math.sin(theta) * Math.cos(phi), ny = Math.cos(theta), nz = Math.sin(theta) * Math.sin(phi);
            pos.push(nx, ny, nz); nrm.push(nx, ny, nz);
        }
    }
    for (let y = 0; y < lat; y++) {
        for (let x = 0; x < lon; x++) {
            const a = y * (lon + 1) + x, b = a + lon + 1;
            idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
    }
    return {...interleave(pos, nrm), indices: new Uint32Array(idx)};
}
function buildCylinder(seg = 8) {
    const pos = [], nrm = [], idx = [];
    for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a);
        pos.push(cx, -0.5, cz, cx, 0.5, cz);
        nrm.push(cx, 0, cz, cx, 0, cz);
    }
    for (let i = 0; i < seg; i++) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, c, b, c, d, b);
    }
    for (const side of [-0.5, 0.5]) {
        const base = pos.length / 3;
        pos.push(0, side, 0); nrm.push(0, side > 0 ? 1 : -1, 0);
        for (let i = 0; i <= seg; i++) {
            const a = (i / seg) * Math.PI * 2;
            pos.push(Math.cos(a), side, Math.sin(a));
            nrm.push(0, side > 0 ? 1 : -1, 0);
        }
        for (let i = 0; i < seg; i++) {
            if (side > 0) idx.push(base, base + 1 + i, base + 2 + i);
            else idx.push(base, base + 2 + i, base + 1 + i);
        }
    }
    return {...interleave(pos, nrm), indices: new Uint32Array(idx)};
}

// ---------------- WGSL ----------------
const SCENE_STRUCT = `
struct Scene { viewProj: mat4x4f, rot: mat4x4f, baseId: u32, p0: u32, p1: u32, p2: u32 };
`;
const LIGHT = `
  let l = normalize(vec3f(0.45, 1.0, 0.65));
  let d = max(dot(normalize(i.nrm), l), 0.0);
  return vec4f(i.color * (0.28 + 0.72 * d), 1.0);
`;

const VS_INST = `
${SCENE_STRUCT}
@group(0) @binding(0) var<uniform> scene: Scene;
struct VOut { @builtin(position) pos: vec4f, @location(0) nrm: vec3f, @location(1) color: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f,
  @location(2) m0: vec4f, @location(3) m1: vec4f, @location(4) m2: vec4f, @location(5) m3: vec4f,
  @location(6) color: vec4f) -> VOut {
  let model = mat4x4f(m0, m1, m2, m3);
  let wp = scene.rot * model * vec4f(p, 1.0);
  var o: VOut;
  o.pos = scene.viewProj * wp;
  o.nrm = normalize((scene.rot * model * vec4f(n, 0.0)).xyz);
  o.color = color.rgb;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f { ${LIGHT} }
`;

const VS_OBJ = `
${SCENE_STRUCT}
struct Object { model: mat4x4f, color: vec4f, id: u32, p0: u32, p1: u32, p2: u32 };
@group(0) @binding(0) var<uniform> scene: Scene;
@group(1) @binding(0) var<uniform> obj: Object;
struct VOut { @builtin(position) pos: vec4f, @location(0) nrm: vec3f, @location(1) color: vec3f };
@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VOut {
  let wp = scene.rot * obj.model * vec4f(p, 1.0);
  var o: VOut;
  o.pos = scene.viewProj * wp;
  o.nrm = normalize((scene.rot * obj.model * vec4f(n, 0.0)).xyz);
  o.color = obj.color.rgb;
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4f { ${LIGHT} }
`;

const ID_INST = `
${SCENE_STRUCT}
@group(0) @binding(0) var<uniform> scene: Scene;
struct VOut { @builtin(position) pos: vec4f, @location(0) @interpolate(flat) id: u32 };
@vertex fn vs(@location(0) p: vec3f,
  @location(2) m0: vec4f, @location(3) m1: vec4f, @location(4) m2: vec4f, @location(5) m3: vec4f,
  @builtin(instance_index) ii: u32) -> VOut {
  let model = mat4x4f(m0, m1, m2, m3);
  var o: VOut;
  o.pos = scene.viewProj * scene.rot * model * vec4f(p, 1.0);
  o.id = select(0u, scene.baseId + ii, scene.baseId != 0u);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) u32 { return i.id; }
`;

const ID_OBJ = `
${SCENE_STRUCT}
struct Object { model: mat4x4f, color: vec4f, id: u32, p0: u32, p1: u32, p2: u32 };
@group(0) @binding(0) var<uniform> scene: Scene;
@group(1) @binding(0) var<uniform> obj: Object;
@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return scene.viewProj * scene.rot * obj.model * vec4f(p, 1.0);
}
@fragment fn fs() -> @location(0) u32 { return obj.id; }
`;

const PICK_WGSL = `
struct AtomP { p: vec4f, r: vec4f };
struct PickU { viewProj: mat4x4f, rot: mat4x4f, click: vec2f, screen: vec2f, tanHalfFov: f32, count: u32, pad: vec2f };
@group(0) @binding(0) var<storage, read> atoms: array<AtomP>;
@group(0) @binding(1) var<uniform> u: PickU;
@group(0) @binding(2) var<storage, read_write> res: array<atomic<u32>, 2>;

fn ndcZ(i: u32) -> f32 {
  let wp = u.rot * vec4f(atoms[i].p.xyz, 1.0);
  let clip = u.viewProj * wp;
  return clip.z / clip.w;
}
fn hits(i: u32) -> bool {
  let wp = u.rot * vec4f(atoms[i].p.xyz, 1.0);
  let clip = u.viewProj * wp;
  if (clip.w <= 0.0) { return false; }
  let ndc = clip.xy / clip.w;
  let px = (ndc.x * 0.5 + 0.5) * u.screen.x;
  let py = (0.5 - ndc.y * 0.5) * u.screen.y;
  let radPx = atoms[i].r.x * u.screen.y * 0.5 / (u.tanHalfFov * clip.w);
  return distance(vec2f(px, py), u.click) <= radPx + 2.0;
}

@compute @workgroup_size(128)
fn minDepth(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.count || !hits(i)) { return; }
  let z = ndcZ(i);
  if (z < 0.0 || z > 1.0) { return; }
  atomicMin(&res[0], bitcast<u32>(z));
}
@compute @workgroup_size(128)
fn minIndex(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.count || !hits(i)) { return; }
  if (bitcast<u32>(ndcZ(i)) != atomicLoad(&res[0])) { return; }
  atomicMin(&res[1], i);
}
`;

const MD_WGSL = `
struct Atom { pos: vec4f, vel: vec4f, prm: vec4f };
struct StepU { dt: f32, count: u32, pad: vec2f };
@group(0) @binding(0) var<storage, read> src: array<Atom>;
@group(0) @binding(1) var<storage, read_write> dst: array<Atom>;
@group(0) @binding(2) var<uniform> u: StepU;
@compute @workgroup_size(128)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u.count) { return; }
  let pi = src[i].pos.xyz;
  let si = src[i].prm.x;
  let ei = src[i].prm.y;
  var f = vec3f(0.0);
  for (var j = 0u; j < u.count; j = j + 1u) {
    if (j == i) { continue; }
    let d = pi - src[j].pos.xyz;
    let r2 = max(dot(d, d), 0.01);
    let s = 0.5 * (si + src[j].prm.x);
    let e = sqrt(ei * src[j].prm.y);
    let inv2 = s * s / r2;
    let inv6 = inv2 * inv2 * inv2;
    let fs = 24.0 * e * (2.0 * inv6 * inv6 - inv6) / r2;
    f += d * fs;
  }
  var v = src[i].vel.xyz + f / src[i].prm.z * u.dt;
  v = v * 0.999;
  let p = pi + v * u.dt;
  dst[i].pos = vec4f(p, 1.0);
  dst[i].vel = vec4f(v, 0.0);
  dst[i].prm = src[i].prm;
}
`;

// ---------------- WebGPU ----------------
const gpu = {
    device: null, ctx: null, format: null, adapterInfo: null,
    sphere: null, cyl: null, atomVB: null, bondVB: null,
    sceneAtoms: null, sceneBonds: null, bgAtoms: null, bgBonds: null,
    depth: null, depthView: null,
    idTex: null, idDepth: null, idView: null, idDepthView: null, readBuf: null,
    pipelines: {}, bgls: {}, objBufs: [], objBGs: [],
    pick: null, md: null, counts: null,
};

function gpuBuf(data, usage) {
    const b = gpu.device.createBuffer({size: Math.max(4, data.byteLength), usage, mappedAtCreation: true});
    new Uint8Array(b.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    b.unmap();
    return b;
}

function makePipeline(fsTarget, vsCode, layout, buffers, depth = true) {
    const device = gpu.device;
    return device.createRenderPipeline({
        layout: device.createPipelineLayout({bindGroupLayouts: layout}),
        vertex: {module: device.createShaderModule({code: vsCode}), entryPoint: 'vs', buffers},
        fragment: {module: device.createShaderModule({code: fsTarget.code}), entryPoint: 'fs', targets: [{format: fsTarget.format}]},
        primitive: {topology: 'triangle-list', cullMode: 'none'},
        depthStencil: depth ? {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less'} : undefined,
    });
}

async function initGPU() {
    const device0 = await navigator.gpu.requestAdapter();
    if (!device0) throw new Error('no adapter');
    const hasTS = device0.features.has('timestamp-query');
    gpu.hasTimestamp = hasTS;
    gpu.device = await device0.requestDevice(hasTS ? {requiredFeatures: ['timestamp-query']} : {});
    gpu.adapterInfo = {vendor: device0.info?.vendor ?? null};
    gpu.ctx = $('gpu').getContext('webgpu');
    gpu.format = navigator.gpu.getPreferredCanvasFormat();
    gpu.ctx.configure({device: gpu.device, format: gpu.format, alphaMode: 'opaque'});
    const device = gpu.device;

    const {atomInst, bondInst} = state.data;
    gpu.counts = {atoms: state.scene.atoms.length, bonds: state.scene.bonds.length};
    gpu.atomVB = gpuBuf(atomInst, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    gpu.bondVB = gpuBuf(bondInst, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    gpu.atomData = atomInst;
    gpu.bondData = bondInst;

    const sphere = buildSphere(), cyl = buildCylinder();
    gpu.sphere = {vb: gpuBuf(sphere.vertices, GPUBufferUsage.VERTEX), ib: gpuBuf(sphere.indices, GPUBufferUsage.INDEX), count: sphere.indices.length};
    gpu.cyl = {vb: gpuBuf(cyl.vertices, GPUBufferUsage.VERTEX), ib: gpuBuf(cyl.indices, GPUBufferUsage.INDEX), count: cyl.indices.length};

    const sceneBGL = device.createBindGroupLayout({entries: [{binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}}]});
    const objectBGL = device.createBindGroupLayout({entries: [{binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {type: 'uniform'}}]});
    gpu.bgls = {scene: sceneBGL, object: objectBGL};

    const geomOnly = [{arrayStride: 24, attributes: [{shaderLocation: 0, offset: 0, format: 'float32x3'}, {shaderLocation: 1, offset: 12, format: 'float32x3'}]}];
    const geomInst = [...geomOnly, {arrayStride: 80, stepMode: 'instance', attributes: [
        {shaderLocation: 2, offset: 0, format: 'float32x4'},
        {shaderLocation: 3, offset: 16, format: 'float32x4'},
        {shaderLocation: 4, offset: 32, format: 'float32x4'},
        {shaderLocation: 5, offset: 48, format: 'float32x4'},
        {shaderLocation: 6, offset: 64, format: 'float32x4'}]}];

    const colorFmt = gpu.format;
    gpu.pipelines.inst = makePipeline({code: VS_INST, format: colorFmt}, VS_INST, [sceneBGL], geomInst);
    gpu.pipelines.obj = makePipeline({code: VS_OBJ, format: colorFmt}, VS_OBJ, [sceneBGL, objectBGL], geomOnly);
    gpu.pipelines.idInst = makePipeline({code: ID_INST, format: 'r32uint'}, ID_INST, [sceneBGL], geomInst);
    gpu.pipelines.idObj = makePipeline({code: ID_OBJ, format: 'r32uint'}, ID_OBJ, [sceneBGL, objectBGL], geomOnly);

    gpu.sceneAtoms = device.createBuffer({size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    gpu.sceneBonds = device.createBuffer({size: 144, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    gpu.bgAtoms = device.createBindGroup({layout: sceneBGL, entries: [{binding: 0, resource: {buffer: gpu.sceneAtoms}}]});
    gpu.bgBonds = device.createBindGroup({layout: sceneBGL, entries: [{binding: 0, resource: {buffer: gpu.sceneBonds}}]});

    gpu.depth = device.createTexture({size: [W, H], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT});
    gpu.depthView = gpu.depth.createView();
    gpu.idTex = device.createTexture({size: [W, H], format: 'r32uint', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
    gpu.idDepth = device.createTexture({size: [W, H], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT});
    gpu.idView = gpu.idTex.createView();
    gpu.idDepthView = gpu.idDepth.createView();
    gpu.readBuf = device.createBuffer({size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});

    if (state.mode === 'perObject' || state.mode === 'perObjectStatic') await initObjects(state.mode === 'perObjectStatic');
    await initPickGPU();
    await initMD();
}

async function initObjects(prefill = false) {
    const device = gpu.device;
    const total = gpu.counts.atoms + gpu.counts.bonds;
    for (let i = 0; i < total; i++) {
        const buf = device.createBuffer({size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
        gpu.objBufs.push(buf);
        gpu.objBGs.push(device.createBindGroup({layout: gpu.bgls.object, entries: [{binding: 0, resource: {buffer: buf}}]}));
    }
    if (!prefill) return;
    // 静态变体：model/color/id 只在初始化时写一次，帧循环只 setBindGroup + draw
    const n = gpu.counts.atoms, m = gpu.counts.bonds;
    for (let i = 0; i < n; i++) {
        const o = i * 20;
        device.queue.writeBuffer(gpu.objBufs[i], 0, objUniform(gpu.atomData, o,
            [gpu.atomData[o + 16], gpu.atomData[o + 17], gpu.atomData[o + 18]], i + 1));
    }
    for (let i = 0; i < m; i++) {
        const o = i * 20;
        device.queue.writeBuffer(gpu.objBufs[n + i], 0, objUniform(gpu.bondData, o,
            [gpu.bondData[o + 16], gpu.bondData[o + 17], gpu.bondData[o + 18]], 0));
    }
}

function writeScene(buf, baseId, rot) {
    const ab = new ArrayBuffer(144);
    new Float32Array(ab).set(state.viewProj, 0);
    new Float32Array(ab).set(rot, 16);
    new Uint32Array(ab, 128, 4).set([baseId, 0, 0, 0]);
    gpu.device.queue.writeBuffer(buf, 0, ab);
}

function objUniform(src, offset, color, id) {
    const u = new Float32Array(24);
    u.set(src.subarray(offset, offset + 16));
    u[16] = color[0]; u[17] = color[1]; u[18] = color[2]; u[19] = 1;
    u[20] = id; u[21] = 0; u[22] = 0; u[23] = 0;
    return u;
}

function renderGPU(encoder, targetView, idPass = false) {
    const rot = rotationY(state.angle);
    writeScene(gpu.sceneAtoms, 1, rot);
    writeScene(gpu.sceneBonds, 0, rot);
    const pass = encoder.beginRenderPass({
        colorAttachments: [{view: targetView, loadOp: 'clear', storeOp: 'store',
            clearValue: idPass ? {r: 0, g: 0, b: 0, a: 0} : {r: 0.055, g: 0.067, b: 0.086, a: 1}}],
        depthStencilAttachment: {view: idPass ? gpu.idDepthView : gpu.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'},
    });

    if (idPass) {
        pass.setPipeline(gpu.pipelines.idInst);
        pass.setBindGroup(0, gpu.bgAtoms);
        pass.setVertexBuffer(0, gpu.sphere.vb);
        pass.setVertexBuffer(1, gpu.atomVB);
        pass.setIndexBuffer(gpu.sphere.ib, 'uint32');
        pass.drawIndexed(gpu.sphere.count, gpu.counts.atoms);
        pass.setBindGroup(0, gpu.bgBonds);
        pass.setVertexBuffer(0, gpu.cyl.vb);
        pass.setVertexBuffer(1, gpu.bondVB);
        pass.setIndexBuffer(gpu.cyl.ib, 'uint32');
        pass.drawIndexed(gpu.cyl.count, gpu.counts.bonds);
        pass.end();
        return;
    }

    if (state.mode === 'instanced') {
        pass.setPipeline(gpu.pipelines.inst);
        pass.setBindGroup(0, gpu.bgAtoms);
        pass.setVertexBuffer(0, gpu.sphere.vb);
        pass.setVertexBuffer(1, gpu.atomVB);
        pass.setIndexBuffer(gpu.sphere.ib, 'uint32');
        pass.drawIndexed(gpu.sphere.count, gpu.counts.atoms);
        pass.setVertexBuffer(0, gpu.cyl.vb);
        pass.setVertexBuffer(1, gpu.bondVB);
        pass.setIndexBuffer(gpu.cyl.ib, 'uint32');
        pass.drawIndexed(gpu.cyl.count, gpu.counts.bonds);
        pass.end();
        return;
    }

    pass.setPipeline(gpu.pipelines.obj);
    pass.setBindGroup(0, gpu.bgAtoms);
    const n = gpu.counts.atoms, m = gpu.counts.bonds;
    const upload = state.mode === 'perObject';   // perObjectStatic 只画，不上传
    for (let i = 0; i < n; i++) {
        const o = i * 20;
        if (upload) gpu.device.queue.writeBuffer(gpu.objBufs[i], 0, objUniform(gpu.atomData, o, [gpu.atomData[o + 16], gpu.atomData[o + 17], gpu.atomData[o + 18]], i + 1));
        pass.setBindGroup(1, gpu.objBGs[i]);
        pass.setVertexBuffer(0, gpu.sphere.vb);
        pass.setIndexBuffer(gpu.sphere.ib, 'uint32');
        pass.drawIndexed(gpu.sphere.count);
    }
    for (let i = 0; i < m; i++) {
        const o = i * 20;
        if (upload) gpu.device.queue.writeBuffer(gpu.objBufs[n + i], 0, objUniform(gpu.bondData, o, [gpu.bondData[o + 16], gpu.bondData[o + 17], gpu.bondData[o + 18]], 0));
        pass.setBindGroup(1, gpu.objBGs[n + i]);
        pass.setVertexBuffer(0, gpu.cyl.vb);
        pass.setIndexBuffer(gpu.cyl.ib, 'uint32');
        pass.drawIndexed(gpu.cyl.count);
    }
    pass.end();
}

function gpuFrame(ts) {
    if (!state.running) return;
    state.angle += 0.004;
    const t0 = performance.now();
    const enc = gpu.device.createCommandEncoder();
    renderGPU(enc, gpu.ctx.getCurrentTexture().createView(), false);
    gpu.device.queue.submit([enc.finish()]);
    state.cpu.push(performance.now() - t0);
    state.stamps.push(ts);
    state.raf = requestAnimationFrame(gpuFrame);
}

// ---------------- 拾取 ----------------
async function initPickGPU() {
    const device = gpu.device;
    const n = gpu.counts.atoms;
    const atoms = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
        const a = state.scene.atoms[i];
        atoms[i * 8] = a[0]; atoms[i * 8 + 1] = a[1]; atoms[i * 8 + 2] = a[2]; atoms[i * 8 + 3] = 1;
        atoms[i * 8 + 4] = a[3];
    }
    const atomBuf = gpuBuf(atoms, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const ubo = device.createBuffer({size: 160, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    const res = device.createBuffer({size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST});
    const read = device.createBuffer({size: 8, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
    const bgl = device.createBindGroupLayout({entries: [
        {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'read-only-storage'}},
        {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'uniform'}},
        {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'storage'}}]});
    const pl = device.createPipelineLayout({bindGroupLayouts: [bgl]});
    const module = device.createShaderModule({code: PICK_WGSL});
    gpu.pick = {
        ubo, res, read, n,
        bg: device.createBindGroup({layout: bgl, entries: [
            {binding: 0, resource: {buffer: atomBuf}},
            {binding: 1, resource: {buffer: ubo}},
            {binding: 2, resource: {buffer: res}}]}),
        minDepth: device.createComputePipeline({layout: pl, compute: {module, entryPoint: 'minDepth'}}),
        minIndex: device.createComputePipeline({layout: pl, compute: {module, entryPoint: 'minIndex'}}),
    };
}

function writePickU(clickX, clickY) {
    const ab = new ArrayBuffer(160);
    const f = new Float32Array(ab);
    f.set(state.viewProj, 0);
    f.set(rotationY(state.angle), 16);
    f[32] = clickX; f[33] = clickY; f[34] = W; f[35] = H;
    f[36] = Math.tan(FOV / 2);
    new Uint32Array(ab, 148, 1)[0] = gpu.counts.atoms;
    gpu.device.queue.writeBuffer(gpu.pick.ubo, 0, ab);
}

async function pickIdPassObj(clickX, clickY, scissor) {
    const t0 = performance.now();
    const device = gpu.device;
    const enc = device.createCommandEncoder();
    const rot = rotationY(state.angle);
    writeScene(gpu.sceneAtoms, 1, rot);
    writeScene(gpu.sceneBonds, 0, rot);
    const pass = enc.beginRenderPass({
        colorAttachments: [{view: gpu.idView, loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 0}}],
        depthStencilAttachment: {view: gpu.idDepthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'},
    });
    if (scissor) pass.setScissorRect(Math.max(0, clickX - 8), Math.max(0, clickY - 8), 16, 16);
    pass.setPipeline(gpu.pipelines.idObj);
    pass.setBindGroup(0, gpu.bgAtoms);
    const n = gpu.counts.atoms, m = gpu.counts.bonds;
    for (let i = 0; i < n; i++) {
        const o = i * 20;
        device.queue.writeBuffer(gpu.objBufs[i], 0, objUniform(gpu.atomData, o, [0, 0, 0], i + 1));
        pass.setBindGroup(1, gpu.objBGs[i]);
        pass.setVertexBuffer(0, gpu.sphere.vb);
        pass.setIndexBuffer(gpu.sphere.ib, 'uint32');
        pass.drawIndexed(gpu.sphere.count);
    }
    for (let i = 0; i < m; i++) {
        const o = i * 20;
        device.queue.writeBuffer(gpu.objBufs[n + i], 0, objUniform(gpu.bondData, o, [0, 0, 0], 0));
        pass.setBindGroup(1, gpu.objBGs[n + i]);
        pass.setVertexBuffer(0, gpu.cyl.vb);
        pass.setIndexBuffer(gpu.cyl.ib, 'uint32');
        pass.drawIndexed(gpu.cyl.count);
    }
    pass.end();
    enc.copyTextureToBuffer(
        {texture: gpu.idTex, origin: {x: Math.round(clickX), y: Math.round(clickY)}},
        {buffer: gpu.readBuf, bytesPerRow: 256, rowsPerImage: 1},
        {width: 1, height: 1, depthOrArrayLayers: 1});
    device.queue.submit([enc.finish()]);
    await gpu.readBuf.mapAsync(GPUMapMode.READ);
    const id = new Uint32Array(gpu.readBuf.getMappedRange())[0];
    gpu.readBuf.unmap();
    return {id, ms: +(performance.now() - t0).toFixed(2)};
}

async function pickIdPass(clickX, clickY, scissor) {
    const t0 = performance.now();
    const device = gpu.device;
    const enc = device.createCommandEncoder();
    const rot = rotationY(state.angle);
    writeScene(gpu.sceneAtoms, 1, rot);
    writeScene(gpu.sceneBonds, 0, rot);
    const pass = enc.beginRenderPass({
        colorAttachments: [{view: gpu.idView, loadOp: 'clear', storeOp: 'store', clearValue: {r: 0, g: 0, b: 0, a: 0}}],
        depthStencilAttachment: {view: gpu.idDepthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'},
    });
    if (scissor) pass.setScissorRect(Math.max(0, clickX - 8), Math.max(0, clickY - 8), 16, 16);
    pass.setPipeline(gpu.pipelines.idInst);
    pass.setBindGroup(0, gpu.bgAtoms);
    pass.setVertexBuffer(0, gpu.sphere.vb);
    pass.setVertexBuffer(1, gpu.atomVB);
    pass.setIndexBuffer(gpu.sphere.ib, 'uint32');
    pass.drawIndexed(gpu.sphere.count, gpu.counts.atoms);
    pass.setBindGroup(0, gpu.bgBonds);
    pass.setVertexBuffer(0, gpu.cyl.vb);
    pass.setVertexBuffer(1, gpu.bondVB);
    pass.setIndexBuffer(gpu.cyl.ib, 'uint32');
    pass.drawIndexed(gpu.cyl.count, gpu.counts.bonds);
    pass.end();
    enc.copyTextureToBuffer(
        {texture: gpu.idTex, origin: {x: Math.round(clickX), y: Math.round(clickY)}},
        {buffer: gpu.readBuf, bytesPerRow: 256, rowsPerImage: 1},
        {width: 1, height: 1, depthOrArrayLayers: 1});
    device.queue.submit([enc.finish()]);
    await gpu.readBuf.mapAsync(GPUMapMode.READ);
    const id = new Uint32Array(gpu.readBuf.getMappedRange())[0];
    gpu.readBuf.unmap();
    return {id, ms: +(performance.now() - t0).toFixed(2)};
}

async function pickCompute(clickX, clickY) {
    const t0 = performance.now();
    const device = gpu.device;
    device.queue.writeBuffer(gpu.pick.res, 0, new Uint32Array([0xffffffff, 0xffffffff]));
    writePickU(clickX, clickY);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setBindGroup(0, gpu.pick.bg);
    pass.setPipeline(gpu.pick.minDepth);
    pass.dispatchWorkgroups(Math.ceil(gpu.pick.n / 128));
    pass.setPipeline(gpu.pick.minIndex);
    pass.dispatchWorkgroups(Math.ceil(gpu.pick.n / 128));
    pass.end();
    enc.copyBufferToBuffer(gpu.pick.res, 0, gpu.pick.read, 0, 8);
    device.queue.submit([enc.finish()]);
    await gpu.pick.read.mapAsync(GPUMapMode.READ);
    const res = new Uint32Array(gpu.pick.read.getMappedRange().slice(0));
    gpu.pick.read.unmap();
    return {id: res[1] === 0xffffffff ? 0 : res[1] + 1, ms: +(performance.now() - t0).toFixed(2)};
}

// ---------------- MD ----------------
function makeMdAtoms(n) {
    const a = new Float32Array(n * 12);
    for (let i = 0; i < n; i++) {
        a[i * 12] = (Math.random() - 0.5) * 60;
        a[i * 12 + 1] = (Math.random() - 0.5) * 60;
        a[i * 12 + 2] = (Math.random() - 0.5) * 60;
        a[i * 12 + 3] = 1;
        a[i * 12 + 8] = 3.0;
        a[i * 12 + 9] = 0.2;
        a[i * 12 + 10] = 12;
    }
    return a;
}

async function initMD() {
    const device = gpu.device;
    const module = device.createShaderModule({code: MD_WGSL});
    const bgl = device.createBindGroupLayout({entries: [
        {binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'read-only-storage'}},
        {binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'storage'}},
        {binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: {type: 'uniform'}}]});
    gpu.md = {
        pipeline: device.createComputePipeline({layout: device.createPipelineLayout({bindGroupLayouts: [bgl]}), compute: {module, entryPoint: 'main'}}),
        bgl,
        ubo: device.createBuffer({size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST}),
        sets: new Map(),
    };
}

function mdSet(n) {
    if (gpu.md.sets.has(n)) return gpu.md.sets.get(n);
    const data = makeMdAtoms(n);
    const a = gpuBuf(data, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
    const b = gpu.device.createBuffer({size: data.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST});
    const bg = (src, dst) => gpu.device.createBindGroup({layout: gpu.md.bgl, entries: [
        {binding: 0, resource: {buffer: src}},
        {binding: 1, resource: {buffer: dst}},
        {binding: 2, resource: {buffer: gpu.md.ubo}}]});
    const set = {a, b, ab: bg(a, b), ba: bg(b, a)};
    gpu.md.sets.set(n, set);
    return set;
}

async function mdGpu(n, steps) {
    const set = mdSet(n);
    const ab = new ArrayBuffer(16);
    new Float32Array(ab)[0] = 0.002;
    new Uint32Array(ab)[1] = n;
    gpu.device.queue.writeBuffer(gpu.md.ubo, 0, ab);

    let enc = gpu.device.createCommandEncoder();
    let pass = enc.beginComputePass();
    pass.setBindGroup(0, set.ab);
    pass.setPipeline(gpu.md.pipeline);
    pass.dispatchWorkgroups(Math.ceil(n / 128));
    pass.end();
    gpu.device.queue.submit([enc.finish()]);
    await gpu.device.queue.onSubmittedWorkDone();

    const t0 = performance.now();
    enc = gpu.device.createCommandEncoder();
    let ping = true;
    for (let s = 0; s < steps; s++) {
        pass = enc.beginComputePass();
        pass.setBindGroup(0, ping ? set.ab : set.ba);
        pass.setPipeline(gpu.md.pipeline);
        pass.dispatchWorkgroups(Math.ceil(n / 128));
        pass.end();
        ping = !ping;
    }
    gpu.device.queue.submit([enc.finish()]);
    await gpu.device.queue.onSubmittedWorkDone();
    return +((performance.now() - t0) / steps).toFixed(2);
}

function mdCpu(n, steps) {
    const a = makeMdAtoms(n);
    const b = new Float32Array(a.length);
    const dt = 0.002;
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) {
        for (let i = 0; i < n; i++) {
            const ix = i * 12;
            const px = a[ix], py = a[ix + 1], pz = a[ix + 2];
            const si = a[ix + 8], ei = a[ix + 9], mi = a[ix + 10];
            let fx = 0, fy = 0, fz = 0;
            for (let j = 0; j < n; j++) {
                if (j === i) continue;
                const jx = j * 12;
                const dx = px - a[jx], dy = py - a[jx + 1], dz = pz - a[jx + 2];
                let r2 = dx * dx + dy * dy + dz * dz;
                if (r2 < 0.01) r2 = 0.01;
                const s2 = 0.5 * (si + a[jx + 8]);
                const e = Math.sqrt(ei * a[jx + 9]);
                const inv2 = (s2 * s2) / r2;
                const inv6 = inv2 * inv2 * inv2;
                const fs = (24 * e * (2 * inv6 * inv6 - inv6)) / r2;
                fx += dx * fs; fy += dy * fs; fz += dz * fs;
            }
            const vx = (a[ix + 4] + (fx / mi) * dt) * 0.999;
            const vy = (a[ix + 5] + (fy / mi) * dt) * 0.999;
            const vz = (a[ix + 6] + (fz / mi) * dt) * 0.999;
            b[ix] = px + vx * dt; b[ix + 1] = py + vy * dt; b[ix + 2] = pz + vz * dt;
            b[ix + 3] = 1;
            b[ix + 4] = vx; b[ix + 5] = vy; b[ix + 6] = vz;
            b[ix + 8] = si; b[ix + 9] = ei; b[ix + 10] = mi;
        }
        a.set(b);
    }
    return +((performance.now() - t0) / steps).toFixed(2);
}

// ---------------- WebGL2 ----------------
const gl = {ctx: null, prog: null, vao: null, sphere: null, cyl: null, atomBuf: null, bondBuf: null, loc: {}};

const GLSL_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 m0;
layout(location=3) in vec4 m1;
layout(location=4) in vec4 m2;
layout(location=5) in vec4 m3;
layout(location=6) in vec4 aColor;
uniform mat4 uViewProj;
uniform mat4 uRot;
out vec3 vNrm;
out vec3 vColor;
void main() {
  mat4 model = mat4(m0, m1, m2, m3);
  vec4 wp = uRot * model * vec4(aPos, 1.0);
  vNrm = normalize(mat3(uRot * model) * aNrm);
  vColor = aColor.rgb;
  gl_Position = uViewProj * wp;
}`;
const GLSL_FS = `#version 300 es
precision highp float;
in vec3 vNrm;
in vec3 vColor;
out vec4 outColor;
void main() {
  vec3 l = normalize(vec3(0.45, 1.0, 0.65));
  float d = max(dot(normalize(vNrm), l), 0.0);
  outColor = vec4(vColor * (0.28 + 0.72 * d), 1.0);
}`;

// 逐对象提交：每个对象一次 uniform 更新（model/color）+ 一次 draw
const GLSL_OBJ_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
uniform mat4 uViewProj;
uniform mat4 uRot;
uniform mat4 uModel;
uniform vec4 uColor;
out vec3 vNrm;
out vec3 vColor;
void main() {
  vec4 wp = uRot * uModel * vec4(aPos, 1.0);
  vNrm = normalize(mat3(uRot * uModel) * aNrm);
  vColor = uColor.rgb;
  gl_Position = uViewProj * wp;
}`;

function initGL() {
    const canvas = $('gl');
    canvas.style.display = 'block';
    $('gpu').style.display = 'none';
    const c = canvas.getContext('webgl2', {antialias: false, alpha: false, depth: true});
    if (!c) throw new Error('no webgl2');
    gl.ctx = c;
    const sh = (type, src) => {
        const s = c.createShader(type);
        c.shaderSource(s, src); c.compileShader(s);
        if (!c.getShaderParameter(s, c.COMPILE_STATUS)) throw new Error(c.getShaderInfoLog(s));
        return s;
    };
    const p = c.createProgram();
    c.attachShader(p, sh(c.VERTEX_SHADER, GLSL_VS));
    c.attachShader(p, sh(c.FRAGMENT_SHADER, GLSL_FS));
    c.linkProgram(p);
    if (!c.getProgramParameter(p, c.LINK_STATUS)) throw new Error(c.getProgramInfoLog(p));
    gl.prog = p;
    gl.loc = {viewProj: c.getUniformLocation(p, 'uViewProj'), rot: c.getUniformLocation(p, 'uRot')};

    const sphere = buildSphere(), cyl = buildCylinder();
    gl.sphere = {count: sphere.indices.length};
    gl.cyl = {count: cyl.indices.length};
    const buf = (target, data) => {
        const b = c.createBuffer();
        c.bindBuffer(target, b); c.bufferData(target, data, c.STATIC_DRAW);
        return b;
    };
    gl.sphere.vb = buf(c.ARRAY_BUFFER, sphere.vertices);
    gl.sphere.ib = buf(c.ELEMENT_ARRAY_BUFFER, sphere.indices);
    gl.cyl.vb = buf(c.ARRAY_BUFFER, cyl.vertices);
    gl.cyl.ib = buf(c.ELEMENT_ARRAY_BUFFER, cyl.indices);
    gl.atomBuf = buf(c.ARRAY_BUFFER, state.data.atomInst);
    gl.bondBuf = buf(c.ARRAY_BUFFER, state.data.bondInst);

    gl.vao = c.createVertexArray();
    c.bindVertexArray(gl.vao);
    gl.bindInstances = (buf) => {
        c.bindBuffer(c.ARRAY_BUFFER, buf);
        for (let i = 0; i < 5; i++) {
            c.enableVertexAttribArray(2 + i);
            c.vertexAttribPointer(2 + i, 4, c.FLOAT, false, 80, i * 16);
            c.vertexAttribDivisor(2 + i, 1);
        }
    };
    gl.bindGeometry = (which) => {
        c.bindBuffer(c.ARRAY_BUFFER, which === 'sphere' ? gl.sphere.vb : gl.cyl.vb);
        c.enableVertexAttribArray(0);
        c.vertexAttribPointer(0, 3, c.FLOAT, false, 24, 0);
        c.enableVertexAttribArray(1);
        c.vertexAttribPointer(1, 3, c.FLOAT, false, 24, 12);
    };

    // 逐对象程序与 VAO（与 WebGPU perObject 的 model/color uniform + 单次 draw 对齐）
    const po = c.createProgram();
    c.attachShader(po, sh(c.VERTEX_SHADER, GLSL_OBJ_VS));
    c.attachShader(po, sh(c.FRAGMENT_SHADER, GLSL_FS));
    c.linkProgram(po);
    if (!c.getProgramParameter(po, c.LINK_STATUS)) throw new Error(c.getProgramInfoLog(po));
    gl.objProg = po;
    gl.objLoc = {
        viewProj: c.getUniformLocation(po, 'uViewProj'),
        rot: c.getUniformLocation(po, 'uRot'),
        model: c.getUniformLocation(po, 'uModel'),
        color: c.getUniformLocation(po, 'uColor'),
    };
    const makeObjVAO = (vb, ib) => {
        const vao = c.createVertexArray();
        c.bindVertexArray(vao);
        c.bindBuffer(c.ARRAY_BUFFER, vb);
        c.enableVertexAttribArray(0);
        c.vertexAttribPointer(0, 3, c.FLOAT, false, 24, 0);
        c.enableVertexAttribArray(1);
        c.vertexAttribPointer(1, 3, c.FLOAT, false, 24, 12);
        c.bindBuffer(c.ELEMENT_ARRAY_BUFFER, ib);
        return vao;
    };
    gl.objVAO = {sphere: makeObjVAO(gl.sphere.vb, gl.sphere.ib), cyl: makeObjVAO(gl.cyl.vb, gl.cyl.ib)};
    c.bindVertexArray(null);
}

function glFrameObj(ts) {
    if (!state.running) return;
    state.angle += 0.004;
    const t0 = performance.now();
    const c = gl.ctx;
    c.viewport(0, 0, W, H);
    c.enable(c.DEPTH_TEST);
    c.depthFunc(c.LEQUAL);
    c.clearColor(0.055, 0.067, 0.086, 1);
    c.clear(c.COLOR_BUFFER_BIT | c.DEPTH_BUFFER_BIT);
    c.useProgram(gl.objProg);
    c.uniformMatrix4fv(gl.objLoc.viewProj, false, state.viewProj);
    c.uniformMatrix4fv(gl.objLoc.rot, false, rotationY(state.angle));

    const A = state.data.atomInst, B = state.data.bondInst;
    const n = state.scene.atoms.length, m = state.scene.bonds.length;
    for (let i = 0; i < n; i++) {
        const o = i * 20;
        c.bindVertexArray(gl.objVAO.sphere);
        c.uniformMatrix4fv(gl.objLoc.model, false, A.subarray(o, o + 16));
        c.uniform4f(gl.objLoc.color, A[o + 16], A[o + 17], A[o + 18], 1);
        c.drawElements(c.TRIANGLES, gl.sphere.count, c.UNSIGNED_INT, 0);
    }
    for (let i = 0; i < m; i++) {
        const o = i * 20;
        c.bindVertexArray(gl.objVAO.cyl);
        c.uniformMatrix4fv(gl.objLoc.model, false, B.subarray(o, o + 16));
        c.uniform4f(gl.objLoc.color, B[o + 16], B[o + 17], B[o + 18], 1);
        c.drawElements(c.TRIANGLES, gl.cyl.count, c.UNSIGNED_INT, 0);
    }
    state.cpu.push(performance.now() - t0);
    state.stamps.push(ts);
    state.raf = requestAnimationFrame(glFrameObj);
}

function glFrame(ts) {
    if (!state.running) return;
    state.angle += 0.004;
    const t0 = performance.now();
    const c = gl.ctx;
    c.viewport(0, 0, W, H);
    c.enable(c.DEPTH_TEST);
    c.depthFunc(c.LEQUAL);
    c.clearColor(0.055, 0.067, 0.086, 1);
    c.clear(c.COLOR_BUFFER_BIT | c.DEPTH_BUFFER_BIT);
    c.useProgram(gl.prog);
    c.uniformMatrix4fv(gl.loc.viewProj, false, state.viewProj);
    c.uniformMatrix4fv(gl.loc.rot, false, rotationY(state.angle));
    c.bindVertexArray(gl.vao);
    gl.bindGeometry('sphere');
    gl.bindInstances(gl.atomBuf);
    c.bindBuffer(c.ELEMENT_ARRAY_BUFFER, gl.sphere.ib);
    c.drawElementsInstanced(c.TRIANGLES, gl.sphere.count, c.UNSIGNED_INT, 0, state.scene.atoms.length);
    gl.bindGeometry('cyl');
    gl.bindInstances(gl.bondBuf);
    c.bindBuffer(c.ELEMENT_ARRAY_BUFFER, gl.cyl.ib);
    c.drawElementsInstanced(c.TRIANGLES, gl.cyl.count, c.UNSIGNED_INT, 0, state.scene.bonds.length);
    state.cpu.push(performance.now() - t0);
    state.stamps.push(ts);
    state.raf = requestAnimationFrame(glFrame);
}

// ---------------- 控制 ----------------
function stats(windowMs = 2000) {
    const cut = performance.now() - windowMs;
    const stamps = state.stamps.filter((t) => t >= cut);
    const iv = [];
    for (let i = 1; i < stamps.length; i++) iv.push(stamps[i] - stamps[i - 1]);
    iv.sort((a, b) => a - b);
    const span = stamps.length > 1 ? stamps[stamps.length - 1] - stamps[0] : 1;
    const cpu = state.cpu.slice(-Math.max(1, stamps.length));
    return {
        frames: stamps.length,
        fps: stamps.length > 1 ? +(((stamps.length - 1) / span) * 1000).toFixed(1) : 0,
        p50: iv.length ? +iv[Math.floor(iv.length * 0.5)].toFixed(2) : 0,
        p95: iv.length ? +iv[Math.floor(iv.length * 0.95)].toFixed(2) : 0,
        cpuMs: +(cpu.reduce((s, v) => s + v, 0) / cpu.length).toFixed(3),
    };
}

function transformPoint(m, v) {
    return [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15],
    ];
}
function projectToScreen(atom) {
    const rot = rotationY(state.angle);
    const world = transformPoint(rot, [atom[0], atom[1], atom[2], 1]);
    const clip = transformPoint(state.viewProj, world);
    if (clip[3] <= 0) return null;
    const ndcX = clip[0] / clip[3], ndcY = clip[1] / clip[3];
    return [(ndcX * 0.5 + 0.5) * W, (0.5 - ndcY * 0.5) * H];
}

// ---------------- E：draw-call 压力扫描 ----------------
// 用一张极小的四边形、同一 pipeline、同一实例，连续 N 次 draw，GPU 负载压到近零，
// 把成本隔离到"JS → 驱动提交"这一层；固定帧数提交，不经过 rAF/vsync。

function buildQuad() {
    const pos = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
    const nrm = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    return {...interleave(pos, nrm), indices: new Uint32Array([0, 1, 2, 0, 2, 3])};
}

function ensureQuadGPU() {
    if (gpu.quad) return;
    const q = buildQuad();
    gpu.quad = {
        vb: gpuBuf(q.vertices, GPUBufferUsage.VERTEX),
        ib: gpuBuf(q.indices, GPUBufferUsage.INDEX),
        count: q.indices.length,
    };
    const inst = new Float32Array(20);
    inst[0] = 6; inst[5] = 6; inst[10] = 6; inst[15] = 1; inst[19] = 1;
    gpu.quadInst = gpuBuf(inst, GPUBufferUsage.VERTEX);
}

async function sweepGPU(draws, frames) {
    ensureQuadGPU();
    const dev = gpu.device;
    const qs = gpu.hasTimestamp ? dev.createQuerySet({type: 'timestamp', count: frames * 2}) : null;
    const resolveBuf = qs ? dev.createBuffer({size: frames * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC}) : null;
    const readBuf = qs ? dev.createBuffer({size: frames * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ}) : null;

    writeScene(gpu.sceneAtoms, 1, rotationY(state.angle));
    const cpu = [];
    const start = performance.now();
    for (let f = 0; f < frames; f++) {
        const t0 = performance.now();
        const enc = dev.createCommandEncoder();
        if (qs) enc.writeTimestamp(qs, f * 2);
        const pass = enc.beginRenderPass({
            colorAttachments: [{view: gpu.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store',
                clearValue: {r: 0.055, g: 0.067, b: 0.086, a: 1}}],
            depthStencilAttachment: {view: gpu.depthView, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store'},
        });
        pass.setPipeline(gpu.pipelines.inst);
        pass.setBindGroup(0, gpu.bgAtoms);
        pass.setVertexBuffer(0, gpu.quad.vb);
        pass.setVertexBuffer(1, gpu.quadInst);
        pass.setIndexBuffer(gpu.quad.ib, 'uint32');
        for (let i = 0; i < draws; i++) pass.drawIndexed(gpu.quad.count, 1);
        pass.end();
        if (qs) enc.writeTimestamp(qs, f * 2 + 1);
        dev.queue.submit([enc.finish()]);
        cpu.push(performance.now() - t0);
    }

    let gpuMs = null;
    if (qs) {
        const enc = dev.createCommandEncoder();
        enc.resolveQuerySet(qs, 0, frames * 2, resolveBuf, 0);
        enc.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, frames * 16);
        dev.queue.submit([enc.finish()]);
    }
    await dev.queue.onSubmittedWorkDone();
    const total = performance.now() - start;

    if (qs) {
        await readBuf.mapAsync(GPUMapMode.READ);
        const ts = new BigUint64Array(readBuf.getMappedRange());
        let ns = 0n;
        for (let f = 0; f < frames; f++) ns += ts[f * 2 + 1] - ts[f * 2];
        const period = dev.queue.timestampPeriod ?? 1;
        gpuMs = +((Number(ns) * period) / 1e6 / frames).toFixed(3);
        readBuf.unmap();
    }

    const cpuAvg = cpu.reduce((s, v) => s + v, 0) / cpu.length;
    return {
        draws, frames,
        cpuMs: +cpuAvg.toFixed(3),
        gpuMs,
        totalMs: +total.toFixed(1),
        perFrameMs: +(total / frames).toFixed(3),
        timestamp: gpu.hasTimestamp,
    };
}

function ensureQuadGL() {
    if (gl.quad) return;
    const c = gl.ctx;
    const q = buildQuad();
    const buf = (target, data) => {
        const b = c.createBuffer();
        c.bindBuffer(target, b); c.bufferData(target, data, c.STATIC_DRAW);
        return b;
    };
    gl.quad = {
        vb: buf(c.ARRAY_BUFFER, q.vertices),
        ib: buf(c.ELEMENT_ARRAY_BUFFER, q.indices),
        count: q.indices.length,
        inst: buf(c.ARRAY_BUFFER, (() => {
            const a = new Float32Array(20);
            a[0] = 6; a[5] = 6; a[10] = 6; a[15] = 1; a[19] = 1;
            return a;
        })()),
    };
}

async function sweepGL(draws, frames) {
    ensureQuadGL();
    const c = gl.ctx;
    const ext = c.getExtension('EXT_disjoint_timer_query_webgl2');
    let query = null;
    if (ext) {
        query = c.createQuery();
        c.beginQuery(ext.TIME_ELAPSED_EXT, query);
    }
    const cpu = [];
    const start = performance.now();
    for (let f = 0; f < frames; f++) {
        const t0 = performance.now();
        c.viewport(0, 0, W, H);
        c.clearColor(0.055, 0.067, 0.086, 1);
        c.clear(c.COLOR_BUFFER_BIT | c.DEPTH_BUFFER_BIT);
        c.useProgram(gl.prog);
        c.bindVertexArray(gl.vao);
        c.uniformMatrix4fv(gl.loc.viewProj, false, state.viewProj);
        c.uniformMatrix4fv(gl.loc.rot, false, rotationY(state.angle));
        // quad 几何 + 单实例
        c.bindBuffer(c.ARRAY_BUFFER, gl.quad.vb);
        c.enableVertexAttribArray(0);
        c.vertexAttribPointer(0, 3, c.FLOAT, false, 24, 0);
        c.enableVertexAttribArray(1);
        c.vertexAttribPointer(1, 3, c.FLOAT, false, 24, 12);
        c.bindBuffer(c.ARRAY_BUFFER, gl.quad.inst);
        for (let i = 0; i < 5; i++) {
            c.enableVertexAttribArray(2 + i);
            c.vertexAttribPointer(2 + i, 4, c.FLOAT, false, 80, i * 16);
            c.vertexAttribDivisor(2 + i, 1);
        }
        c.bindBuffer(c.ELEMENT_ARRAY_BUFFER, gl.quad.ib);
        for (let i = 0; i < draws; i++) c.drawElementsInstanced(c.TRIANGLES, gl.quad.count, c.UNSIGNED_INT, 0, 1);
        c.flush();
        cpu.push(performance.now() - t0);
    }
    let gpuMs = null;
    if (ext) {
        c.endQuery(ext.TIME_ELAPSED_EXT);
        gpuMs = await new Promise((resolve) => {
            const check = () => {
                const available = c.getQueryParameter(query, c.QUERY_RESULT_AVAILABLE);
                const disjoint = c.getParameter(ext.GPU_DISJOINT_EXT);
                if (disjoint) return resolve(null);
                if (!available) return setTimeout(check, 4);
                resolve(+(c.getQueryParameter(query, c.QUERY_RESULT) / 1e6 / frames).toFixed(3));
            };
            check();
        });
    }
    const total = performance.now() - start;
    const cpuAvg = cpu.reduce((s, v) => s + v, 0) / cpu.length;
    return {
        draws, frames,
        cpuMs: +cpuAvg.toFixed(3),
        gpuMs,
        totalMs: +total.toFixed(1),
        perFrameMs: +(total / frames).toFixed(3),
        timerQuery: !!ext,
    };
}

// ---------------- G：重光栅化（overdraw） ----------------
// 全屏四边形叠画 N 次，关闭深度测试；GPU 填充/带宽压力线性上升，用于比较两 API 的光栅化吞吐。
const WGSL_FULL = `
@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return vec4f(p.xy, 0.0, 1.0);
}
@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.35, 0.55, 0.85, 1.0);
}
`;

function ensureOverdrawGPU() {
    if (gpu.fullPipe) return;
    const q = buildQuad();
    gpu.fullVB = gpuBuf(q.vertices, GPUBufferUsage.VERTEX);
    gpu.fullIB = gpuBuf(q.indices, GPUBufferUsage.INDEX);
    gpu.fullCount = q.indices.length;
    gpu.fullPipe = gpu.device.createRenderPipeline({
        layout: 'auto',
        vertex: {module: gpu.device.createShaderModule({code: WGSL_FULL}), entryPoint: 'vs',
            buffers: [{arrayStride: 24, attributes: [{shaderLocation: 0, offset: 0, format: 'float32x3'}]}]},
        fragment: {module: gpu.device.createShaderModule({code: WGSL_FULL}), entryPoint: 'fs',
            targets: [{format: gpu.format}]},
        primitive: {topology: 'triangle-list'},
    });
}

async function overdrawGPU(overdraw, frames) {
    ensureOverdrawGPU();
    const dev = gpu.device;
    const qs = gpu.hasTimestamp ? dev.createQuerySet({type: 'timestamp', count: frames * 2}) : null;
    const resolveBuf = qs ? dev.createBuffer({size: frames * 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC}) : null;
    const readBuf = qs ? dev.createBuffer({size: frames * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ}) : null;

    for (let f = 0; f < frames; f++) {
        const enc = dev.createCommandEncoder();
        if (qs) enc.writeTimestamp(qs, f * 2);
        const pass = enc.beginRenderPass({
            colorAttachments: [{view: gpu.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store',
                clearValue: {r: 0.055, g: 0.067, b: 0.086, a: 1}}],
        });
        pass.setPipeline(gpu.fullPipe);
        pass.setVertexBuffer(0, gpu.fullVB);
        pass.setIndexBuffer(gpu.fullIB, 'uint32');
        for (let i = 0; i < overdraw; i++) pass.drawIndexed(gpu.fullCount);
        pass.end();
        if (qs) enc.writeTimestamp(qs, f * 2 + 1);
        dev.queue.submit([enc.finish()]);
    }
    let gpuMs = null;
    if (qs) {
        const enc = dev.createCommandEncoder();
        enc.resolveQuerySet(qs, 0, frames * 2, resolveBuf, 0);
        enc.copyBufferToBuffer(resolveBuf, 0, readBuf, 0, frames * 16);
        dev.queue.submit([enc.finish()]);
    }
    await dev.queue.onSubmittedWorkDone();
    if (qs) {
        await readBuf.mapAsync(GPUMapMode.READ);
        const ts = new BigUint64Array(readBuf.getMappedRange());
        let ns = 0n;
        for (let f = 0; f < frames; f++) ns += ts[f * 2 + 1] - ts[f * 2];
        const period = dev.queue.timestampPeriod ?? 1;
        gpuMs = +((Number(ns) * period) / 1e6 / frames).toFixed(3);
        readBuf.unmap();
    }
    return {overdraw, frames, gpuMs};
}

function ensureOverdrawGL() {
    if (gl.fullProg) return;
    const c = gl.ctx;
    const sh = (type, src) => {
        const s = c.createShader(type);
        c.shaderSource(s, src); c.compileShader(s);
        if (!c.getShaderParameter(s, c.COMPILE_STATUS)) throw new Error(c.getShaderInfoLog(s));
        return s;
    };
    const p = c.createProgram();
    c.attachShader(p, sh(c.VERTEX_SHADER, `#version 300 es
layout(location=0) in vec3 aPos;
void main() { gl_Position = vec4(aPos.xy, 0.0, 1.0); }`));
    c.attachShader(p, sh(c.FRAGMENT_SHADER, `#version 300 es
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.35, 0.55, 0.85, 1.0); }`));
    c.linkProgram(p);
    gl.fullProg = p;
    const q = buildQuad();
    const buf = (target, data) => {
        const b = c.createBuffer();
        c.bindBuffer(target, b); c.bufferData(target, data, c.STATIC_DRAW);
        return b;
    };
    gl.fullVB = buf(c.ARRAY_BUFFER, q.vertices);
    gl.fullIB = buf(c.ELEMENT_ARRAY_BUFFER, q.indices);
    gl.fullCount = q.indices.length;
    gl.fullVAO = c.createVertexArray();
    c.bindVertexArray(gl.fullVAO);
    c.bindBuffer(c.ARRAY_BUFFER, gl.fullVB);
    c.enableVertexAttribArray(0);
    c.vertexAttribPointer(0, 3, c.FLOAT, false, 24, 0);
    c.bindBuffer(c.ELEMENT_ARRAY_BUFFER, gl.fullIB);
}

async function overdrawGL(overdraw, frames) {
    ensureOverdrawGL();
    const c = gl.ctx;
    const ext = c.getExtension('EXT_disjoint_timer_query_webgl2');
    let query = null;
    if (ext) {
        query = c.createQuery();
        c.beginQuery(ext.TIME_ELAPSED_EXT, query);
    }
    for (let f = 0; f < frames; f++) {
        c.viewport(0, 0, W, H);
        c.disable(c.DEPTH_TEST);
        c.clearColor(0.055, 0.067, 0.086, 1);
        c.clear(c.COLOR_BUFFER_BIT);
        c.useProgram(gl.fullProg);
        c.bindVertexArray(gl.fullVAO);
        for (let i = 0; i < overdraw; i++) c.drawElements(c.TRIANGLES, gl.fullCount, c.UNSIGNED_INT, 0);
        c.flush();
    }
    c.enable(c.DEPTH_TEST);
    let gpuMs = null;
    if (ext) {
        c.endQuery(ext.TIME_ELAPSED_EXT);
        gpuMs = await new Promise((resolve) => {
            const check = () => {
                const available = c.getQueryParameter(query, c.QUERY_RESULT_AVAILABLE);
                const disjoint = c.getParameter(ext.GPU_DISJOINT_EXT);
                if (disjoint) return resolve(null);
                if (!available) return setTimeout(check, 4);
                resolve(+(c.getQueryParameter(query, c.QUERY_RESULT) / 1e6 / frames).toFixed(3));
            };
            check();
        });
    }
    return {overdraw, frames, gpuMs};
}

window.BENCH = {
    async init(api, mode = 'instanced') {
        state.api = api; state.mode = mode;
        const {atoms, bonds} = await loadScene();
        if (api === 'webgpu') await initGPU();
        else initGL();
        return {api, mode, atoms, bonds};
    },
    start() {
        state.running = true; state.stamps = []; state.cpu = [];
        cancelAnimationFrame(state.raf);
        const loop = state.api !== 'webgl2' ? gpuFrame
            : state.mode === 'perObject' ? glFrameObj : glFrame;
        state.raf = requestAnimationFrame(loop);
    },
    stop() { state.running = false; cancelAnimationFrame(state.raf); },
    stats,
    async pick(kind, n = 12) {
        const pts = [];
        const step = Math.max(1, Math.floor(state.scene.atoms.length / (n * 2)));
        for (let i = 0; i < state.scene.atoms.length && pts.length < n; i += step) {
            const p = projectToScreen(state.scene.atoms[i]);
            if (!p) continue;
            if (p[0] < 20 || p[0] > W - 20 || p[1] < 20 || p[1] > H - 20) continue;
            pts.push(p);
        }
        const ms = [];
        let hits = 0;
        const useObj = state.mode === 'perObject';
        for (const [x, y] of pts) {
            const r = kind === 'full'
                ? await (useObj ? pickIdPassObj(x, y, false) : pickIdPass(x, y, false))
                : kind === 'scissor'
                    ? await (useObj ? pickIdPassObj(x, y, true) : pickIdPass(x, y, true))
                    : await pickCompute(x, y);
            ms.push(r.ms);
            if (r.id > 0) hits++;
        }
        ms.sort((a, b) => a - b);
        return {
            kind, n: pts.length, hits,
            avgMs: +(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(2),
            medMs: +ms[Math.floor(ms.length * 0.5)].toFixed(2),
            p95Ms: +ms[Math.floor((ms.length - 1) * 0.95)].toFixed(2),
            samples: ms,
        };
    },
    async md(n, steps) {
        const gpuMs = await mdGpu(n, steps);
        const cpuMs = mdCpu(n, 3);
        return {n, steps, gpuMs, cpuMs, speedup: +(cpuMs / gpuMs).toFixed(1)};
    },
    async sweep(draws, frames) {
        return state.api === 'webgl2' ? sweepGL(draws, frames) : sweepGPU(draws, frames);
    },
    async overdraw(n, frames) {
        return state.api === 'webgl2' ? overdrawGL(n, frames) : overdrawGPU(n, frames);
    },
    info() {
        return {api: state.api, mode: state.mode, atoms: state.scene?.atoms.length, bonds: state.scene?.bonds.length, adapter: gpu.adapterInfo, canvas: {w: W, h: H}};
    },
};







