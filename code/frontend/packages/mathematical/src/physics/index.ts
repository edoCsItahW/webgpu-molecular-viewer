// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file index.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 物理模块聚合导出：常数、邻居表、LJ、谐振键、库仑、积分器。
 *
 * 本模块是"物理事实"的唯一 CPU 落点：
 *   - 单位明确（Å / ps / u / e / kJ·mol⁻¹）
 *   - 公式唯一（与 GPU 侧共享）
 *   - 零分配（Into 函数不创建对象）
 *   - 可复现（随机源由调用方注入）
 *
 * 不认识 Molecule / 残基 / 文件格式，只处理扁平 TypedArray。
 *
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

export * from "./constants";
export * from "./neighbor-list";
export * from "./lennard-jones";
export * from "./harmonic-bond";
export * from "./coulomb";
export * from "./integrator";
