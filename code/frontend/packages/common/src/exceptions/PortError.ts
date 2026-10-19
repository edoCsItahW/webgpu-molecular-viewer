// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file PortError.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 00:00
 * @desc 端口错误的唯一形状：适配器把 HTTP/pybind/WASM 异常翻译成它，不许透传原始错误。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */

/** 端口错误种类。 */
export type PortErrorKind =
    | "malformed"            // 输入数据畸形，不可重试
    | "unsupported-format"   // 格式不支持
    | "version-mismatch"     // MDR 主版本不匹配
    | "too-large"            // 规模超限
    | "backend-unavailable"  // 后端不可用（404 / 地址错）
    | "backend-error"        // 后端内部错误（500/502/503）
    | "network"              // 网络错误
    | "timeout"              // 超时
    | "cancelled"            // 用户取消（AbortSignal）
    | "unknown";             // 未分类

/**
 * 端口错误。
 * 适配器负责把底层异常翻译成此形状；UI 只认 kind + retryable，不碰原始错误对象。
 */
export class PortError extends Error {
    readonly kind: PortErrorKind;
    readonly retryable: boolean;
    readonly detail?: string;

    constructor(kind: PortErrorKind, detail?: string, retryable?: boolean) {
        super(`MsgId: PortError(${kind})${detail ? `: ${detail}` : ""}`);
        this.name = "PortError";
        this.kind = kind;
        this.detail = detail;
        this.retryable = retryable ?? defaultRetryable(kind);
    }
}

/** 默认重试策略：仅网络/超时/503 类错误可重试。 */
function defaultRetryable(kind: PortErrorKind): boolean {
    return kind === "network" || kind === "timeout" || kind === "backend-error";
}

/** 判断一个错误是否是 PortError。 */
export function isPortError(e: unknown): e is PortError {
    return e instanceof PortError;
}
