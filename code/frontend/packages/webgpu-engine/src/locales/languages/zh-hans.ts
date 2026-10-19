// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file zh-hans.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/29 22:21
 * @desc webgpu-engine 中文（简体）语言包
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
export default {
    BindGroupCache: {
        getOrCreate: {
            info_1: "创建BindGroup ({signature}) ，entries={length}"
        },
        invalidate: {
            info_1: "清除BindGroup ({signature})"
        },
        dispose: {
            warning_1: "dispose，共释放 {size} 个BindGroup",
            info_1: "- {sig}"
        },
        assertAlive: {
            error_1: "已销毁，无法继续创建bindGroup"
        }
    },

    GPUContext: {
        create: {
            error_1: "当前浏览器不支持 WebGPU",
            error_2: "无法获取 GPU 设备（可能硬件设备不支持/驱动不支持）",
            error_3: "GPU 未捕获错误",
            error_4: "GPU 设备丢失",
            error_5: "无法获取 WebGPU 上下文"
        },
        getDepthView: {
            error_1: "深度纹理尚未创建"
        },
        syncSize: {
            warning_1: "canvas 物理尺寸 {w}x{h} 超过设备上限 {limit}，已夹住。请检查 canvas 的 CSS 尺寸是否依赖自身 width/height 属性（会形成自我放大的反馈）。"
        },
        assertAlive: {
            error_1: "已经销毁，无法获取附着纹理"
        }
    },

    ResourceManager: {
        disposeAll: {
            warning_1: "资源泄漏，未销毁的资源数量：{size}",
            warning_2: "未销毁的资源 {label}"
        },
        destroy: {
            warning_1: "尝试销毁未跟踪的资源 {resource}"
        },
        assertAlive: {
            error_1: "已经销毁，无法创建资源"
        }
    },

    PipelineManager: {
        getBindGroupLayouts: {
            info_1: "创建BindGroupLayout: {key}"
        },
        getPipelineLayout: {
            info_1: "创建PipelineLayout: {key}"
        },
        getRenderPipeline: {
            info_1: "创建RenderPipeline: {key} ({duration}ms)"
        },
        getRenderPipelineAsync: {
            info_1: "异步创建RenderPipeline: {key}"
        },
        getComputePipeline: {
            info_1: "创建ComputePipeline: {key} ({duration}ms)"
        },
        getComputePipelineAsync: {
            info_1: "异步创建ComputePipeline: {key}"
        },
        dispose: {
            info_1: "dispose，共释放 {size} 条缓存",
            info_2: "- {key}"
        },
        assertAlive: {
            error_1: "已经销毁，无法继续创建管线"
        }
    },

    PassManager: {
        add: {
            error_1: "pass名字重复: {name}"
        },
        execute: {
            error_1: "pass执行错误: {name}",
            info_1: "pass {name} 执行耗时: {time}ms"
        },
        dispose: {
            warning_1: "dispose，释放 {size} 张中间纹理"
        },
        getSortedPasses: {
            error_1: 'pass "{name}" 依赖了不存在的 pass "{dep}"',
            error_2: "依赖循环: {cycle}"
        },
        getTexture: {
            error_1: "未找到中间纹理: {name}"
        },
        getTextureRaw: {
            error_1: "未找到中间纹理: {name}"
        },
        assertAlive: {
            error_1: "PassManager 已经销毁"
        }
    },

    ShaderLibrary: {
        preprocess: {
            error_1: "未注册的shader: {name}"
        },
        compileAndGet: {
            error_1: "编译缓存异常: {cacheKey}"
        },
        expand: {
            error_1: "#include 嵌套过深: {chain}",
            error_2: "#include 循环引用: {chain}",
            error_3: '"{fromName}:{fromLine}" 引用了未注册的shader: "{name}"',
            error_4: "{name}:{line} 多余的 #else",
            error_5: "{name}:{line} 多余的 #endif",
            error_6: "{name} 存在未闭合的 #ifdef / #ifndef"
        },
        logCompilationInfo: {
            error_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}",
            warning_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}",
            info_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}"
        },
        assertAlive: {
            error_1: "已销毁"
        }
    },

    StorageBuffer: {
        constructor: {
            error_1: "storage buffer 的 itemCount 必须 >= 0，实际为 {itemCount}",
            error_2: "storage buffer 的 stride 必须是正的 4 的倍数，实际为 {stride}"
        },
        upload: {
            error_1: "上传数据过大：{dataByteLength} > {byteLength}"
        },
        uploadAt: {
            error_1: "offset 必须是 4 的倍数，实际为 {offset}",
            error_2: "局部上传越界：{offset} + {dataByteLength} > {byteLength}"
        },
        uploadElement: {
            error_1: "元素索引越界：{index} 不在 [0, {itemCount})",
            error_2: "元素大小不匹配：{dataByteLength} vs stride {stride}"
        },
        readback: {
            error_1: "上一次 readback 尚未完成，请 await 后再调用"
        },
        assertAlive: {
            error_1: 'storage buffer "{label}" 已经销毁'
        }
    },

    ComputeContext: {
        constructor: {
            warning_1: "请求了 GPU 时间戳查询，但 device 未启用 'timestamp-query' feature，计时功能已禁用。"
        },
        workgroupCount: {
            error_1: "workgroupSize 必须大于 0，实际为 {size}",
            error_2: "workgroup 数量超出限制：{count} > {maxPerDim}（itemCount={itemCount}, size={size}）"
        },
        dispatch3D: {
            error_1: "dispatch3D 的 workgroup 维度超出限制 {max}: [{x}, {y}, {z}]"
        },
        beginTiming: {
            warning_1: "计时槽位已满（{maxTimings}），忽略计时段: {label}。请增大 maxTimings"
        },
        endTiming: {
            warning_1: "endTiming 调用时没有对应的 beginTiming"
        },
        readTimings: {
            warning_1: "上一次 readTimings 尚未完成，本次跳过",
            error_1: "读取时间戳失败"
        },
        createTimingResources: {
            warning_1: "创建时间戳资源失败，计时功能已禁用"
        },
        writeTimestamp: {
            warning_1: "当前实现的 GPUCommandEncoder 没有 writeTimestamp，计时功能已禁用"
        },
        assertAlive: {
            error_1: "ComputeContext 已经销毁"
        }
    },

    ComputePass: {
        constructor: {
            error_1: "ComputePass 的 name 不能为空"
        },
        setBindGroup: {
            error_1: 'ComputePass "{name}" 的 bindGroup index 必须是非负整数，实际为 {index}'
        },
        executeIndirect: {
            error_1: 'ComputePass "{name}" 的 indirectOffset 必须 4 字节对齐，实际为 {indirectOffset}'
        },
        validateBindings: {
            error_1: 'ComputePass "{name}" 未设置任何 bindgroup，请先调用 setBindGroup(0, ...)',
            error_2: 'ComputePass "{name}" 的 bindgroup 槽位不连续：槽位 {i} 缺失（最大槽位 {lastSlot}）'
        },
        assertAlive: {
            error_1: 'ComputePass "{name}" 已经销毁'
        }
    },

    PingPongBuffer: {
        assertAlive: {
            error_1: "PingPongBuffer 已经销毁，无法操作双缓冲"
        }
    },

    Geometry: {
        constructor: {
            error_1: "positions 与 normals 数量不匹配: {positionsLength} vs {normalsLength}"
        },
        assertAlive: {
            error_1: "几何体已经销毁，无法上传"
        }
    },

    Mesh: {
        assertAlive: {
            error_1: "Mesh 已经销毁"
        }
    },

    OrbitCamera: {
        assertAlive: {
            error_1: "OrbitCamera 已经销毁"
        }
    },

    Renderer: {
        step: {
            error_1: "step() 时 scene 为空"
        },
        ensurePasses: {
            error_1: "渲染前必须先把 GPU 交给 Scene（new Scene({gpu, rm}) 或 scene.attachGpu(gpu, rm)）"
        },
        assertAlive: {
            error_1: "已经销毁，无法继续渲染"
        }
    },

    Scene: {
        add: {
            error_1: "对象已存在于场景中: {name}"
        },
        assertAlive: {
            error_1: "Scene 已经销毁"
        }
    },

    SSAOPass: {
        constructor: {
            error_1: "SSAOPass 构造时 Scene 尚未 attachGpu 或 sceneUniformBuffer 未创建"
        },
        sceneUniformBuffer: {
            error_1: "SSAOPass 拿不到 scene uniform buffer，Scene 尚未 attachGpu"
        }
    },

    PBRPass: {
        constructor: {
            error_1: "PBRPass 构造时 Scene 尚未 attachGpu 或 sceneUniformBuffer 未创建"
        }
    },

    PickingPass: {
        constructor: {
            error_1: "PickingPass 构造时 Scene 尚未 attachGpu 或 sceneUniformBuffer 未创建"
        },
        readback: {
            error_1: "拾取回读失败: {err}"
        }
    }
};
