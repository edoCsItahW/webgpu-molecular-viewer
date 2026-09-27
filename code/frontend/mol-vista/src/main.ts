// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file main.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/14 15:12
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import '@/assets/styles/index.sass';
import createI18nInstance from '@/utils/locales/i18n';
import { createPinia } from 'pinia';
import { createApp } from 'vue';

import router from './router';
import App from './App.vue';

// 应用启动前的全局副作用：把 <html data-theme> 设为初始主题。
// 主题令牌已通过 _theme.sass 挂载，这里只决定初始值。
// 后续 MV-ThemeSwitcher 会读写这个属性并监听 prefers-color-scheme。
document.documentElement.setAttribute('data-theme', 'dark');

const app = createApp(App);

app.use(createPinia());
app.use(await createI18nInstance())
app.use(router);

app.mount('#app');
