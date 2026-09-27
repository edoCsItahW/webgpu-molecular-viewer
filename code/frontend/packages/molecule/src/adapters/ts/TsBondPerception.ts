// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file TsBondPerception.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc TS 键感知：基于共价半径之和 + cell list 邻居表，推断缺失的共价键。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {BondPerceptionPort, PerceptionOptions} from "../../ports";
import type {StructureData} from "@wmv/structure";
import {MDR_MAJOR, elementByZ} from "@wmv/structure";

/**
 * TS 键感知实现。
 * 判定：d(i,j) ≤ (covRadius(i) + covRadius(j)) * tolerance，且不超过 maxValence。
 * 必须用 cell list，否则 O(N²) 对 10 万原子不可接受。
 */
export class TsBondPerception implements BondPerceptionPort {
    async perceive(
        data: StructureData,
        options: PerceptionOptions = {},
        signal?: AbortSignal,
    ): Promise<StructureData> {
        const tolerance = options.tolerance ?? 1.2;
        const maxValence = options.maxValence ?? 6;
        const includeHydrogens = options.includeHydrogens ?? false;

        const n = data.meta.atomCount;
        const pos = data.atoms.positions;
        const elements = data.atoms.element;

        // 预计算每个原子的共价半径
        const radii = new Float32Array(n);
        const isHydrogen = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
            const info = elementByZ(elements[i]);
            radii[i] = info.covalentRadius;
            isHydrogen[i] = elements[i] === 1 ? 1 : 0;
        }

        // 计算包围盒
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
        }

        // cell 边长 = 最大共价半径 * 2 * tolerance
        const maxCov = 2.0; // 足够大的上界
        const cellSize = maxCov * 2 * tolerance;
        const nx = Math.max(1, Math.ceil((maxX - minX) / cellSize));
        const ny = Math.max(1, Math.ceil((maxY - minY) / cellSize));
        const nz = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));

        // cell list：cellIndex → atomIndex[]
        const cellCount = nx * ny * nz;
        const cells: number[][] = new Array(cellCount);
        for (let i = 0; i < cellCount; i++) cells[i] = [];

        const cellOf = (x: number, y: number, z: number) => {
            const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cellSize)));
            const cj = Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cellSize)));
            const ck = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cellSize)));
            return (ci * ny + cj) * nz + ck;
        };

        for (let i = 0; i < n; i++) {
            const c = cellOf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
            cells[c].push(i);
        }

        // 收集候选键对
        const pairs: Array<[number, number, number]> = []; // [a, b, distSq]
        const valence = new Int32Array(n);

        for (let ci = 0; ci < nx; ci++) {
            for (let cj = 0; cj < ny; cj++) {
                for (let ck = 0; ck < nz; ck++) {
                    const cellIdx = (ci * ny + cj) * nz + ck;
                    const bucket = cells[cellIdx];
                    // 遍历 27 邻居（含自身），但只处理 i < j
                    for (let di = 0; di <= 1; di++) {
                        for (let dj = -1; dj <= 1; dj++) {
                            for (let dk = -1; dk <= 1; dk++) {
                                if (di === 0 && dj < 0) continue;
                                if (di === 0 && dj === 0 && dk <= 0) continue;
                                const ni = ci + di, nj = cj + dj, nk = ck + dk;
                                if (ni < 0 || ni >= nx || nj < 0 || nj >= ny || nk < 0 || nk >= nz) continue;
                                const nIdx = (ni * ny + nj) * nz + nk;
                                const nBucket = cells[nIdx];
                                for (const a of bucket) {
                                    if (!includeHydrogens && isHydrogen[a]) continue;
                                    for (const b of nBucket) {
                                        if (!includeHydrogens && isHydrogen[b]) continue;
                                        if (valence[a] >= maxValence || valence[b] >= maxValence) continue;
                                        const dx = pos[a * 3] - pos[b * 3];
                                        const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
                                        const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
                                        const d2 = dx * dx + dy * dy + dz * dz;
                                        const cutoff = (radii[a] + radii[b]) * tolerance;
                                        if (d2 <= cutoff * cutoff && d2 > 0) {
                                            pairs.push([a, b, d2]);
                                            valence[a]++;
                                            valence[b]++;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 同 cell 内的对（i < j）
        for (let c = 0; c < cellCount; c++) {
            const bucket = cells[c];
            for (let p = 0; p < bucket.length; p++) {
                const a = bucket[p];
                if (!includeHydrogens && isHydrogen[a]) continue;
                for (let q = p + 1; q < bucket.length; q++) {
                    const b = bucket[q];
                    if (!includeHydrogens && isHydrogen[b]) continue;
                    if (valence[a] >= maxValence || valence[b] >= maxValence) continue;
                    const dx = pos[a * 3] - pos[b * 3];
                    const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
                    const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    const cutoff = (radii[a] + radii[b]) * tolerance;
                    if (d2 <= cutoff * cutoff && d2 > 0) {
                        pairs.push([a, b, d2]);
                        valence[a]++;
                        valence[b]++;
                    }
                }
            }
        }

        // 按距离排序，价数超限时丢弃最长的候选
        pairs.sort((x, y) => x[2] - y[2]);
        const finalValence = new Int32Array(n);
        const accepted: Array<[number, number]> = [];
        for (const [a, b] of pairs) {
            if (finalValence[a] >= maxValence || finalValence[b] >= maxValence) continue;
            accepted.push([Math.min(a, b), Math.max(a, b)]);
            finalValence[a]++;
            finalValence[b]++;
        }

        // 构建 BondColumns
        const m = accepted.length;
        const ba = new Uint32Array(m);
        const bb = new Uint32Array(m);
        const order = new Uint8Array(m);
        for (let i = 0; i < m; i++) {
            ba[i] = accepted[i][0];
            bb[i] = accepted[i][1];
            order[i] = 2; // 未知键级 → 单键编码
        }

        const result: StructureData = {
            ...data,
            bonds: { a: ba, b: bb, order, inferred: true },
            meta: { ...data.meta, mdrVersion: MDR_MAJOR },
        };

        void signal;
        return result;
    }
}
