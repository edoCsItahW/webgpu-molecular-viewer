// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file NullGeometryPort.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 几何构建端口的空实现：surface=false，卡通=false。首版无几何模块时使用。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

import type {GeometryBuildPort, SurfaceOptions, SurfaceMesh} from "../../ports";
import type {StructureData} from "@wmv/structure";
import {PortError} from "@wmv/common";

/**
 * 空几何端口：capabilities 返回 surface=false, cartoon=false。
 * 调用 buildSurface 会抛 unsupported-format（能力缺失）。
 */
export class NullGeometryPort implements GeometryBuildPort {
    capabilities() {
        return { surface: false, cartoon: false };
    }

    async buildSurface(
        _data: StructureData,
        _options: SurfaceOptions,
        _signal?: AbortSignal,
    ): Promise<SurfaceMesh> {
        throw new PortError("unsupported-format", "未启用几何模块（surface 不可用）");
    }
}
