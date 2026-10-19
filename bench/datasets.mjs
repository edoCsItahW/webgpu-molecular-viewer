// 数据集概况：文件大小、原子/键（PDB 走 CONECT+几何感知；SDF 由 RDKit 解析，尺寸只列文件）
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {readPdbFile} from './pdb.mjs';

const PDB_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/PDB/assets';
const SDF_DIR = 'E:/code/webgpu-molecular-viewer/code/backend/parsers/SDF/assets';

console.log('--- PDB ---');
for (const f of readdirSync(PDB_DIR)) {
    if (!f.endsWith('.pdb')) continue;
    const p = join(PDB_DIR, f);
    const {atoms, explicit} = readPdbFile(p);
    const size = statSync(p).size;
    console.log(`${f}\t${(size / 1024).toFixed(1)} KB\tatoms=${atoms.length}\tconect=${explicit.length}`);
}

console.log('--- SDF ---');
for (const f of readdirSync(SDF_DIR)) {
    if (!f.endsWith('.sdf')) continue;
    const p = join(SDF_DIR, f);
    const text = readFileSync(p, 'utf8');
    const countsLine = text.split(/\r?\n/)[3] ?? '';
    console.log(`${f}\t${(statSync(p).size / 1024).toFixed(1)} KB\tcounts="${countsLine}"`);
}
