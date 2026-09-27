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
 * @date 2026/09/17
 * @desc 内置 WGSL 着色器的登记入口：把 common 公共片段与三条渲染管线的 shader 一次性注册进 ShaderLibrary
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {ShaderLibrary} from "../../gpu/ShaderLibrary";
import uniformsSource from "./common/uniforms.wgsl?raw";
import reconstructSource from "./common/reconstruct.wgsl?raw";
import pbrSource from "./pbr.wgsl?raw";
import pickingSource from "./picking.wgsl?raw";
import ssaoSource from "./ssao.wgsl?raw";


/**
 * 把内置着色器注册进 ShaderLibrary。
 *
 * 注册名就是 WGSL 里 `#include "..."` 解析时使用的键，两边必须完全一致
 * （`#include` 在 compile 时才展开，所以 5 份源码要先全部登记再编译）：
 *   - `common/uniforms`    —— SceneUniforms / ObjectUniforms 结构体的单一真值
 *   - `common/reconstruct` —— reconstructViewPos，仅 SSAO 引用
 *   - `pbr` / `picking` / `ssao` —— 三条管线的入口 shader（entryPoint 均为 vs_main / fs_main）
 *
 * 重复调用会覆盖同名条目并清空编译缓存。
 *
 * @param shaders 目标着色器库，通常是 Renderer 的 `renderer.shaders`
 */
export function registerBuiltinShaders(shaders: ShaderLibrary): void {
    shaders.registerMany({
        "common/uniforms": uniformsSource,
        "common/reconstruct": reconstructSource,
        "pbr": pbrSource,
        "picking": pickingSource,
        "ssao": ssaoSource,
    });
}
