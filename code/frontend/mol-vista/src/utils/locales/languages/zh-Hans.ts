// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file zh-Hans.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/18 13:02
 * @desc 应用 i18n 词条（简体中文）。键的组织跟随 UI 模块，便于检索。
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
export default {
    common: {
        projectName: "Mol-Vista",
        notAvailable: "不可用",
        cancel: "取消",
        retry: "重试",
        close: "关闭",
        ok: "确定"
    },
    mainView: {
        subTitle: "WebGPU 分子工作台",
        viewport: {
            toolbar: {
                ariaLabel: "视口工具条"
            },
            hud: {
                ariaLabel: "性能监控"
            }
        }
    },
    topbar: {
        importStructure: "导入结构",
        fitView: "适应视图",
        themeAria: "主题切换",
        doc: {
            ariaLabel: "结构元信息",
            atoms: "原子"
        },
        theme: {
            light: "浅色",
            dark: "深色",
            auto: "跟随系统"
        }
    },
    structure: {
        title: "结构",
        showAll: "全部显示",
        import: "导入",
        dropzone: {
            prompt: "拖入 PDB / SDF 文件",
            hint: "或点击浏览本地文件",
            parsing: "正在解析分子…"
        },
        chains: {
            title: "链",
            count: "{shown} / {total}",
            peptide: "多肽链 {id}",
            water: "水分子",
            unknown: "未知链",
            empty: "暂无链数据"
        },
        legend: {
            title: "元素图例",
            scheme: "CPK",
            empty: "暂无元素数据"
        }
    },
    viewport: {
        toolbar: {
            rotate: "旋转",
            pan: "平移",
            pick: "选择原子",
            measure: "测距",
            fit: "适应视图",
            grid: "坐标网格"
        },
        hud: {
            fps: "fps",
            ms: "ms",
            instances: "inst"
        },
        gizmo: {
            axisX: "X",
            axisY: "Y",
            axisZ: "Z"
        },
        scalebar: {
            unit: "Å"
        },
        capability: {
            webgpuReady: "WebGPU · 适配器就绪",
            webgpuUnavailable: "WebGPU 不可用"
        }
    },
    inspector: {
        tabs: {
            inspect: "检查",
            render: "渲染",
            simulate: "模拟"
        },
        empty: {
            inspect: "选中一个原子以查看其信息",
            render: "渲染参数加载中",
            simulate: "当前结构未启动模拟"
        },
        atomCard: {
            atomNumber: "原子 #{id}",
            residue: "残基",
            chain: "链",
            bfactor: "B-factor",
            occupancy: "占据率",
            partialCharge: "部分电荷",
            focusAtom: "聚焦此原子"
        },
        coord: {
            x: "X",
            y: "Y",
            z: "Z"
        },
        stats: {
            title: "分子统计",
            atoms: "原子",
            bonds: "化学键",
            residues: "残基",
            radiusGyration: "回转半径",
            netCharge: "净电荷",
            mass: "质量"
        },
        render: {
            displayMode: "显示模式",
            displayModes: {
                ballStick: "球棍",
                spaceFill: "空间填充",
                wireframe: "线框",
                cartoon: "卡通"
            },
            colorScheme: "着色方案",
            colorSchemes: {
                element: "元素 CPK",
                chain: "按链",
                charge: "按电荷",
                secondary: "二级结构"
            },
            quality: "画质",
            qualityToggles: {
                ssao: "环境光遮蔽 SSAO",
                outline: "轮廓描边",
                grid: "坐标网格",
                hydrogens: "氢原子"
            },
            radius: {
                title: "原子半径缩放",
                ball: "球半径",
                bond: "键半径"
            }
        },
        simulate: {
            md: {
                title: "分子动力学",
                status: {
                    running: "运行中",
                    paused: "已暂停",
                    idle: "未启动"
                }
            },
            transport: {
                play: "开始",
                pause: "暂停",
                step: "单步",
                reset: "重置",
                steps: "{count} steps"
            },
            params: {
                title: "参数",
                integrator: "Velocity-Verlet",
                temperature: "温度",
                timestep: "时间步长",
                damping: "阻尼",
                cutoff: "截断半径"
            },
            energy: {
                title: "能量",
                unit: "kJ·mol⁻¹",
                potential: "势能",
                kinetic: "动能",
                total: "总能",
                drift: "温度漂移"
            }
        }
    },
    statusbar: {
        format: "PDB",
        summary: "{atoms} atoms · {bonds} bonds · {residues} residues",
        capability: {
            ready: "WebGPU · 适配器就绪",
            unavailable: "WebGPU 不可用"
        },
        perf: {
            fps: "fps",
            ms: "ms"
        }
    }
} as const;
