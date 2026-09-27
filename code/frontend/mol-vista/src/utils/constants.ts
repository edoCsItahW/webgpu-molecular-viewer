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
 * @date 2026/09/17 20:51
 * @desc 全局常量、InjectionKey 集中定义。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { InjectionKey, Ref } from "vue";
import type { LocaleStorageKey } from "@/types"


export const PROJECT_PREFIX = "MOL-VISTA" as const;

export const MV_LOCALE_KEY: LocaleStorageKey<"locale"> = "MV_LOCALE_KEY";

export function applyProjectPrefix<S extends string>(str: S): `[${typeof PROJECT_PREFIX}] ${S}` {
    return `[${PROJECT_PREFIX}] ${str}`;
}

/**
 * 引擎上下文。由 MV-EngineViewport provide，供子组件注入。
 * 仅承载 Vue 友好的响应式引用（ui.md §六：GPU 对象本身绝不上 Pinia）。
 * */
export interface EngineContext {
    /** 引擎是否已就绪。false 时视口应渲染静态占位 */
    ready: Ref<boolean>;
}

export const ENGINE_KEY: InjectionKey<EngineContext> = Symbol("MV_ENGINE");
