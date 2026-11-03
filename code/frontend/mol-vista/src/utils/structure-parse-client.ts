// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file structure-parse-client.ts
 * @author edocsitahw
 * @version 1.0
 * @date 2026/10/29
 * @desc 解析 Worker 客户端：单例 Worker + 请求 id 复用；Worker 不可用时退回主线程动态 import。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
import type { ParseOptions } from "@wmv/parser";
import type { StructureData } from "@wmv/structure";


interface PendingRequest {
    resolve: (value: StructureData) => void;
    reject: (reason: unknown) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let sequence = 0;

const pending = new Map<number, PendingRequest>();

function ensureWorker(): Worker | null {
    if (workerBroken) return null;
    if (worker) return worker;

    try {
        const created = new Worker(
            new URL("../workers/structure.worker.ts", import.meta.url),
            {type: "module"}
        );

        created.onmessage = (event: MessageEvent): void => {
            const data = event.data as {
                id: number;
                ok: boolean;
                result?: StructureData;
                error?: string;
            };

            const request = pending.get(data.id);
            if (!request) return;

            pending.delete(data.id);

            if (data.ok && data.result) request.resolve(data.result);
            else request.reject(new Error(data.error ?? "MsgId: 结构解析失败"));
        };

        created.onerror = (event): void => {
            workerBroken = true;

            const error = new Error(`MsgId: 结构解析 Worker 失败：${event.message}`);

            for (const request of pending.values()) request.reject(error);

            pending.clear();
        };

        worker = created;

        return worker;
    } catch {
        workerBroken = true;

        return null;
    }
}

async function parseOnMainThread(
    input: string | ArrayBuffer,
    filename: string,
    options: ParseOptions
): Promise<StructureData> {
    const {parseStructureData} = await import("@wmv/parser");
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);

    return parseStructureData(text, filename, options);
}

/**
 * 解析 PDB / mmCIF。
 *
 * @param input 文本或 ArrayBuffer（ArrayBuffer 会被转移进 Worker，避免主线程解码）
 * @param filename 文件名（格式推断与命名）
 * @param options 解析选项
 */
export function parseStructureAsync(
    input: string | ArrayBuffer,
    filename: string,
    options: ParseOptions = {}
): Promise<StructureData> {
    const target = ensureWorker();

    if (!target) return parseOnMainThread(input, filename, options);

    return new Promise<StructureData>((resolve, reject) => {
        const id = ++sequence;

        pending.set(id, {resolve, reject});

        try {
            if (typeof input === "string") {
                target.postMessage({id, filename, text: input, options});
            } else {
                target.postMessage({id, filename, buffer: input, options}, [input]);
            }
        } catch (error) {
            pending.delete(id);
            reject(error);
        }
    });
}

/** 终止 Worker（测试 / 热更新用） */
export function terminateStructureWorker(): void {
    worker?.terminate();
    worker = null;
    workerBroken = false;
    pending.clear();
}

