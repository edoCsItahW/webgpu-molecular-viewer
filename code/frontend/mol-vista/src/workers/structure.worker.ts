/// <reference lib="webworker" />

/**
 * @file structure.worker.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/10/29
 * @desc 结构解析 Worker：PDB / mmCIF / SDF → MDR（StructureData）。
 *
 *       解析与键感知都在这里完成；所有 TypedArray 走 transfer，主线程零拷贝拿到 SoA。
 * */
import { parseStructureData, type StructureData } from "@wmv/parser";


interface StructureWorkerRequest {
    id: number;
    filename: string;
    /** 文本（SMILES 之外的调用方可能直接传文本） */
    text?: string;
    /** 二进制（File.arrayBuffer 直接转移进来，避免主线程解码） */
    buffer?: ArrayBuffer;
    options?: {perceiveBonds?: boolean; tolerance?: number; maxBondLength?: number};
}

interface StructureWorkerSuccess {
    id: number;
    ok: true;
    result: StructureData;
}

interface StructureWorkerFailure {
    id: number;
    ok: false;
    error: string;
}

type StructureWorkerResponse = StructureWorkerSuccess | StructureWorkerFailure;

const decoder = new TextDecoder();

/** 收集 MDR 里所有 TypedArray 的 buffer，去重后作为 transfer list */
function collectTransferables(data: StructureData): Transferable[] {
    const seen = new Set<ArrayBufferLike>();
    const list: Transferable[] = [];

    const push = (view: ArrayBufferView | undefined | null): void => {
        if (!view) return;
        if (seen.has(view.buffer)) return;

        seen.add(view.buffer);
        list.push(view.buffer as ArrayBuffer);
    };

    push(data.atoms.positions);
    push(data.atoms.element);
    push(data.atoms.residueIndex);
    push(data.atoms.chainIndex);
    push(data.atoms.occupancy);
    push(data.atoms.bFactor);
    push(data.atoms.flags);
    push(data.atoms.charge);

    if (data.bonds) {
        push(data.bonds.a);
        push(data.bonds.b);
        push(data.bonds.order);
    }

    if (data.residues) {
        push(data.residues.seqNumber);
        push(data.residues.chainIndex);
        push(data.residues.start);
        push(data.residues.count);
    }

    if (data.chains) {
        push(data.chains.start);
        push(data.chains.count);
    }

    if (data.ss) push(data.ss);

    return list;
}

self.onmessage = (event: MessageEvent<StructureWorkerRequest>): void => {
    const {id, filename, text, buffer, options} = event.data;

    try {
        const source = text ?? (buffer ? decoder.decode(buffer) : "");

        if (source.length === 0) throw new Error("MsgId: 空的文件内容");

        const result = parseStructureData(source, filename, options ?? {});
        const response: StructureWorkerResponse = {id, ok: true, result};

        (self as unknown as Worker).postMessage(response, collectTransferables(result));
    } catch (error) {
        const response: StructureWorkerResponse = {
            id,
            ok: false,
            error: error instanceof Error ? error.message : String(error)
        };

        (self as unknown as Worker).postMessage(response);
    }
};
