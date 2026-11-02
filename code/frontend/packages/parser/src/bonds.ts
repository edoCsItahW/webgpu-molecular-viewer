// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file bonds.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 几何键感知（SoA 版）：共价半径判据 + 哈希网格 + 距离分桶贪心 + 价数上限。
 *
 *       与 app 侧 `bond-perception.ts` 的差别（为什么重写）：
 *         - 不创建 `{i,j,distance}` 对象、不用字符串格子键：键全部走 TypedArray；
 *         - 网格用"开放寻址哈希 + CSR"而不是 `Map<string, number[]>`，100k 原子时
 *           避免几十万个小数组与字符串（GC 压力、缓存不友好）；
 *         - 候选按距离分 64 桶（计数排序），避免 `Array.sort` 的比较器开销。
 *
 *       复杂度：O(N + M)，M 为候选对数（稠密堆叠时最坏 O(N²)，但网格已把常数压得很低）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

export interface BondPerceptionInput {
    /** 坐标，3N */
    positions: Float32Array;

    /** 原子数 */
    count: number;

    /** 每原子共价半径（Å） */
    radii: Float32Array;

    /** 每原子价数上限 */
    valence: Uint8Array;

    /** 显式键（文件给出的下标对，长度 2E，i<j） */
    explicit?: Uint32Array;

    /** 共价半径之和的容差，默认 1.25 */
    tolerance?: number;

    /** 单键长度上限（Å），默认 2.6 */
    maxBondLength?: number;
}

export interface BondPerceptionResult {
    /** 键端点，长度 2B */
    bonds: Uint32Array;

    /** 键数 */
    bondCount: number;
}

/** 17 bit 格子坐标偏移（约 ±170k Å，足够覆盖任何结构） */
const CELL_OFFSET = 1 << 16;

/** 17 bit 掩码 */
const CELL_MASK = (1 << 17) - 1;

/** 距离分桶数 */
const DISTANCE_BUCKETS = 64;


/**
 * 推断化学键。
 */
export function perceiveBondsSoA(input: BondPerceptionInput): BondPerceptionResult {
    const {positions, count, radii, valence: valenceLimit} = input;
    const tolerance = input.tolerance ?? 1.25;
    const maxBondLength = input.maxBondLength ?? 2.6;

    if (count === 0) return {bonds: new Uint32Array(0), bondCount: 0};

    const usedValence = new Uint8Array(count);
    const seen = new Set<number>();
    let pairs = new Uint32Array(1024);
    let distances = new Float32Array(1024);
    let pairCount = 0;

    const pushPair = (i: number, j: number, distance: number): void => {
        if (pairCount * 2 >= pairs.length) {
            const nextPairs = new Uint32Array(pairs.length * 2);
            nextPairs.set(pairs);
            pairs = nextPairs;

            const nextDistances = new Float32Array(distances.length * 2);
            nextDistances.set(distances);
            distances = nextDistances;
        }

        pairs[pairCount * 2] = i;
        pairs[pairCount * 2 + 1] = j;
        distances[pairCount] = distance;
        pairCount++;
    };

    // ---- 1. 显式键优先 ----
    const explicit = input.explicit;

    if (explicit && explicit.length >= 2) {
        for (let e = 0; e < explicit.length; e += 2) {
            const a = explicit[e]!;
            const b = explicit[e + 1]!;

            if (a === b || a >= count || b >= count) continue;

            const i = a < b ? a : b;
            const j = a < b ? b : a;
            const key = i * count + j;

            if (seen.has(key)) continue;

            seen.add(key);
            usedValence[i] = usedValence[i]! + 1;
            usedValence[j] = usedValence[j]! + 1;
        }
    }

    // ---- 2. 哈希网格：建表 + 计数 ----
    let tableSize = 1024;

    while (tableSize < count * 2) tableSize <<= 1;

    const mask = tableSize - 1;
    const slotKeys = new Float64Array(tableSize).fill(-1);
    const slotStart = new Uint32Array(tableSize);
    const slotCount = new Uint32Array(tableSize);

    const cellSize = Math.max(0.5, maxBondLength);
    const cellKeys = new Float64Array(count);

    const hashOf = (key: number): number => {
        const low = key % 4294967296;
        let h = Math.imul(low >>> 0, 0x9e3779b1) >>> 0;

        h ^= h >>> 15;
        h = Math.imul(h, 0x85ebca6b) >>> 0;
        h ^= h >>> 13;

        return h & mask;
    };

    const findSlot = (key: number): number => {
        let slot = hashOf(key);

        for (let probes = 0; probes < tableSize; probes++) {
            const existing = slotKeys[slot]!;

            if (existing === key) return slot;
            if (existing === -1) return -1;

            slot = (slot + 1) & mask;
        }

        return -1;
    };

    const insertSlot = (key: number): number => {
        let slot = hashOf(key);

        for (let probes = 0; probes < tableSize; probes++) {
            const existing = slotKeys[slot]!;

            if (existing === key) return slot;

            if (existing === -1) {
                slotKeys[slot] = key;

                return slot;
            }

            slot = (slot + 1) & mask;
        }

        return -1;
    };

    const cellKeyOf = (x: number, y: number, z: number): number => {
        const qx = (Math.floor(x / cellSize) + CELL_OFFSET) & CELL_MASK;
        const qy = (Math.floor(y / cellSize) + CELL_OFFSET) & CELL_MASK;
        const qz = (Math.floor(z / cellSize) + CELL_OFFSET) & CELL_MASK;

        return qx + qy * 131072 + qz * 17179869184;
    };

    for (let i = 0; i < count; i++) {
        const key = cellKeyOf(positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!);
        cellKeys[i] = key;

        const slot = insertSlot(key);
        if (slot >= 0) slotCount[slot] = slotCount[slot]! + 1;
    }

    let offset = 0;

    for (let slot = 0; slot < tableSize; slot++) {
        slotStart[slot] = offset;
        offset += slotCount[slot]!;
    }

    const totalSlots = offset;
    const cellCursor = slotStart.slice();
    const atomOrder = new Uint32Array(totalSlots);

    for (let i = 0; i < count; i++) {
        const slot = findSlot(cellKeys[i]!);
        if (slot < 0) continue;

        atomOrder[cellCursor[slot]!] = i;
        cellCursor[slot] = cellCursor[slot]! + 1;
    }

    // ---- 3. 收集候选（同格 + 26 邻格，j > i 去重） ----
    for (let i = 0; i < count; i++) {
        const x = positions[i * 3]!;
        const y = positions[i * 3 + 1]!;
        const z = positions[i * 3 + 2]!;
        const ri = radii[i]!;
        const qx = Math.floor(x / cellSize);
        const qy = Math.floor(y / cellSize);
        const qz = Math.floor(z / cellSize);

        for (let dz = -1; dz <= 1; dz++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const key = ((qx + dx + CELL_OFFSET) & CELL_MASK)
                        + ((qy + dy + CELL_OFFSET) & CELL_MASK) * 131072
                        + ((qz + dz + CELL_OFFSET) & CELL_MASK) * 17179869184;

                    const slot = findSlot(key);
                    if (slot < 0) continue;

                    const start = slotStart[slot]!;
                    const end = start + slotCount[slot]!;

                    for (let k = start; k < end; k++) {
                        const j = atomOrder[k]!;
                        if (j <= i) continue;

                        const ddx = x - positions[j * 3]!;
                        const ddy = y - positions[j * 3 + 1]!;
                        const ddz = z - positions[j * 3 + 2]!;
                        const distance = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

                        const cutoff = Math.min(maxBondLength, (ri + radii[j]!) * tolerance);

                        if (distance <= cutoff && distance > 1e-3) pushPair(i, j, distance);
                    }
                }
            }
        }
    }

    // ---- 4. 距离分桶（计数排序），从短到长贪心 ----
    const bucketCounts = new Uint32Array(DISTANCE_BUCKETS + 1);

    for (let p = 0; p < pairCount; p++) {
        const bucket = Math.min(DISTANCE_BUCKETS - 1, Math.floor(distances[p]! / maxBondLength * DISTANCE_BUCKETS));
        bucketCounts[bucket + 1] = bucketCounts[bucket + 1]! + 1;
    }

    for (let b = 0; b < DISTANCE_BUCKETS; b++)
        bucketCounts[b + 1] = bucketCounts[b + 1]! + bucketCounts[b]!;

    const bucketCursor = bucketCounts.slice(0, DISTANCE_BUCKETS);
    const order = new Uint32Array(pairCount);

    for (let p = 0; p < pairCount; p++) {
        const bucket = Math.min(DISTANCE_BUCKETS - 1, Math.floor(distances[p]! / maxBondLength * DISTANCE_BUCKETS));
        order[bucketCursor[bucket]!] = p;
        bucketCursor[bucket] = bucketCursor[bucket]! + 1;
    }

    const bondPairs: number[] = [];

    // 显式键先入结果（与感知键共用 seen）
    if (explicit && explicit.length >= 2) {
        const explicitSeen = new Set<number>();

        for (let e = 0; e < explicit.length; e += 2) {
            const a = explicit[e]!;
            const b = explicit[e + 1]!;

            if (a === b || a >= count || b >= count) continue;

            const i = a < b ? a : b;
            const j = a < b ? b : a;
            const key = i * count + j;

            if (explicitSeen.has(key)) continue;
            explicitSeen.add(key);

            bondPairs.push(i, j);
        }
    }

    for (let k = 0; k < pairCount; k++) {
        const p = order[k]!;
        const i = pairs[p * 2]!;
        const j = pairs[p * 2 + 1]!;

        if (usedValence[i]! >= valenceLimit[i]! || usedValence[j]! >= valenceLimit[j]!) continue;

        const key = i * count + j;
        if (seen.has(key)) continue;

        seen.add(key);
        usedValence[i] = usedValence[i]! + 1;
        usedValence[j] = usedValence[j]! + 1;
        bondPairs.push(i, j);
    }

    const bonds = new Uint32Array(bondPairs.length);
    bonds.set(bondPairs);

    return {bonds, bondCount: bonds.length / 2};
}

