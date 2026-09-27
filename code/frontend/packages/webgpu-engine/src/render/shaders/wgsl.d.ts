// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file wgsl.d.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17
 * @desc 为 WGSL 着色器源码的导入声明模块类型，本包不依赖 vite 类型，缺了它 tsc 会报 TS2307
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/**
 * 带 `?raw` 后缀的 WGSL 导入。
 *
 * 打包器（如 Vite）的 `?raw` 查询会把文件内容原样作为字符串返回，而不是当作模块执行。
 * 本包的类型声明不包含 `vite/client`，所以必须在这里自行声明，否则
 * `import source from "./pbr.wgsl?raw"` 会因找不到模块而报 TS2307。
 */
declare module "*.wgsl?raw" {
    /** WGSL 源码全文 */
    const source: string;

    export default source;
}

/**
 * 不带后缀的 WGSL 导入，语义与 `?raw` 相同（本仓库只把 WGSL 当作字符串资源使用）。
 */
declare module "*.wgsl" {
    /** WGSL 源码全文 */
    const source: string;

    export default source;
}
