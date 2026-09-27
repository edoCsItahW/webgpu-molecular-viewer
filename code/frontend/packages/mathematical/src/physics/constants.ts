// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file constants.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 物理具名常量。所有物理计算只能使用这些常量做换算，禁止在算法中出现魔数。
 *
 * 单位制（与 MDR 一致）：
 *   - 长度：Å（不是 nm）
 *   - 时间：ps
 *   - 质量：u（道尔顿）
 *   - 能量：kJ/mol
 *   - 电荷：e
 *   - 温度：K
 *   - 力：kJ/(mol·Å)
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 玻尔兹曼常数 k_B，单位 kJ/(mol·K)。 */
export const BOLTZMANN_KJ_PER_MOL_K = 0.008314462618;

/** 库仑常数 k_e，单位 kJ·Å/(mol·e²)。 */
export const COULOMB_KJ_A_PER_MOL_E2 = 1389.3545764;

/** 1 u 对应的千克数，仅用于展示换算，物理内部不转 SI。 */
export const AMU_TO_KG = 1.66053906660e-27;

/** 飞秒 → 皮秒换算因子：1 fs = 1e-3 ps。 */
export const FS_TO_PS = 1e-3;

/** 阿伏伽德罗常数（用于单位换算参考）。 */
export const AVOGADRO = 6.02214076e23;

/** 2 的 1/6 次方（LJ 势最小能量位置 r_min = 2^(1/6) σ）。 */
export const TWO_POW_ONE_SIXTH = 1.122462048309373;
