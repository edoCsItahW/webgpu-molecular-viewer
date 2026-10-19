// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file ShaderLibrary.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/16 11:50
 * @desc
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { GPUContext } from "./GPUContext";
import { Console, type Optional } from "@wmv/common";
import { t } from "../locales";


export interface ShaderCompileOptions {
    /**
     * 预处理时注入的宏。
     * 例：{ SAMPLE_COUNT: 4, USE_PICKING: 1 }
     */
    defines?: Record<string, string | number | boolean>;

    /**
     * 用于 debug 的标签前缀，会拼到 GPUShaderModule 的 label 上。
     */
    label?: string;

    /**
     * 是否跳过缓存，强制重新编译。
     * 默认 false。改 shader 源码后调 clearCache 更省事。
     */
    forceRecompile?: boolean;
}

export interface CompiledShader {
    /** 用于 debug 的名字 */
    name: string;

    /** 已编译的 GPUShaderModule */
    module: GPUShaderModule;

    /** 展开后的 WGSL 源码（去掉了 include / define 指令） */
    expandedSource: string;

    /** 缓存 key（name + defines 的稳定序列化） */
    cacheKey: string;
}

/** 用于 #include 展开时的循环检测栈 */
interface ExpandFrame {
    name: string;
    line: number;
}

export interface ShaderLibraryOptions {
    verbose?: boolean;
}

export class ShaderLibrary {
    #disposed = false;

    private sources: Map<string, string> = new Map();

    private cache: Map<string, CompiledShader> = new Map();
    private expandedCache: Map<string, string> = new Map();

    private verbose = false;

    constructor(public readonly gpu: GPUContext, private readonly opts: ShaderLibraryOptions = { verbose: false }) {
        this.verbose = opts.verbose ?? false;
    }

    get disposed(): boolean {
        return this.#disposed;
    }

    dispose(): void {
        if (this.#disposed) return;

        this.sources.clear();
        this.cache.clear();
        this.expandedCache.clear();
        this.#disposed = true;
    }

    register(name: string, source: string): this {
        this.assertAlive();

        this.sources.set(name, source);
        this.clearCache();
        return this;
    }

    registerMany(sources: Record<string, string>): this {
        this.assertAlive();

        for (const [name, source] of Object.entries(sources))
            this.register(name, source);

        this.clearCache();
        return this;
    }

    unregister(name: string): void {
        this.sources.delete(name);
    }

    has(name: string): boolean {
        return this.sources.has(name);
    }

    get(name: string): Optional<string> {
        return this.sources.get(name);
    }

    listNames(): string[] {
        return [...this.sources.keys()];
    }

    compile(name: string, options: ShaderCompileOptions = {}): GPUShaderModule {
        this.assertAlive();

        const defines = this.normalizeDefines(options.defines);
        const cacheKey = this.makeCacheKey(name, defines);

        if (!options.forceRecompile) {
            const hit = this.cache.get(cacheKey);
            if (hit) return hit.module;
        }

        const expandedSource = this.preprocess(name, defines);

        const module = this.gpu.device.createShaderModule({
            code: expandedSource,
            label: options.label ?? `shader:${name}`
        });

        this.cache.set(cacheKey, {
            name,
            module,
            expandedSource,
            cacheKey
        });

        this.expandedCache.set(cacheKey, expandedSource);

        if (this.verbose)
            this.logCompilationInfo(name, module);

        return module;
    }

    preprocess(name: string, defines: Record<string, string> = {}): string {
        const source = this.sources.get(name);

        if (!source)
            throw new Error(t("ShaderLibrary.preprocess.error_1", { name }));

        const stack: ExpandFrame[] = [{ name, line: 0 }];

        return this.expand(name, defines, stack);
    }

    compileAndGet(name: string, options: ShaderCompileOptions = {}): CompiledShader {
        this.compile(name, options);

        const cacheKey = this.makeCacheKey(name, this.normalizeDefines(options.defines));
        const hit = this.cache.get(cacheKey);

        if (!hit)
            throw new Error(t("ShaderLibrary.compileAndGet.error_1", { cacheKey }));

        return hit;
    }

    async validate(name: string, options: ShaderCompileOptions = {}): Promise<GPUCompilationInfo> {
        return await this.compile(name, options).getCompilationInfo();
    }

    clearCache(): void {
        this.cache.clear();
        this.expandedCache.clear();
    }

    get cacheSize(): number {
        return this.cache.size;
    }

    private expand(name: string, defines: Record<string, string>, stack: ExpandFrame[]): string {
        if (stack.length > 16) {
            const chain = stack.map(f => f.name).join(' -> ');

            throw new Error(t("ShaderLibrary.expand.error_1", { chain }));
        }

        if (stack.some(f => f.name === name && f !== stack[stack.length - 1])) {
            const chain = [...stack.map(f => f.name), name].join(' -> ');

            throw new Error(t("ShaderLibrary.expand.error_2", { chain }));
        }

        const source = this.sources.get(name);

        if (!source) {
            const from = stack[stack.length - 1];

            throw new Error(t("ShaderLibrary.expand.error_3", { fromName: from.name, fromLine: from.line, name }));
        }

        const lines = source.split(/\r?\n/);
        const out: string[] = [];

        const localMacros: Record<string, string> = {...defines};

        const condStack: boolean[] = [];

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            const enabled = condStack.every(Boolean);

            const includeMatch = /^#include\s+["']([^"']+)["']\s*$/.exec(trimmed);
            if (includeMatch) {
                if (enabled) {
                    stack.push({name, line: i + 1});

                    const inlined = this.expand(includeMatch[1], localMacros, stack);

                    stack.pop();

                    out.push(inlined);
                }

                continue;
            }

            const defineMatch = /^#define\s+([A-Za-z_]\w*)(?:\s+(.*))?$/.exec(trimmed);
            if (defineMatch) {
                if (enabled)
                    localMacros[defineMatch[1]] = defineMatch[2] ?? '1';

                continue;
            }

            const ifdefMatch = /^#ifdef\s+([A-Za-z_]\w*)\s*$/.exec(trimmed);
            if (ifdefMatch) {
                condStack.push(enabled && ifdefMatch[1] in localMacros);

                continue;
            }

            const ifndefMatch = /^#ifndef\s+([A-Za-z_]\w*)\s*$/.exec(trimmed);
            if (ifndefMatch) {
                condStack.push(enabled && !(ifndefMatch[1] in localMacros));

                continue;
            }

            if (trimmed === '#else') {
                if (condStack.length === 0)
                    throw new Error(t("ShaderLibrary.expand.error_4", { name, line: i + 1 }));

                const outerEnabled = condStack.slice(0, -1).every(Boolean);

                condStack[condStack.length - 1] = outerEnabled && !condStack[condStack.length - 1];

                continue;
            }

            if (trimmed === '#endif') {
                if (condStack.length === 0)
                    throw new Error(t("ShaderLibrary.expand.error_5", { name, line: i + 1 }));

                condStack.pop();

                continue;
            }

            if (!enabled) continue;

            out.push(this.applyMacros(rawLine, localMacros));
        }

        if (condStack.length !== 0)
            throw new Error(t("ShaderLibrary.expand.error_6", { name }));

        return out.join('\n');
    }

    private applyMacros(line: string, macros: Record<string, string>): string {
        if (Object.keys(macros).length === 0) return line;

        return line.replace(/\b[A-Za-z_]\w*\b/g, token =>
            Object.prototype.hasOwnProperty.call(macros, token) ? macros[token] : token
        );
    }

    private normalizeDefines(defines?: Record<string, string | number | boolean>): Record<string, string> {
        if (!defines) return {};

        const out: Record<string, string> = {};

        for (const key of Object.keys(defines).sort())
            out[key] = typeof defines[key] === "string" ? defines[key] : String(defines[key]);

        return out;
    }

    private makeCacheKey(name: string, defines: Record<string, string>): string {
        const keys = Object.keys(defines);

        if (keys.length === 0) return name;

        return `${name}::${keys.map(k => `${k}=${defines[k]}`).join(',')}`;
    }

    private logCompilationInfo(name: string, module: GPUShaderModule): void {
        module.getCompilationInfo().then(info => {
            for (const msg of info.messages) {
                const params = { name, type: msg.type, lineNum: msg.lineNum, linePos: msg.linePos, message: msg.message };

                if (msg.type === "error") Console.error(t("ShaderLibrary.logCompilationInfo.error_1", params));
                else if (msg.type === "warning") Console.warning(t("ShaderLibrary.logCompilationInfo.warning_1", params));
                else Console.info(t("ShaderLibrary.logCompilationInfo.info_1", params));
            }
        });
    }

    private assertAlive(): void {
        if (this.#disposed)
            throw new Error(t("ShaderLibrary.assertAlive.error_1"));
    }
}
