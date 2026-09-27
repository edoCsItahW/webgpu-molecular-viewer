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
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { LocaleStorageKey } from "@/types"


export const PROJECT_PREFIX = "MOL-VISTA" as const;

export const MV_LOCALE_KEY: LocaleStorageKey<"locale"> = "MV_LOCALE_KEY";

export function applyProjectPrefix<S extends string>(str: S): `[${typeof PROJECT_PREFIX}] ${S}` {
    return `[${PROJECT_PREFIX}] ${str}`;
}
