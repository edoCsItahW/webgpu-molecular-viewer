// 极简 PDB 读取器：只服务于基准测试的"绕过 Pyodide"注入路径。
// 与 src/composables/usePyodide.ts 的语义对齐：ATOM/HETATM、首个 MODEL、元素列、CONECT 原始序列号。
import {readFileSync} from 'node:fs';

export function parsePdb(text) {
    const atoms = [];
    const conect = [];
    const serialToIndex = new Map();
    let inModel = false;

    for (const line of text.split(/\r?\n/)) {
        const rec = line.slice(0, 6);

        if (rec === 'MODEL ') {
            if (inModel) continue;
            inModel = true;
            continue;
        }
        if (rec === 'ENDMDL') {
            if (inModel) break;
            continue;
        }

        if (rec === 'ATOM  ' || rec === 'HETATM') {
            if (/^MODEL/.test(text) && !inModel) continue;
            const x = Number(line.slice(30, 38));
            const y = Number(line.slice(38, 46));
            const z = Number(line.slice(46, 54));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

            const name = line.slice(12, 16).trim();
            let element = line.slice(76, 78).trim();
            if (!element) {
                // 退化为原子名首字母（与 Biopython 的 atom.element or name[:1] 一致）
                element = (name.match(/[A-Za-z]/)?.[0] ?? 'X').toUpperCase();
            }
            const symbol = element.length === 1
                ? element.toUpperCase()
                : element[0].toUpperCase() + element.slice(1).toLowerCase();

            const serial = Number.parseInt(line.slice(6, 11), 10);
            const atom = {
                serial,
                symbol,
                position: [x, y, z],
                residue: line.slice(17, 20).trim() || undefined,
                chain: line.slice(21, 22).trim() || undefined,
                bfactor: Number(line.slice(60, 66)) || 0,
                occupancy: Number(line.slice(54, 60)) || 1,
            };
            serialToIndex.set(serial, atoms.length);
            atoms.push(atom);
            continue;
        }

        if (rec === 'CONECT') {
            const nums = line.slice(6).split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite);
            for (let i = 1; i < nums.length; i++) conect.push([nums[0], nums[i]]);
        }
    }

    return {atoms, conect};
}

export function explicitBondsFromConect(atoms, conect) {
    const map = new Map(atoms.map((a, i) => [a.serial, i]));
    const out = [];
    for (const [a, b] of conect) {
        const i = map.get(a);
        const j = map.get(b);
        if (i === undefined || j === undefined || i === j) continue;
        out.push([i, j]);
    }
    return out;
}

export function readPdbFile(path) {
    const parsed = parsePdb(readFileSync(path, 'utf8'));
    return {...parsed, explicit: explicitBondsFromConect(parsed.atoms, parsed.conect)};
}
