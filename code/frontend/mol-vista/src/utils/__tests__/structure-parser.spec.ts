// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file structure-parser.spec.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc `@wmv/parser` 的白盒单测：覆盖 PDB 的 altLoc / MODEL / CONECT 序列号映射，
 *       mmCIF 的 loop / 缺失值 / model 过滤，以及键感知的价数上限。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { describe, expect, it } from 'vitest';
import { parseCif, parsePdb, parseSdf, parseStructureData } from '@wmv/parser';
import { StructureView } from '@wmv/structure';

/** 按 PDB 固定列拼一行 ATOM/HETATM（只填测试关心的列） */
function atomLine(options: {
    serial: number;
    name: string;
    altLoc?: string;
    resName?: string;
    chain?: string;
    seq?: number;
    record?: 'ATOM' | 'HETATM';
    x: number;
    y: number;
    z: number;
    element?: string;
}): string {
    const record = (options.record ?? 'ATOM').padEnd(6);
    const serial = String(options.serial).padStart(5);
    const name = options.name.padEnd(4).slice(0, 4);
    const alt = options.altLoc ?? ' ';
    const res = (options.resName ?? 'ALA').padStart(3).slice(0, 3);
    const chain = options.chain ?? 'A';
    const seq = String(options.seq ?? 1).padStart(4);
    const x = options.x.toFixed(3).padStart(8);
    const y = options.y.toFixed(3).padStart(8);
    const z = options.z.toFixed(3).padStart(8);
    const element = (options.element ?? 'C').padStart(2);

    return `${record}${serial} ${name}${alt}${res} ${chain}${seq}    ${x}${y}${z}  1.00 20.00          ${element}`;
}

describe('parsePdb', () => {
    it('只保留第一个 MODEL', () => {
        const text = [
            'MODEL        1',
            atomLine({serial: 1, name: 'CA', x: 0, y: 0, z: 0}),
            'ENDMDL',
            'MODEL        2',
            atomLine({serial: 2, name: 'CA', x: 5, y: 0, z: 0}),
            'ENDMDL',
        ].join('\n');

        const parsed = parsePdb(text, 'model.pdb');

        expect(parsed.count).toBe(1);
        expect(parsed.positions[0]).toBeCloseTo(0, 3);
    });

    it('altLoc 只保留空 / A，重复构象不重复计数', () => {
        const text = [
            atomLine({serial: 1, name: 'CA', altLoc: ' ', x: 0, y: 0, z: 0}),
            atomLine({serial: 2, name: 'CA', altLoc: 'A', x: 1, y: 0, z: 0}),
            atomLine({serial: 3, name: 'CA', altLoc: 'B', x: 2, y: 0, z: 0}),
        ].join('\n');

        const parsed = parsePdb(text, 'alt.pdb');

        expect(parsed.count).toBe(2);
    });

    it('CONECT 的序列号按下标映射，序列号有空洞也不错位', () => {
        const text = [
            atomLine({serial: 5, name: 'C1', x: 0, y: 0, z: 0}),
            atomLine({serial: 7, name: 'O1', x: 1.2, y: 0, z: 0, element: 'O'}),
            'CONECT    5    7',
        ].join('\n');

        const parsed = parsePdb(text, 'conect.pdb', {perceiveBonds: false});

        expect(parsed.count).toBe(2);
        expect(parsed.bondCount).toBe(1);
        expect([parsed.bonds[0], parsed.bonds[1]]).toEqual([0, 1]);
    });

    it('元素列为空时从原子名推断', () => {
        const text = atomLine({serial: 1, name: ' CA', x: 0, y: 0, z: 0, element: ''});

        const parsed = parsePdb(text, 'element.pdb', {perceiveBonds: false});

        expect(parsed.elements[parsed.elementIndex[0]!]).toBe('C');
    });
});

describe('parseCif', () => {
    it('解析 _atom_site loop，跳过非首个 model，缺失值走默认', () => {
        const text = `
data_test
#
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.pdbx_PDB_model_num
ATOM 1 C C1 LIG A 0.000 0.000 0.000 1.00 10.00 1
ATOM 2 O O1 LIG A 1.200 0.000 0.000 1.00 12.00 1
ATOM 3 C C2 LIG A 5.000 0.000 0.000 0.50 99.00 2
#
`;

        const parsed = parseCif(text, 'test.cif', {perceiveBonds: false});

        expect(parsed.count).toBe(2);
        expect(parsed.elements[parsed.elementIndex[0]!]).toBe('C');
        expect(parsed.elements[parsed.elementIndex[1]!]).toBe('O');
        expect(parsed.bfactor[1]).toBeCloseTo(12, 3);
    });
});

describe('parseSdf', () => {
    /** 构造一行 V2000 原子（固定列：0-9/10-19/20-29 坐标，31-33 元素，36-38 电荷码） */
    function sdfAtom(x: number, y: number, z: number, symbol: string, chargeCode = 0): string {
        return `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}${z.toFixed(4).padStart(10)} `
            + `${symbol.padEnd(3)} 0${String(chargeCode).padStart(3)}  0  0  0  0  0  0  0  0  0`;
    }

    const acetate = [
        'acetate',
        '  test',
        '',
        '  4  3  0  0  0  0            999 V2000',
        sdfAtom(0, 0, 0, 'C'),
        sdfAtom(1.2, 0, 0, 'O'),
        sdfAtom(-1.2, 0, 0, 'O'),
        sdfAtom(0, 1, 0, 'H'),
        '  1  2  2  0  0  0  0',
        '  1  3  1  0  0  0  0',
        '  1  4  1  0  0  0  0',
        'M  CHG  1   3  -1',
        'M  END',
        '$$$$',
    ].join('\n');

    it('解析原子/键/键级，并应用 M  CHG 电荷', () => {
        const parsed = parseSdf(acetate, 'acetate.sdf');

        expect(parsed.count).toBe(4);
        expect(parsed.bondCount).toBe(3);
        expect(parsed.bondOrders?.[0]).toBe(2);
        expect(parsed.charges?.[2]).toBe(-1);
        expect(parsed.charges?.[0]).toBe(0);
    });

    it('V3000 明确报错而不是给出错误结构', () => {
        const text = ['x', 'y', '', '  0  0  0  0  0  0            999 V3000', 'M  END'].join('\n');

        expect(() => parseSdf(text, 'v3.mol')).toThrow(/V3000/);
    });
});

describe('MDR (StructureData)', () => {
    it('残基按 chain+seq+icode 区分，CSR 覆盖全部原子', () => {
        const text = [
            atomLine({serial: 1, name: 'CA', x: 0, y: 0, z: 0, seq: 1}),
            atomLine({serial: 2, name: 'CA', x: 3.8, y: 0, z: 0, seq: 2}),
        ].join('\n');

        const data = parseStructureData(text, 'two-residues.pdb');
        const residues = data.residues!;

        expect(residues.name.length).toBe(2);
        expect([...residues.count]).toEqual([1, 1]);
        expect([...residues.seqNumber]).toEqual([1, 2]);
        expect(residues.count.reduce((a, b) => a + b, 0)).toBe(data.meta.atomCount);
    });

    it('元素写成原子序数，Water/Hetero/Hydrogen 位标记正确', () => {
        const text = [
            atomLine({serial: 1, name: ' O  ', resName: 'HOH', record: 'HETATM', x: 0, y: 0, z: 0, element: 'O'}),
            atomLine({serial: 2, name: ' H1 ', resName: 'HOH', record: 'HETATM', x: 1, y: 0, z: 0, element: 'H'}),
            atomLine({serial: 3, name: ' CA ', resName: 'ALA', x: 3, y: 0, z: 0, element: 'C'}),
        ].join('\n');

        const data = parseStructureData(text, 'water.pdb');

        expect(data.atoms.element[0]).toBe(8);
        expect(data.atoms.element[1]).toBe(1);
        expect(data.atoms.flags![0]! & (1 << 1)).toBeTruthy();
        expect(data.atoms.flags![1]! & (1 << 2)).toBeTruthy();
        expect(data.atoms.flags![2]! & (1 << 4)).toBeTruthy();
        expect(data.atoms.flags![0]! & (1 << 0)).toBeTruthy();
    });

    it('SDF 的键级与 M  CHG 电荷进入 MDR', () => {
        const text = [
            'acetate', 'test', '',
            '  2  1  0  0  0  0            999 V2000',
            '    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0',
            '    1.2000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0',
            '  1  2  2  0  0  0  0',
            'M  CHG  1   2  -1',
            'M  END',
            '$$$$',
        ].join('\n');

        const data = parseStructureData(text, 'acetate.sdf');

        expect(data.bonds?.order[0]).toBe(2);
        expect(data.atoms.charge?.[1]).toBe(-1);
        expect(data.bonds?.inferred).toBe(false);
    });

    it('StructureView 的邻接与残基原子按 CSR 取用', () => {
        const lines = [atomLine({serial: 1, name: 'C', x: 0, y: 0, z: 0, element: 'C'})];
        const h = 1.09;

        const dirs: Array<[number, number, number]> = [[h, 0, 0], [-h, 0, 0], [0, h, 0], [0, 0, h]];

        dirs.forEach(([x, y, z], i) => {
            lines.push(atomLine({serial: i + 2, name: `H${i + 1}`, x, y, z, element: 'H'}));
        });

        const view = new StructureView(parseStructureData(lines.join('\n'), 'methane.pdb'));

        expect(view.bondsOfAtom(0).length).toBe(4);
        expect(view.bondsOfAtom(1).length).toBe(1);
        expect(view.residueAtoms(0).length).toBe(5);
        expect(view.atom(0).symbol).toBe('C');
        expect(view.atom(1).symbol).toBe('H');
    });
});

describe('bond perception', () => {
    it('甲烷按共价半径连出 4 条键，且不超过碳价数', () => {
        const lines = [atomLine({serial: 1, name: 'C', x: 0, y: 0, z: 0, element: 'C'})];

        const h = 1.09;
        const dirs: Array<[number, number, number]> = [
            [h, 0, 0], [-h, 0, 0], [0, h, 0], [0, 0, h],
        ];

        dirs.forEach(([x, y, z], i) => {
            lines.push(atomLine({serial: i + 2, name: `H${i + 1}`, x, y, z, element: 'H'}));
        });

        const parsed = parsePdb(lines.join('\n'), 'methane.pdb');

        expect(parsed.count).toBe(5);
        expect(parsed.bondCount).toBe(4);
    });
});
