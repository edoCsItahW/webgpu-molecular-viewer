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
import * as process from "node:process";
import { getConfig, load } from "..";


export default async function createI18nInstance() {
    const config = getConfig();

    const defaultMessages = await load(config.defaultLanguage);

    return createI18n({
        legacy: false,
        locale: config.defaultLanguage,
        fallbackLocale: config.fallbackLocale,
        messages: {
            [config.defaultLanguage]: defaultMessages
        },
        datetimeFormats: config.datetimeFormats as I18nOptions['datetimeFormats'],
        numberFormats: config.numberFormats as I18nOptions['numberFormats'],
        pluralizationRules: config.pluralizationRules,
        missingWarn: process.env?.NODE_ENV !== "production",
        fallbackWarn: process.env?.NODE_ENV !== "production",
        silentTranslationWarn: process.env?.NODE_ENV !== "production"
    });
}
