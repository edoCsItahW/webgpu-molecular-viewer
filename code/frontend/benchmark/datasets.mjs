// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file datasets.mjs
 * @author edocsitahw
 * @version 1.0
 * @date 2026/11/02
 * @desc 基准数据集清单。路径相对 code/backend/assets，不绑定本机绝对路径。
 * */
import {readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {ASSETS_ROOT} from './env.mjs';

/**
 * @typedef {object} Dataset
 * @property {string} id
 * @property {string} label
 * @property {'pdb'|'cif'|'sdf'} format
 * @property {string} file 相对 assets 的路径
 * @property {string} [note]
 */

/** @type {Dataset[]} */
export const DATASETS = [
    {id: '1crn',     label: 'Crambin 1CRN', format: 'pdb', file: 'pdb/小蛋白-1CRN.pdb', note: '327 atoms'},
    {id: '1ubq',     label: 'Ubiquitin 1UBQ', format: 'pdb', file: 'pdb/泛素-1UBQ.pdb', note: '76 residues'},
    {id: '4hhb',     label: 'Hemoglobin 4HHB', format: 'pdb', file: 'pdb/血红蛋白-4HHB.pdb', note: '4779 atoms / 4 chains'},
    {id: '6lu7',     label: 'SARS-CoV-2 6LU7', format: 'pdb', file: 'pdb/SARS-CoV-2 主蛋白酶 + 抑制剂 N3-6LU7.pdb', note: 'ligand 02J'},
    {id: '5a9z',     label: 'Ribosome 5A9Z', format: 'cif', file: 'cif/5a9z.cif', note: '150k atoms'},
    {id: '1ffk',     label: 'Ribosome 1FFK', format: 'cif', file: 'cif/1FFK.cif', note: '64k atoms / 29 chains'},
    {id: '4v6x',     label: 'Ribosome 4V6X', format: 'cif', file: 'cif/4v6x.cif', note: '238k atoms / 89 chains'},
    {id: 'aspirin',  label: 'Aspirin', format: 'sdf', file: 'sdf/阿司匹林-2244.sdf', note: 'small molecule'},
    {id: 'caffeine', label: 'Caffeine', format: 'sdf', file: 'sdf/咖啡因-2519.sdf', note: 'small molecule'},
    {id: '9y4h',     label: 'Guinea pig Ribosome with P/E-tRNA and mRNA', format: 'cif', file: 'cif/9y4h.cif', note: '371528 atoms / 78 chains'}
];

/** @type {Map<string, Dataset>} */
const BY_ID = new Map(DATASETS.map(d => [d.id, d]));

export function getDataset(id) {
    const dataset = BY_ID.get(id);

    if (!dataset) throw new Error(`unknown dataset: ${id}`);

    return dataset;
}

export function datasetPath(id) {
    return resolve(ASSETS_ROOT, getDataset(id).file);
}

export function readDataset(id) {
    const dataset = getDataset(id);

    return {
        ...dataset,
        text: readFileSync(datasetPath(id), 'utf8'),
        bytes: statSync(datasetPath(id)).size,
    };
}

export function listDatasets() {
    return DATASETS.map(dataset => ({
        ...dataset,
        bytes: statSync(datasetPath(dataset.id)).size,
    }));
}
