// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file sdf.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc SDF / MOL（V2000）解析器：原子块、键块、键级、形式电荷。
 *
 *       为什么自研：
 *         SDF 是 SRS 的 P0 格式，且 MDR 需要键级/电荷；RDKit WASM 的加载与内存不适合每次打开文件。
 *       范围：
 *         - V2000 的常见子集（多记录时取第一条，遇到 `$$$$` 停止）；
 *         - `M  CHG` 覆盖原子电荷块；
 *         - V3000 明确报错（不静默给出错误结构）。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { StructureBuilder } from "./builder.js";
import { normalizeElementSymbol } from "./elements.js";
import { nameFromFilename, type ParseOptions, type ParsedStructure } from "./types.js";


/** V2000 电荷码 → 形式电荷 */
const CHARGE_CODE: Record<number, number> = {
    0: 0,
    1: 3,
    2: 2,
    3: 1,
    4: 0,
    5: -1,
    6: -2,
    7: -3,
};


/**
 * 解析 SDF/MOL（V2000）文本。
 */
export function parseSdf(text: string, filename = "", options: ParseOptions = {}): ParsedStructure {
    const startedAt = performance.now();
    const lines = text.split(/\r?\n/);

    // 只取第一条记录
    let end = lines.length;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.trim() === "$$$$") {
            end = i;
            break;
        }
    }

    // 找到 counts 行（含 V2000）；V3000 明确拒绝
    let countsIndex = -1;

    for (let i = 0; i < Math.min(end, 20); i++) {
        const line = lines[i]!;

        if (line.includes("V3000"))
            throw new Error("MsgId: 暂不支持 V3000 SDF/MOL，请另存为 V2000");

        if (line.includes("V2000")) {
            countsIndex = i;
            break;
        }
    }

    if (countsIndex < 0) throw new Error("MsgId: 无法识别的 SDF/MOL（缺少 V2000 counts 行）");

    const counts = lines[countsIndex]!;
    const atomCount = Number.parseInt(counts.slice(0, 3), 10);
    const bondCount = Number.parseInt(counts.slice(3, 6), 10);

    if (!Number.isFinite(atomCount) || atomCount <= 0) throw new Error("MsgId: SDF 原子数为 0");

    const builder = new StructureBuilder(atomCount);
    const charges = new Float32Array(atomCount);

    for (let i = 0; i < atomCount; i++) {
        const line = lines[countsIndex + 1 + i];

        if (!line) throw new Error("MsgId: SDF 原子块被截断");

        const x = Number.parseFloat(line.slice(0, 10));
        const y = Number.parseFloat(line.slice(10, 20));
        const z = Number.parseFloat(line.slice(20, 30));

        let symbol = line.slice(31, 34).trim();

        if (!symbol) symbol = "C";

        const chargeCode = Number.parseInt(line.slice(36, 39), 10);
        const charge = CHARGE_CODE[Number.isFinite(chargeCode) ? chargeCode : 0] ?? 0;

        charges[i] = charge;
        builder.push(x, y, z, normalizeElementSymbol(symbol), "LIG", "", 0, 1, {
            flags: 0,
            residueSeq: 1,
            residueIcode: "",
        });
    }

    // ---- 键块 ----
    const pairs: number[] = [];
    const orders: number[] = [];

    for (let i = 0; i < bondCount; i++) {
        const line = lines[countsIndex + 1 + atomCount + i];

        if (!line) throw new Error("MsgId: SDF 键块被截断");

        const a = Number.parseInt(line.slice(0, 3), 10) - 1;
        const b = Number.parseInt(line.slice(3, 6), 10) - 1;
        const order = Number.parseInt(line.slice(6, 9), 10);

        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
        if (a < 0 || b < 0 || a >= atomCount || b >= atomCount) continue;

        pairs.push(Math.min(a, b), Math.max(a, b));
        orders.push(Number.isFinite(order) && order >= 1 && order <= 4 ? order : 1);
    }

    // ---- M  CHG 覆盖 ----
    for (let i = countsIndex + 1 + atomCount + bondCount; i < end; i++) {
        const line = lines[i]!;

        if (!line.startsWith("M  CHG")) continue;
        if (line.startsWith("M  END")) break;

        const n = Number.parseInt(line.slice(6, 9), 10);

        for (let k = 0; k < n; k++) {
            const atomIndex = Number.parseInt(line.slice(9 + k * 8, 13 + k * 8), 10) - 1;
            const value = Number.parseInt(line.slice(13 + k * 8, 17 + k * 8), 10);

            if (atomIndex >= 0 && atomIndex < atomCount && Number.isFinite(value))
                charges[atomIndex] = value;
        }
    }

    const bonds = new Uint32Array(pairs);
    const bondOrders = new Uint8Array(orders);

    return builder.finish(
        options.name ?? nameFromFilename(filename),
        "sdf",
        bonds,
        bonds.length / 2,
        performance.now() - startedAt,
        0,
        {bondOrders, charges, bondsInferred: false}
    );
}

