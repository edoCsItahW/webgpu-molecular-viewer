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
 * @date 2026/09/17 20:37
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type {LocaleConfig, LocaleMessage, LanguageInfo} from "./types";
import {ErrorWithPrefix} from "@/utils/exception/errors.ts";
import {Console} from "@/utils/exception/debug.ts";
import config from "./config.json";


export function getConfig(): LocaleConfig {
    return config as unknown as LocaleConfig;
}



export function getLanguages(): LanguageInfo[] {
    return getConfig().availableLanguages.filter(l => l.enabled);
}


export function getDefaultLanguage() {
    return getConfig().defaultLanguage;
}


export async function load(code: string): Promise<LocaleMessage> {
    try {
        const languageInfo = getConfig().availableLanguages.find(l => l.code === code);

        if (!languageInfo || !languageInfo.enabled)
            throw new ErrorWithPrefix(`Language ${code} is not enabled.`);

        return (await import(`./languages/${code}.ts`)).default;
    } catch (err) {
        Console.error(`Failed to load locale: ${code}`, err);

        const fallback = getConfig().availableLanguages.find(l => l.fallback);

        if (fallback && fallback.code !== code)
            return load(fallback.code);

        return (await import(`./languages/${getDefaultLanguage()}.ts`)).default;
    }
}
