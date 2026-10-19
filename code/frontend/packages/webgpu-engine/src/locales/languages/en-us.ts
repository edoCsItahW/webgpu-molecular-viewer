// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file en-us.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/29 22:22
 * @desc webgpu-engine English (US) locale
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
export default {
    BindGroupCache: {
        getOrCreate: {
            info_1: "Create BindGroup ({signature}), entries={length}"
        },
        invalidate: {
            info_1: "Invalidate BindGroup ({signature})"
        },
        dispose: {
            warning_1: "dispose: releasing {size} BindGroup(s)",
            info_1: "- {sig}"
        },
        assertAlive: {
            error_1: "Disposed, cannot create bindGroup"
        }
    },

    GPUContext: {
        create: {
            error_1: "WebGPU is not supported in this browser",
            error_2: "Failed to get GPU device (hardware/driver may not be supported)",
            error_3: "GPU uncaptured error",
            error_4: "GPU device lost",
            error_5: "Failed to get WebGPU context"
        },
        getDepthView: {
            error_1: "Depth texture has not been created"
        },
        syncSize: {
            warning_1: "Canvas physical size {w}x{h} exceeds device limit {limit}, clamped. Check if canvas CSS size depends on its own width/height attributes (creates a self-amplifying feedback loop)."
        },
        assertAlive: {
            error_1: "Disposed, cannot get attachment textures"
        }
    },

    ResourceManager: {
        disposeAll: {
            warning_1: "Resource leak: {size} undisposed resource(s)",
            warning_2: "Undisposed resource: {label}"
        },
        destroy: {
            warning_1: "Attempting to destroy untracked resource: {resource}"
        },
        assertAlive: {
            error_1: "Disposed, cannot create resources"
        }
    },

    PipelineManager: {
        getBindGroupLayouts: {
            info_1: "Create BindGroupLayout: {key}"
        },
        getPipelineLayout: {
            info_1: "Create PipelineLayout: {key}"
        },
        getRenderPipeline: {
            info_1: "Create RenderPipeline: {key} ({duration}ms)"
        },
        getRenderPipelineAsync: {
            info_1: "Async create RenderPipeline: {key}"
        },
        getComputePipeline: {
            info_1: "Create ComputePipeline: {key} ({duration}ms)"
        },
        getComputePipelineAsync: {
            info_1: "Async create ComputePipeline: {key}"
        },
        dispose: {
            info_1: "dispose: releasing {size} cache entries",
            info_2: "- {key}"
        },
        assertAlive: {
            error_1: "Disposed, cannot create pipelines"
        }
    },

    PassManager: {
        add: {
            error_1: "Duplicate pass name: {name}"
        },
        execute: {
            error_1: "Pass execution error: {name}",
            info_1: "Pass {name} executed in {time}ms"
        },
        dispose: {
            warning_1: "dispose: releasing {size} intermediate texture(s)"
        },
        getSortedPasses: {
            error_1: 'Pass "{name}" depends on non-existent pass "{dep}"',
            error_2: "Dependency cycle: {cycle}"
        },
        getTexture: {
            error_1: "Intermediate texture not found: {name}"
        },
        getTextureRaw: {
            error_1: "Intermediate texture not found: {name}"
        },
        assertAlive: {
            error_1: "PassManager has been disposed"
        }
    },

    ShaderLibrary: {
        preprocess: {
            error_1: "Unregistered shader: {name}"
        },
        compileAndGet: {
            error_1: "Compile cache error: {cacheKey}"
        },
        expand: {
            error_1: "#include nesting too deep: {chain}",
            error_2: "#include circular reference: {chain}",
            error_3: '"{fromName}:{fromLine}" references unregistered shader: "{name}"',
            error_4: "{name}:{line} unexpected #else",
            error_5: "{name}:{line} unexpected #endif",
            error_6: "{name} has unclosed #ifdef / #ifndef"
        },
        logCompilationInfo: {
            error_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}",
            warning_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}",
            info_1: "[{name}] {type} @ {lineNum}:{linePos} — {message}"
        },
        assertAlive: {
            error_1: "Disposed"
        }
    },

    StorageBuffer: {
        constructor: {
            error_1: "StorageBuffer itemCount must be >= 0, got {itemCount}",
            error_2: "StorageBuffer stride must be a positive multiple of 4, got {stride}"
        },
        upload: {
            error_1: "Upload data too large: {dataByteLength} > {byteLength}"
        },
        uploadAt: {
            error_1: "offset must be a multiple of 4, got {offset}",
            error_2: "Partial upload out of bounds: {offset} + {dataByteLength} > {byteLength}"
        },
        uploadElement: {
            error_1: "Element index out of bounds: {index} not in [0, {itemCount})",
            error_2: "Element size mismatch: {dataByteLength} vs stride {stride}"
        },
        readback: {
            error_1: "Previous readback has not completed, await it before calling again"
        },
        assertAlive: {
            error_1: 'StorageBuffer "{label}" has been disposed'
        }
    },

    ComputeContext: {
        constructor: {
            warning_1: "GPU timestamp query requested but device does not have 'timestamp-query' feature enabled. Timing disabled."
        },
        workgroupCount: {
            error_1: "workgroupSize must be > 0, got {size}",
            error_2: "Workgroup count exceeds limit: {count} > {maxPerDim} (itemCount={itemCount}, size={size})"
        },
        dispatch3D: {
            error_1: "dispatch3D workgroup dimensions exceed limit {max}: [{x}, {y}, {z}]"
        },
        beginTiming: {
            warning_1: "Timing slots full ({maxTimings}), ignoring timing section: {label}. Increase maxTimings."
        },
        endTiming: {
            warning_1: "endTiming called without matching beginTiming"
        },
        readTimings: {
            warning_1: "Previous readTimings has not completed, skipping",
            error_1: "Failed to read timestamps"
        },
        createTimingResources: {
            warning_1: "Failed to create timestamp resources, timing disabled"
        },
        writeTimestamp: {
            warning_1: "Current GPUCommandEncoder implementation has no writeTimestamp, timing disabled"
        },
        assertAlive: {
            error_1: "ComputeContext has been disposed"
        }
    },

    ComputePass: {
        constructor: {
            error_1: "ComputePass name must not be empty"
        },
        setBindGroup: {
            error_1: 'ComputePass "{name}" bindGroup index must be a non-negative integer, got {index}'
        },
        executeIndirect: {
            error_1: 'ComputePass "{name}" indirectOffset must be 4-byte aligned, got {indirectOffset}'
        },
        validateBindings: {
            error_1: 'ComputePass "{name}" has no bindgroups set, call setBindGroup(0, ...) first',
            error_2: 'ComputePass "{name}" bindgroup slots are not contiguous: slot {i} missing (max slot {lastSlot})'
        },
        assertAlive: {
            error_1: 'ComputePass "{name}" has been disposed'
        }
    },

    PingPongBuffer: {
        assertAlive: {
            error_1: "PingPongBuffer has been disposed, cannot operate double buffer"
        }
    },

    Geometry: {
        constructor: {
            error_1: "positions and normals count mismatch: {positionsLength} vs {normalsLength}"
        },
        assertAlive: {
            error_1: "Geometry has been disposed, cannot upload"
        }
    },

    Mesh: {
        assertAlive: {
            error_1: "Mesh has been disposed"
        }
    },

    OrbitCamera: {
        assertAlive: {
            error_1: "OrbitCamera has been disposed"
        }
    },

    Renderer: {
        step: {
            error_1: "scene is null when calling step()"
        },
        ensurePasses: {
            error_1: "GPU must be attached to Scene before rendering (new Scene({gpu, rm}) or scene.attachGpu(gpu, rm))"
        },
        assertAlive: {
            error_1: "Disposed, cannot continue rendering"
        }
    },

    Scene: {
        add: {
            error_1: "Object already exists in scene: {name}"
        },
        assertAlive: {
            error_1: "Scene has been disposed"
        }
    },

    SSAOPass: {
        constructor: {
            error_1: "SSAOPass: Scene has not called attachGpu or sceneUniformBuffer not created"
        },
        sceneUniformBuffer: {
            error_1: "SSAOPass: cannot get scene uniform buffer, Scene has not called attachGpu"
        }
    },

    PBRPass: {
        constructor: {
            error_1: "PBRPass: Scene has not called attachGpu or sceneUniformBuffer not created"
        }
    },

    PickingPass: {
        constructor: {
            error_1: "PickingPass: Scene has not called attachGpu or sceneUniformBuffer not created"
        },
        readback: {
            error_1: "Picking readback failed: {err}"
        }
    }
};
