// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file neighbor-list.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 邻居表：基于空间哈希（cell list）的 CSR 邻居表构建，支持 skin 与最大位移触发重建。
 *
 * 不变量：
 *   - 原子 i 的邻居 = list[ start[i] .. start[i+1] )（CSR，左闭右开）
 *   - 双向存储：若 j 在 i 的邻居中，则 i 也在 j 的邻居中
 *   - cell 边长 = cutoff + skin
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/**
 * CSR 格式的邻居表。
 * 原子 i 的邻居索引为 list[start[i] .. start[i+1]]。
 */
export interface NeighborList {
    /** N+1，前缀和 */
    start: Uint32Array;
    /** N，每个原子的邻居数 */
    count: Uint32Array;
    /** 总邻居数，双向存储 */
    list: Uint32Array;
    /** 构建时使用的 cell 边长 */
    cellSize: number;
    /** 构建时的步号 */
    builtAtStep: number;
    /** 是否因 maxNeighborsPerAtom 发生截断 */
    truncated: boolean;
}

/** 邻居表构建选项。 */
export interface NeighborListOptions {
    /** 截断半径，Å，与力场 cutoff 一致 */
    cutoff: number;
    /** 缓冲厚度，Å，默认 1.0 */
    skin: number;
    /** 每个原子最大邻居数，默认 64；超出截断 */
    maxNeighborsPerAtom: number;
}

/** 默认邻居表选项。 */
export const DEFAULT_NEIGHBOR_OPTIONS: NeighborListOptions = {
    cutoff: 10,
    skin: 1.0,
    maxNeighborsPerAtom: 64,
};

/** 13 个正向邻居方向（避免重复对）。 */
const CELL_DIRS: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1],
    [0, 1, 1], [0, 1, -1],
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
];

/**
 * 用 cell list 构建邻居表。
 *
 * @param positions 原子位置，3N，Å（stride 3）
 * @param atomCount 原子数 N
 * @param options 构建选项
 * @param builtAtStep 构建时的步号
 * @returns CSR 邻居表
 */
export function buildNeighborList(
    positions: Float32Array,
    atomCount: number,
    options: NeighborListOptions,
    builtAtStep: number,
): NeighborList {
    const n = atomCount;
    const rcut = options.cutoff + options.skin;
    const rcutSq = rcut * rcut;
    const maxN = options.maxNeighborsPerAtom;

    // 包围盒
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < n; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }

    const cellSize = rcut;
    const nx = Math.max(1, Math.ceil((maxX - minX) / cellSize));
    const ny = Math.max(1, Math.ceil((maxY - minY) / cellSize));
    const nz = Math.max(1, Math.ceil((maxZ - minZ) / cellSize));
    const cellCount = nx * ny * nz;

    // cell → 原子索引列表
    const cells: number[][] = new Array(cellCount);
    for (let c = 0; c < cellCount; c++) cells[c] = [];

    const cellOf = (x: number, y: number, z: number): number => {
        const ci = Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cellSize)));
        const cj = Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cellSize)));
        const ck = Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cellSize)));
        return (ci * ny + cj) * nz + ck;
    };

    for (let i = 0; i < n; i++) {
        cells[cellOf(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])].push(i);
    }

    // 收集对 (a, b) 且 a < b
    const pairs: number[] = [];
    const counts = new Int32Array(n);
    let truncated = false;

    for (let ci = 0; ci < nx; ci++) {
        for (let cj = 0; cj < ny; cj++) {
            for (let ck = 0; ck < nz; ck++) {
                const cellIdx = (ci * ny + cj) * nz + ck;
                const bucket = cells[cellIdx];

                // 同 cell 内
                for (let p = 0; p < bucket.length; p++) {
                    const a = bucket[p];
                    for (let q = p + 1; q < bucket.length; q++) {
                        const b = bucket[q];
                        if (counts[a] >= maxN || counts[b] >= maxN) { truncated = true; continue; }
                        const dx = positions[a * 3] - positions[b * 3];
                        const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
                        const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
                        const d2 = dx * dx + dy * dy + dz * dz;
                        if (d2 <= rcutSq && d2 > 0) {
                            pairs.push(a, b);
                            counts[a]++; counts[b]++;
                        }
                    }
                }

                // 邻居 cell（只处理正向偏移）
                for (const [di, dj, dk] of CELL_DIRS) {
                    const ni = ci + di, nj = cj + dj, nk = ck + dk;
                    if (ni < 0 || ni >= nx || nj < 0 || nj >= ny || nk < 0 || nk >= nz) continue;
                    const nIdx = (ni * ny + nj) * nz + nk;
                    const nBucket = cells[nIdx];
                    for (const a of bucket) {
                        if (counts[a] >= maxN) { truncated = true; continue; }
                        for (const b of nBucket) {
                            if (counts[b] >= maxN) { truncated = true; continue; }
                            const dx = positions[a * 3] - positions[b * 3];
                            const dy = positions[a * 3 + 1] - positions[b * 3 + 1];
                            const dz = positions[a * 3 + 2] - positions[b * 3 + 2];
                            const d2 = dx * dx + dy * dy + dz * dz;
                            if (d2 <= rcutSq && d2 > 0) {
                                pairs.push(a, b);
                                counts[a]++; counts[b]++;
                            }
                        }
                    }
                }
            }
        }
    }

    // 构建 CSR
    const start = new Uint32Array(n + 1);
    for (let i = 0; i < n; i++) start[i + 1] = start[i] + counts[i];
    const count = new Uint32Array(counts);
    const list = new Uint32Array(pairs.length);
    const cursor = new Uint32Array(n);
    for (let p = 0; p < pairs.length; p += 2) {
        const a = pairs[p], b = pairs[p + 1];
        list[start[a] + cursor[a]++] = b;
        list[start[b] + cursor[b]++] = a;
    }

    return { start, count, list, cellSize, builtAtStep, truncated };
}

/**
 * 判断是否需要重建邻居表。
 * 重建条件：自上次构建以来，任一原子的位移超过 skin/2。
 *
 * @param positions 当前位置，3N
 * @param referencePositions 建表时的位置快照，3N
 * @param atomCount N
 * @param skin skin 厚度，Å
 * @returns 是否需要重建
 */
export function needsRebuild(
    positions: Float32Array,
    referencePositions: Float32Array,
    atomCount: number,
    skin: number,
): boolean {
    const halfSkinSq = (skin * 0.5) * (skin * 0.5);
    for (let i = 0; i < atomCount; i++) {
        const dx = positions[i * 3] - referencePositions[i * 3];
        const dy = positions[i * 3 + 1] - referencePositions[i * 3 + 1];
        const dz = positions[i * 3 + 2] - referencePositions[i * 3 + 2];
        if (dx * dx + dy * dy + dz * dz > halfSkinSq) return true;
    }
    return false;
}
