// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file locale.store.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 13:03
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { getDefaultLanguage, getLanguages, getConfig, load } from "@/utils/locales";
import type {MessageSchema} from "@/utils/locales/types.ts";
import type {ParamsForPath, Paths} from "@wmv/common";
import { MV_LOCALE_KEY } from '@/utils/constants';
import { ref, computed } from 'vue';
import {defineStore} from 'pinia';
import {useI18n} from "vue-i18n";


type LocaleCode = string;

type TArgs<P extends string> = ParamsForPath<MessageSchema, P> extends undefined ? [] : [params: ParamsForPath<MessageSchema, P>];

export type TypedT = <P extends Paths<MessageSchema>>(key: P, ...args: TArgs<P>) => string;

export const useLocaleStore = defineStore('locale', () => {
    const i18n = (() => {
        const res = useI18n();

        return {...res, t: res.t as unknown as TypedT};
    })();

    const locale = ref<LocaleCode>(localStorage.getItem(MV_LOCALE_KEY) || getDefaultLanguage());

    const manualLocale = ref<LocaleCode>("");

    /* getters */
    const languages = computed(() => getLanguages().filter(lang => lang.enabled));

    const defaultLanguage = computed(getDefaultLanguage);

    const config = computed(getConfig);

    /* methods */
    const set = async (code: LocaleCode) => {
        // 原有 set 逻辑不变
        const messages = await load(code);

        i18n.locale.value = code;
        i18n.setLocaleMessage(code, messages);

        locale.value = code;

        localStorage.setItem(MV_LOCALE_KEY, code);
        document.documentElement.lang = code;

        const dir = getLanguages().filter(l => l.code === code)[0]?.dir;

        if (dir) document.documentElement.dir = dir;

        return true;
    };

    const setManualLocale = (code: LocaleCode) => {
        manualLocale.value = code;
    };

    const detectBrowserLanguage = () => {
        const browserLang =
            navigator.language || (navigator as typeof navigator & { userLanguage: string }).userLanguage;

        const languageCodes = languages.value.map(l => l.code);

        if (languageCodes.includes(browserLang)) return browserLang;

        const baseLanguage = browserLang.split("-")[0] as string;
        const matchedLanguage = languageCodes.find(c => c.startsWith(baseLanguage));

        return matchedLanguage || defaultLanguage.value;
    };

    const init = async () => {
        if (config.value.autoDetect)
            await set(detectBrowserLanguage());

        else
            await set(locale.value);
    }

    const toggleLanguage = async (code?: string): Promise<boolean> => {
        // 如果直接传入了 code，则切换并记录（可扩展，目前组件调用无参数）
        if (code) {
            await set(code);

            setManualLocale(code);

            return true;
        }

        // 优先使用手动记忆的目标语言
        if (manualLocale.value && manualLocale.value !== locale.value) {
            const oldLocale = locale.value;

            await set(manualLocale.value);

            manualLocale.value = oldLocale;

            return true;
        }

        const recommended = detectBrowserLanguage();

        if (recommended !== locale.value) {
            await set(recommended);

            manualLocale.value = "";

            return true;
        }

        return false;
    };

    return {
        locale,
        manualLocale,
        languages,
        defaultLanguage,
        config,
        set,
        setManualLocale,
        detectBrowserLanguage,
        init,
        toggleLanguage,
    };

});

