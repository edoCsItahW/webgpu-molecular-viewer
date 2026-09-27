// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file errors.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/17 20:56
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import { applyProjectPrefix } from "@/utils/constants.ts";


export class ErrorWithPrefix extends Error {
    constructor(message: string) {
        super(applyProjectPrefix(message));
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
