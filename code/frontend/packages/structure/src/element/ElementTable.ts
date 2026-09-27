// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ElementTable.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 元素周期表：符号 ↔ 原子序数 ↔ 半径/质量/颜色。解析器、领域层、力学、键感知共用。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 单个元素的元信息 */
export interface ElementInfo {
    /** 原子序数 Z */
    z: number;
    /** 元素符号，如 "C" */
    symbol: string;
    /** 英文名 */
    name: string;
    /** 原子质量，单位 u（道尔顿） */
    mass: number;
    /** 范德华半径，单位 Å */
    vdwRadius: number;
    /** 共价半径，单位 Å，用于键感知 */
    covalentRadius: number;
    /** CPK 颜色，sRGB 十六进制字符串 */
    cpkColor: string;
    /** 常见价数，用于键感知的度数上限 */
    valence: number;
}

/** 未知元素占位（灰色、半径 1.5 Å、质量 12），不抛错 */
const UNKNOWN_ELEMENT: ElementInfo = {
    z: 0,
    symbol: "X",
    name: "unknown",
    mass: 12,
    vdwRadius: 1.5,
    covalentRadius: 0.77,
    cpkColor: "#888888",
    valence: 0,
};

/**
 * 元素表。索引 = 原子序数 Z。
 * 数据来源：常见化学参考值（半径为经验值，颜色为 CPK 约定）。
 * 仅列出前 118 号元素中可视化与键感知需要的；未列出的返回占位。
 */
const ELEMENTS: readonly ElementInfo[] = [
    UNKNOWN_ELEMENT, // Z = 0 占位
    { z: 1, symbol: "H", name: "hydrogen", mass: 1.008, vdwRadius: 1.2, covalentRadius: 0.31, cpkColor: "#FFFFFF", valence: 1 },
    { z: 2, symbol: "He", name: "helium", mass: 4.003, vdwRadius: 1.4, covalentRadius: 0.28, cpkColor: "#D9FFFF", valence: 0 },
    { z: 3, symbol: "Li", name: "lithium", mass: 6.941, vdwRadius: 1.82, covalentRadius: 1.28, cpkColor: "#CC80FF", valence: 1 },
    { z: 4, symbol: "Be", name: "beryllium", mass: 9.012, vdwRadius: 1.7, covalentRadius: 0.96, cpkColor: "#C2FF00", valence: 2 },
    { z: 5, symbol: "B", name: "boron", mass: 10.81, vdwRadius: 1.92, covalentRadius: 0.84, cpkColor: "#FFB5B5", valence: 3 },
    { z: 6, symbol: "C", name: "carbon", mass: 12.011, vdwRadius: 1.7, covalentRadius: 0.76, cpkColor: "#404040", valence: 4 },
    { z: 7, symbol: "N", name: "nitrogen", mass: 14.007, vdwRadius: 1.55, covalentRadius: 0.71, cpkColor: "#3050F8", valence: 3 },
    { z: 8, symbol: "O", name: "oxygen", mass: 15.999, vdwRadius: 1.52, covalentRadius: 0.66, cpkColor: "#FF0D0D", valence: 2 },
    { z: 9, symbol: "F", name: "fluorine", mass: 18.998, vdwRadius: 1.47, covalentRadius: 0.57, cpkColor: "#90E050", valence: 1 },
    { z: 10, symbol: "Ne", name: "neon", mass: 20.18, vdwRadius: 1.54, covalentRadius: 0.58, cpkColor: "#B3E3F5", valence: 0 },
    { z: 11, symbol: "Na", name: "sodium", mass: 22.99, vdwRadius: 2.27, covalentRadius: 1.66, cpkColor: "#AB5CF2", valence: 1 },
    { z: 12, symbol: "Mg", name: "magnesium", mass: 24.305, vdwRadius: 1.73, covalentRadius: 1.41, cpkColor: "#8AFF00", valence: 2 },
    { z: 13, symbol: "Al", name: "aluminium", mass: 26.982, vdwRadius: 1.84, covalentRadius: 1.21, cpkColor: "#BFA6A6", valence: 3 },
    { z: 14, symbol: "Si", name: "silicon", mass: 28.085, vdwRadius: 2.1, covalentRadius: 1.11, cpkColor: "#F0C8A0", valence: 4 },
    { z: 15, symbol: "P", name: "phosphorus", mass: 30.974, vdwRadius: 1.8, covalentRadius: 1.07, cpkColor: "#FF8000", valence: 5 },
    { z: 16, symbol: "S", name: "sulfur", mass: 32.06, vdwRadius: 1.8, covalentRadius: 1.05, cpkColor: "#FFFF30", valence: 2 },
    { z: 17, symbol: "Cl", name: "chlorine", mass: 35.45, vdwRadius: 1.75, covalentRadius: 1.02, cpkColor: "#1FF01F", valence: 1 },
    { z: 18, symbol: "Ar", name: "argon", mass: 39.948, vdwRadius: 1.88, covalentRadius: 1.06, cpkColor: "#80D1E3", valence: 0 },
    { z: 19, symbol: "K", name: "potassium", mass: 39.098, vdwRadius: 2.75, covalentRadius: 2.03, cpkColor: "#8F40D4", valence: 1 },
    { z: 20, symbol: "Ca", name: "calcium", mass: 40.078, vdwRadius: 2.31, covalentRadius: 1.76, cpkColor: "#3DFF00", valence: 2 },
    { z: 21, symbol: "Sc", name: "scandium", mass: 44.956, vdwRadius: 2.15, covalentRadius: 1.7, cpkColor: "#E6E6E6", valence: 3 },
    { z: 22, symbol: "Ti", name: "titanium", mass: 47.867, vdwRadius: 2.11, covalentRadius: 1.6, cpkColor: "#BFC2C7", valence: 4 },
    { z: 23, symbol: "V", name: "vanadium", mass: 50.942, vdwRadius: 2.07, covalentRadius: 1.53, cpkColor: "#A6A6AB", valence: 5 },
    { z: 24, symbol: "Cr", name: "chromium", mass: 51.996, vdwRadius: 2.06, covalentRadius: 1.39, cpkColor: "#8A99C7", valence: 6 },
    { z: 25, symbol: "Mn", name: "manganese", mass: 54.938, vdwRadius: 2.05, covalentRadius: 1.39, cpkColor: "#9C7AC7", valence: 7 },
    { z: 26, symbol: "Fe", name: "iron", mass: 55.845, vdwRadius: 2.04, covalentRadius: 1.32, cpkColor: "#E06633", valence: 6 },
    { z: 27, symbol: "Co", name: "cobalt", mass: 58.933, vdwRadius: 2.0, covalentRadius: 1.26, cpkColor: "#F090A0", valence: 5 },
    { z: 28, symbol: "Ni", name: "nickel", mass: 58.693, vdwRadius: 1.97, covalentRadius: 1.24, cpkColor: "#50D050", valence: 4 },
    { z: 29, symbol: "Cu", name: "copper", mass: 63.546, vdwRadius: 1.96, covalentRadius: 1.32, cpkColor: "#C88033", valence: 4 },
    { z: 30, symbol: "Zn", name: "zinc", mass: 65.38, vdwRadius: 2.01, covalentRadius: 1.22, cpkColor: "#7D80B0", valence: 2 },
    { z: 31, symbol: "Ga", name: "gallium", mass: 69.723, vdwRadius: 1.87, covalentRadius: 1.22, cpkColor: "#C28F8F", valence: 3 },
    { z: 32, symbol: "Ge", name: "germanium", mass: 72.63, vdwRadius: 2.11, covalentRadius: 1.2, cpkColor: "#668F8F", valence: 4 },
    { z: 33, symbol: "As", name: "arsenic", mass: 74.922, vdwRadius: 1.85, covalentRadius: 1.19, cpkColor: "#BD80E3", valence: 5 },
    { z: 34, symbol: "Se", name: "selenium", mass: 78.971, vdwRadius: 1.9, covalentRadius: 1.2, cpkColor: "#FFA100", valence: 6 },
    { z: 35, symbol: "Br", name: "bromine", mass: 79.904, vdwRadius: 1.85, covalentRadius: 1.2, cpkColor: "#A62929", valence: 1 },
    { z: 36, symbol: "Kr", name: "krypton", mass: 83.798, vdwRadius: 2.02, covalentRadius: 1.16, cpkColor: "#5CB8D1", valence: 0 },
    { z: 37, symbol: "Rb", name: "rubidium", mass: 85.468, vdwRadius: 3.03, covalentRadius: 2.2, cpkColor: "#702EB0", valence: 1 },
    { z: 38, symbol: "Sr", name: "strontium", mass: 87.62, vdwRadius: 2.49, covalentRadius: 1.95, cpkColor: "#00FF00", valence: 2 },
    { z: 39, symbol: "Y", name: "yttrium", mass: 88.906, vdwRadius: 2.32, covalentRadius: 1.9, cpkColor: "#94FFFF", valence: 3 },
    { z: 40, symbol: "Zr", name: "zirconium", mass: 91.224, vdwRadius: 2.23, covalentRadius: 1.75, cpkColor: "#94E0E0", valence: 4 },
    { z: 41, symbol: "Nb", name: "niobium", mass: 92.906, vdwRadius: 2.18, covalentRadius: 1.64, cpkColor: "#73C2C9", valence: 5 },
    { z: 42, symbol: "Mo", name: "molybdenum", mass: 95.95, vdwRadius: 2.17, covalentRadius: 1.54, cpkColor: "#54B5B5", valence: 6 },
    { z: 43, symbol: "Tc", name: "technetium", mass: 98, vdwRadius: 2.16, covalentRadius: 1.47, cpkColor: "#3B9E9E", valence: 7 },
    { z: 44, symbol: "Ru", name: "ruthenium", mass: 101.07, vdwRadius: 2.13, covalentRadius: 1.46, cpkColor: "#248F8F", valence: 8 },
    { z: 45, symbol: "Rh", name: "rhodium", mass: 102.91, vdwRadius: 2.1, covalentRadius: 1.42, cpkColor: "#0A7D8C", valence: 6 },
    { z: 46, symbol: "Pd", name: "palladium", mass: 106.42, vdwRadius: 2.1, covalentRadius: 1.39, cpkColor: "#006985", valence: 4 },
    { z: 47, symbol: "Ag", name: "silver", mass: 107.87, vdwRadius: 2.11, covalentRadius: 1.45, cpkColor: "#C0C0C0", valence: 1 },
    { z: 48, symbol: "Cd", name: "cadmium", mass: 112.41, vdwRadius: 2.18, covalentRadius: 1.44, cpkColor: "#FFD98F", valence: 2 },
    { z: 49, symbol: "In", name: "indium", mass: 114.82, vdwRadius: 2.13, covalentRadius: 1.42, cpkColor: "#A67573", valence: 3 },
    { z: 50, symbol: "Sn", name: "tin", mass: 118.71, vdwRadius: 2.17, covalentRadius: 1.39, cpkColor: "#668080", valence: 4 },
    { z: 51, symbol: "Sb", name: "antimony", mass: 121.76, vdwRadius: 2.06, covalentRadius: 1.39, cpkColor: "#9E63B5", valence: 5 },
    { z: 52, symbol: "Te", name: "tellurium", mass: 127.6, vdwRadius: 2.06, covalentRadius: 1.38, cpkColor: "#D47A00", valence: 6 },
    { z: 53, symbol: "I", name: "iodine", mass: 126.9, vdwRadius: 1.98, covalentRadius: 1.39, cpkColor: "#940094", valence: 1 },
    { z: 54, symbol: "Xe", name: "xenon", mass: 131.29, vdwRadius: 2.16, covalentRadius: 1.4, cpkColor: "#429EB0", valence: 0 },
    { z: 55, symbol: "Cs", name: "caesium", mass: 132.91, vdwRadius: 3.43, covalentRadius: 2.44, cpkColor: "#57178F", valence: 1 },
    { z: 56, symbol: "Ba", name: "barium", mass: 137.33, vdwRadius: 2.68, covalentRadius: 2.15, cpkColor: "#00C900", valence: 2 },
    { z: 57, symbol: "La", name: "lanthanum", mass: 138.91, vdwRadius: 2.43, covalentRadius: 2.07, cpkColor: "#70D4FF", valence: 3 },
    { z: 58, symbol: "Ce", name: "cerium", mass: 140.12, vdwRadius: 2.42, covalentRadius: 2.04, cpkColor: "#FFFFC7", valence: 4 },
    { z: 59, symbol: "Pr", name: "praseodymium", mass: 140.91, vdwRadius: 2.4, covalentRadius: 2.03, cpkColor: "#D9FFC7", valence: 4 },
    { z: 60, symbol: "Nd", name: "neodymium", mass: 144.24, vdwRadius: 2.39, covalentRadius: 2.01, cpkColor: "#C7FFC7", valence: 3 },
    { z: 62, symbol: "Sm", name: "samarium", mass: 150.36, vdwRadius: 2.36, covalentRadius: 1.98, cpkColor: "#A3FFC7", valence: 3 },
    { z: 63, symbol: "Eu", name: "europium", mass: 151.96, vdwRadius: 2.35, covalentRadius: 1.98, cpkColor: "#8FFFC7", valence: 3 },
    { z: 64, symbol: "Gd", name: "gadolinium", mass: 157.25, vdwRadius: 2.34, covalentRadius: 1.96, cpkColor: "#61FFC7", valence: 3 },
    { z: 65, symbol: "Tb", name: "terbium", mass: 158.93, vdwRadius: 2.33, covalentRadius: 1.94, cpkColor: "#45FFC7", valence: 3 },
    { z: 66, symbol: "Dy", name: "dysprosium", mass: 162.5, vdwRadius: 2.31, covalentRadius: 1.92, cpkColor: "#30FFC7", valence: 3 },
    { z: 67, symbol: "Ho", name: "holmium", mass: 164.93, vdwRadius: 2.3, covalentRadius: 1.92, cpkColor: "#1FFFC7", valence: 3 },
    { z: 68, symbol: "Er", name: "erbium", mass: 167.26, vdwRadius: 2.29, covalentRadius: 1.89, cpkColor: "#00FF9C", valence: 3 },
    { z: 69, symbol: "Tm", name: "thulium", mass: 168.93, vdwRadius: 2.27, covalentRadius: 1.9, cpkColor: "#00E675", valence: 3 },
    { z: 70, symbol: "Yb", name: "ytterbium", mass: 173.05, vdwRadius: 2.26, covalentRadius: 1.87, cpkColor: "#00D452", valence: 3 },
    { z: 71, symbol: "Lu", name: "lutetium", mass: 174.97, vdwRadius: 2.24, covalentRadius: 1.87, cpkColor: "#00BF38", valence: 3 },
    { z: 72, symbol: "Hf", name: "hafnium", mass: 178.49, vdwRadius: 2.23, covalentRadius: 1.75, cpkColor: "#4DC2FF", valence: 4 },
    { z: 73, symbol: "Ta", name: "tantalum", mass: 180.95, vdwRadius: 2.22, covalentRadius: 1.7, cpkColor: "#4DA6FF", valence: 5 },
    { z: 74, symbol: "W", name: "tungsten", mass: 183.84, vdwRadius: 2.18, covalentRadius: 1.62, cpkColor: "#2194D6", valence: 6 },
    { z: 75, symbol: "Re", name: "rhenium", mass: 186.21, vdwRadius: 2.16, covalentRadius: 1.51, cpkColor: "#267DAB", valence: 7 },
    { z: 76, symbol: "Os", name: "osmium", mass: 190.23, vdwRadius: 2.16, covalentRadius: 1.44, cpkColor: "#266696", valence: 8 },
    { z: 77, symbol: "Ir", name: "iridium", mass: 192.22, vdwRadius: 2.13, covalentRadius: 1.41, cpkColor: "#175487", valence: 6 },
    { z: 78, symbol: "Pt", name: "platinum", mass: 195.08, vdwRadius: 2.13, covalentRadius: 1.36, cpkColor: "#D0D0E0", valence: 4 },
    { z: 79, symbol: "Au", name: "gold", mass: 196.97, vdwRadius: 2.14, covalentRadius: 1.36, cpkColor: "#FFD123", valence: 5 },
    { z: 80, symbol: "Hg", name: "mercury", mass: 200.59, vdwRadius: 2.23, covalentRadius: 1.32, cpkColor: "#B8B8D0", valence: 2 },
    { z: 81, symbol: "Tl", name: "thallium", mass: 204.38, vdwRadius: 2.22, covalentRadius: 1.45, cpkColor: "#A6544D", valence: 3 },
    { z: 82, symbol: "Pb", name: "lead", mass: 207.2, vdwRadius: 2.2, covalentRadius: 1.46, cpkColor: "#575961", valence: 4 },
    { z: 83, symbol: "Bi", name: "bismuth", mass: 208.98, vdwRadius: 2.13, covalentRadius: 1.48, cpkColor: "#9E4FB5", valence: 5 },
    { z: 84, symbol: "Po", name: "polonium", mass: 209, vdwRadius: 2.14, covalentRadius: 1.4, cpkColor: "#AB5C00", valence: 6 },
    { z: 85, symbol: "At", name: "astatine", mass: 210, vdwRadius: 2.16, covalentRadius: 1.5, cpkColor: "#754F45", valence: 1 },
    { z: 86, symbol: "Rn", name: "radon", mass: 222, vdwRadius: 2.2, covalentRadius: 1.5, cpkColor: "#428296", valence: 0 },
    { z: 87, symbol: "Fr", name: "francium", mass: 223, vdwRadius: 3.48, covalentRadius: 2.6, cpkColor: "#420066", valence: 1 },
    { z: 88, symbol: "Ra", name: "radium", mass: 226, vdwRadius: 2.83, covalentRadius: 2.21, cpkColor: "#007D00", valence: 2 },
    { z: 89, symbol: "Ac", name: "actinium", mass: 227, vdwRadius: 2.47, covalentRadius: 2.15, cpkColor: "#70ABFA", valence: 3 },
    { z: 90, symbol: "Th", name: "thorium", mass: 232.04, vdwRadius: 2.45, covalentRadius: 2.06, cpkColor: "#00BAFF", valence: 4 },
    { z: 91, symbol: "Pa", name: "protactinium", mass: 231.04, vdwRadius: 2.43, covalentRadius: 2.0, cpkColor: "#00A1FF", valence: 5 },
    { z: 92, symbol: "U", name: "uranium", mass: 238.03, vdwRadius: 2.41, covalentRadius: 1.96, cpkColor: "#008FFF", valence: 6 },
    { z: 93, symbol: "Np", name: "neptunium", mass: 237, vdwRadius: 2.39, covalentRadius: 1.9, cpkColor: "#0080FF", valence: 7 },
    { z: 94, symbol: "Pu", name: "plutonium", mass: 244, vdwRadius: 2.38, covalentRadius: 1.87, cpkColor: "#006BFF", valence: 7 },
    { z: 95, symbol: "Am", name: "americium", mass: 243, vdwRadius: 2.37, covalentRadius: 1.8, cpkColor: "#545CF2", valence: 6 },
    { z: 96, symbol: "Cm", name: "curium", mass: 247, vdwRadius: 2.35, covalentRadius: 1.69, cpkColor: "#785CE3", valence: 6 },
    { z: 97, symbol: "Bk", name: "berkelium", mass: 247, vdwRadius: 2.34, covalentRadius: 1.6, cpkColor: "#8A4FE3", valence: 6 },
    { z: 98, symbol: "Cf", name: "californium", mass: 251, vdwRadius: 2.33, covalentRadius: 1.53, cpkColor: "#A136D4", valence: 6 },
    { z: 99, symbol: "Es", name: "einsteinium", mass: 252, vdwRadius: 2.32, covalentRadius: 1.5, cpkColor: "#B31FD4", valence: 6 },
    { z: 100, symbol: "Fm", name: "fermium", mass: 257, vdwRadius: 2.31, covalentRadius: 1.4, cpkColor: "#B31FBA", valence: 6 },
    { z: 101, symbol: "Md", name: "mendelevium", mass: 258, vdwRadius: 2.3, covalentRadius: 1.4, cpkColor: "#B30DA6", valence: 6 },
    { z: 102, symbol: "No", name: "nobelium", mass: 259, vdwRadius: 2.29, covalentRadius: 1.4, cpkColor: "#BD0D87", valence: 6 },
    { z: 103, symbol: "Lr", name: "lawrencium", mass: 266, vdwRadius: 2.28, covalentRadius: 1.4, cpkColor: "#C70066", valence: 6 },
    { z: 104, symbol: "Rf", name: "rutherfordium", mass: 267, vdwRadius: 2.27, covalentRadius: 1.4, cpkColor: "#CC0059", valence: 6 },
    { z: 105, symbol: "Db", name: "dubnium", mass: 268, vdwRadius: 2.26, covalentRadius: 1.4, cpkColor: "#D1004F", valence: 6 },
    { z: 106, symbol: "Sg", name: "seaborgium", mass: 269, vdwRadius: 2.25, covalentRadius: 1.4, cpkColor: "#D90045", valence: 6 },
    { z: 107, symbol: "Bh", name: "bohrium", mass: 270, vdwRadius: 2.24, covalentRadius: 1.4, cpkColor: "#E00038", valence: 6 },
    { z: 108, symbol: "Hs", name: "hassium", mass: 269, vdwRadius: 2.23, covalentRadius: 1.4, cpkColor: "#E6002E", valence: 6 },
    { z: 109, symbol: "Mt", name: "meitnerium", mass: 278, vdwRadius: 2.22, covalentRadius: 1.4, cpkColor: "#EB0026", valence: 6 },
    { z: 110, symbol: "Ds", name: "darmstadtium", mass: 281, vdwRadius: 2.21, covalentRadius: 1.4, cpkColor: "#F00020", valence: 6 },
    { z: 111, symbol: "Rg", name: "roentgenium", mass: 282, vdwRadius: 2.2, covalentRadius: 1.4, cpkColor: "#F20010", valence: 6 },
    { z: 112, symbol: "Cn", name: "copernicium", mass: 285, vdwRadius: 2.19, covalentRadius: 1.4, cpkColor: "#F00000", valence: 6 },
    { z: 113, symbol: "Nh", name: "nihonium", mass: 286, vdwRadius: 2.18, covalentRadius: 1.4, cpkColor: "#E60000", valence: 6 },
    { z: 114, symbol: "Fl", name: "flerovium", mass: 289, vdwRadius: 2.17, covalentRadius: 1.4, cpkColor: "#D90000", valence: 6 },
    { z: 115, symbol: "Mc", name: "moscovium", mass: 290, vdwRadius: 2.16, covalentRadius: 1.4, cpkColor: "#CC0000", valence: 6 },
    { z: 116, symbol: "Lv", name: "livermorium", mass: 293, vdwRadius: 2.15, covalentRadius: 1.4, cpkColor: "#BF0000", valence: 6 },
    { z: 117, symbol: "Ts", name: "tennessine", mass: 294, vdwRadius: 2.14, covalentRadius: 1.4, cpkColor: "#B00000", valence: 6 },
    { z: 118, symbol: "Og", name: "oganesson", mass: 294, vdwRadius: 2.13, covalentRadius: 1.4, cpkColor: "#A00000", valence: 6 },
];

/** 符号 → Z 的查找表（小写归一化）。 */
const SYMBOL_TO_Z: Readonly<Record<string, number>> = (() => {
    const map: Record<string, number> = {};
    for (const el of ELEMENTS)
        if (el.z > 0) map[el.symbol.toLowerCase()] = el.z;
    return map;
})();

/** 按原子序数 Z 查元素信息。Z 越界或 0 返回占位元素。 */
export function elementByZ(z: number): ElementInfo {
    if (!Number.isInteger(z) || z < 0 || z >= ELEMENTS.length)
        return UNKNOWN_ELEMENT;
    const el = ELEMENTS[z];
    return el ?? UNKNOWN_ELEMENT;
}

/** 按符号查元素信息。大小写不敏感；未知符号返回占位元素。 */
export function elementBySymbol(symbol: string): ElementInfo {
    const z = symbolToZ(symbol);
    return z > 0 ? ELEMENTS[z] : UNKNOWN_ELEMENT;
}

/** 符号 → 原子序数。未知符号返回 0。 */
export function symbolToZ(symbol: string): number {
    if (!symbol) return 0;
    const trimmed = symbol.trim().toLowerCase();
    return SYMBOL_TO_Z[trimmed] ?? 0;
}
