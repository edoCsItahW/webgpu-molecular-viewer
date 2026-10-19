// 生成微基准场景：4HHB 原子（坐标/半径/CPK 颜色）+ 共价键（与应用相同的感知规则）
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {parsePdb} from '../pdb.mjs';

const PDB = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets/血红蛋白-4HHB.pdb';
const OUT_DIR = 'E:/code/webgpu-molecular-viewer/bench/micro';
mkdirSync(OUT_DIR, {recursive: true});

const COLORS = {
    C: [0.255, 0.282, 0.333],
    O: [0.878, 0.290, 0.227],
    N: [0.231, 0.435, 0.878],
    S: [0.878, 0.690, 0.251],
    H: [0.847, 0.863, 0.878],
    P: [0.957, 0.522, 0.227],
    F: [0.255, 0.776, 0.529],
    Cl: [0.180, 0.620, 0.278],
};
const RADII = {C: 0.76, O: 0.66, N: 0.71, S: 1.05, H: 0.31, P: 1.07, F: 0.57, Cl: 1.02};
const COV = {
    H: 0.31, C: 0.76, N: 0.71, O: 0.66, F: 0.57, P: 1.07, S: 1.05, Cl: 1.02,
    Fe: 1.32, Zn: 1.22, Mg: 1.41, Ca: 1.76, Na: 1.66, K: 2.03,
};
const MAXV = {H: 1, C: 4, N: 4, O: 2, S: 6, P: 5, F: 1, Cl: 1, Fe: 6, Zn: 4, Mg: 2, Ca: 2, Na: 0, K: 0};

const cov = (s) => COV[s] ?? 0.77;
const maxv = (s) => MAXV[s] ?? 4;

const {atoms: raw} = parsePdb(readFileSync(PDB, 'utf8'));
const atoms = raw.map((a) => {
    const sym = a.symbol;
    return {
        x: a.position[0], y: a.position[1], z: a.position[2],
        r: RADII[sym] ?? 1.0,
        color: COLORS[sym] ?? [0.5, 0.5, 0.5],
        sym,
    };
});

// 共价半径 + 网格 + 价数上限（与应用中的 perceiveBonds 同一判据）
const N = atoms.length;
const cell = 2.6;
const grid = new Map();
const key = (x, y, z) => `${x},${y},${z}`;
const cellOf = (v) => Math.floor(v / cell);
for (let i = 0; i < N; i++) {
    const k = key(cellOf(atoms[i].x), cellOf(atoms[i].y), cellOf(atoms[i].z));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
}
const candidates = [];
for (let i = 0; i < N; i++) {
    const a = atoms[i];
    const cx = cellOf(a.x), cy = cellOf(a.y), cz = cellOf(a.z);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        const bucket = grid.get(key(cx + dx, cy + dy, cz + dz));
        if (!bucket) continue;
        for (const j of bucket) {
            if (j <= i) continue;
            const b = atoms[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
            const cutoff = Math.min(2.6, (cov(a.sym) + cov(b.sym)) * 1.25);
            if (d <= cutoff && d > 1e-3) candidates.push([i, j, d]);
        }
    }
}
candidates.sort((p, q) => p[2] - q[2]);
const valence = new Uint8Array(N);
const bonds = [];
for (const [i, j] of candidates) {
    if (valence[i] >= maxv(atoms[i].sym) || valence[j] >= maxv(atoms[j].sym)) continue;
    valence[i]++; valence[j]++;
    bonds.push([i, j]);
}

let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (const a of atoms) {
    minX = Math.min(minX, a.x); maxX = Math.max(maxX, a.x);
    minY = Math.min(minY, a.y); maxY = Math.max(maxY, a.y);
    minZ = Math.min(minZ, a.z); maxZ = Math.max(maxZ, a.z);
}
const center = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
let radius = 0;
for (const a of atoms) radius = Math.max(radius, Math.hypot(a.x - center[0], a.y - center[1], a.z - center[2]) + a.r);

const scene = {
    name: '4HHB',
    center,
    radius,
    atoms: atoms.map((a) => [+a.x.toFixed(3), +a.y.toFixed(3), +a.z.toFixed(3), +a.r.toFixed(3), ...a.color.map((c) => +c.toFixed(3))]),
    bonds,
};
writeFileSync(join(OUT_DIR, 'scene.json'), JSON.stringify(scene));
console.log('atoms', N, 'bonds', bonds.length, 'radius', radius.toFixed(1), 'bytes', JSON.stringify(scene).length);
