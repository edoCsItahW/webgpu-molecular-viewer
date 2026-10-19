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
 * @date 2026/09/17 20:32
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import {createI18n, type I18nOptions} from "vue-i18n";
import { getConfig, load } from "..";
import type { MessageSchema } from "../types";


export default async function createI18nInstance() {
    const config = getConfig();

    const defaultMessages = await load(config.defaultLanguage);

    const options: I18nOptions = {
        legacy: false,
        locale: config.defaultLanguage,
        fallbackLocale: config.fallbackLocale,
        messages: {
            [config.defaultLanguage]: defaultMessages as unknown as MessageSchema
        },
        datetimeFormats: config.datetimeFormats as I18nOptions['datetimeFormats'],
        numberFormats: config.numberFormats as I18nOptions['numberFormats'],
        missingWarn: import.meta.env.DEV,
        fallbackWarn: import.meta.env.DEV,
        silentTranslationWarn: import.meta.env.DEV
    };

    return createI18n(options);
}
