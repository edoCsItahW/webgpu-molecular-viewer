// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file types.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/18 13:00
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import zhHans from "@/utils/locales/languages/zh-Hans.ts";


export interface LocaleMessage {
    [key: string]: string | LocaleMessage;
}

export interface LanguageInfo {
    code: string;
    name: string;
    nativeName: string;
    flag: string;
    dir: "ltr" | "rtl";
    dateFormat: string;
    timeFormat: string;
    currency: string;
    enabled: boolean;
    fallback: boolean;
}

export interface LocaleConfig {
    availableLanguages: LanguageInfo[];
    defaultLanguage: string;
    storageKey: string;
    autoDetect: boolean;
    fallbackLocale: string;
    pluralizationRules: Record<string, unknown>;
    numberFormats: Record<string, unknown>;
    datetimeFormats: Record<string, unknown>;
}


export type MessageSchema = typeof zhHans;

declare module "vue-i18n" {
    export interface DefineLocaleMessage extends MessageSchema {}
}
