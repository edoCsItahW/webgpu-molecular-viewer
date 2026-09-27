// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file debug.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/18 12:30
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { applyProjectPrefix } from "../constants";


export enum DebugLevel {
    INFO,
    WARNING,
    ERROR
}

export class Console {
    static output(level: DebugLevel, ...args: any[]) {
        ({
            [DebugLevel.INFO]: console.log,
            [DebugLevel.WARNING]: console.warn,
            [DebugLevel.ERROR]: console.error
        })[level](applyProjectPrefix(""), ...args);
    }

    static info(...args: Parameters<typeof console.log>) {
        return Console.output(DebugLevel.INFO, ...args);
    }

    static warning(...args: Parameters<typeof console.warn>) {
        return Console.output(DebugLevel.WARNING, ...args);
    }

    static error(...args: Parameters<typeof console.error>) {
        return Console.output(DebugLevel.ERROR, ...args);
    }
}