// Copyright (c) 2026. All rights reserved.
// This source code is licensed under the CC BY-NC-SA
// (Creative Commons Attribution-NonCommercial-NoDerivatives) License, By Xiao Songtao.
// This software is protected by copyright law. Reproduction, distribution, or use for commercial
// purposes is prohibited without the author's permission. If you have any questions or require
// permission, please contact the author: edocsitahw@qq.com

/**
 * @file en-Us.ts
 * @author edocsitahw
 * @version 1.1
 * @date 2026/09/27 14:19
 * @desc Application i18n messages (English). Key structure mirrors zh-Hans.
 * @copyright CC BY-NC-SA 2026. All rights reserved.
 * */
export default {
    common: {
        projectName: "Mol-Vista",
        notAvailable: "Unavailable",
        cancel: "Cancel",
        retry: "Retry",
        close: "Close",
        ok: "OK"
    },
    mainView: {
        subTitle: "WebGPU Molecular Workbench",
        viewport: {
            toolbar: {
                ariaLabel: "Viewport toolbar"
            },
            hud: {
                ariaLabel: "Performance monitor"
            }
        }
    },
    topbar: {
        importStructure: "Import structure",
        fitView: "Fit view",
        themeAria: "Theme switcher",
        doc: {
            ariaLabel: "Structure metadata",
            atoms: "atoms"
        },
        theme: {
            light: "Light",
            dark: "Dark",
            auto: "Follow system"
        }
    },
    structure: {
        title: "Structure",
        showAll: "Show all",
        import: "Import",
        dropzone: {
            prompt: "Drop PDB / SDF file",
            hint: "or click to browse local files",
            parsing: "Parsing molecule…"
        },
        chains: {
            title: "Chains",
            count: "{shown} / {total}",
            peptide: "Peptide {id}",
            water: "Water molecules",
            unknown: "Unknown chain",
            empty: "No chain data"
        },
        legend: {
            title: "Element legend",
            scheme: "CPK",
            empty: "No element data"
        }
    },
    viewport: {
        toolbar: {
            rotate: "Rotate",
            pan: "Pan",
            pick: "Pick atom",
            measure: "Measure",
            fit: "Fit view",
            grid: "Coordinate grid"
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
            webgpuReady: "WebGPU · Adapter ready",
            webgpuUnavailable: "WebGPU unavailable"
        }
    },
    inspector: {
        tabs: {
            inspect: "Inspect",
            render: "Render",
            simulate: "Simulate"
        },
        empty: {
            inspect: "Select an atom to see its info",
            render: "Loading render parameters",
            simulate: "No simulation running for this structure"
        },
        atomCard: {
            atomNumber: "atom #{id}",
            residue: "Residue",
            chain: "Chain",
            bfactor: "B-factor",
            occupancy: "Occupancy",
            partialCharge: "Partial charge",
            focusAtom: "Focus this atom"
        },
        coord: {
            x: "X",
            y: "Y",
            z: "Z"
        },
        stats: {
            title: "Molecule stats",
            atoms: "Atoms",
            bonds: "Bonds",
            residues: "Residues",
            radiusGyration: "Radius of gyration",
            netCharge: "Net charge",
            mass: "Mass"
        },
        render: {
            displayMode: "Display mode",
            displayModes: {
                ballStick: "Ball & stick",
                spaceFill: "Space-fill",
                wireframe: "Wireframe",
                cartoon: "Cartoon"
            },
            capability: {
                cartoon: "This structure has no secondary-structure data, so cartoon mode is unavailable",
                charge: "This structure has no charge data, so charge coloring is unavailable",
                secondary: "This structure has no secondary-structure data, so SS coloring is unavailable"
            },
            colorScheme: "Color scheme",
            colorSchemes: {
                element: "Element CPK",
                chain: "By chain",
                charge: "By charge",
                secondary: "Secondary structure"
            },
            quality: "Quality",
            qualityToggles: {
                ssao: "Ambient occlusion (SSAO)",
                outline: "Outline",
                grid: "Coordinate grid",
                hydrogens: "Hydrogen atoms"
            },
            radius: {
                title: "Atom radius scaling",
                ball: "Ball radius",
                bond: "Bond radius"
            }
        },
        simulate: {
            md: {
                title: "Molecular dynamics",
                status: {
                    running: "Running",
                    paused: "Paused",
                    idle: "Idle"
                }
            },
            transport: {
                play: "Play",
                pause: "Pause",
                step: "Step",
                reset: "Reset",
                steps: "{count} steps"
            },
            params: {
                title: "Parameters",
                integrator: "Velocity-Verlet",
                temperature: "Temperature",
                timestep: "Time step",
                damping: "Damping",
                cutoff: "Cutoff radius"
            },
            energy: {
                title: "Energy",
                unit: "kJ·mol⁻¹",
                potential: "Potential",
                kinetic: "Kinetic",
                total: "Total",
                drift: "Temp. drift"
            }
        }
    },
    statusbar: {
        format: "PDB",
        summary: "{atoms} atoms · {bonds} bonds · {residues} residues",
        capability: {
            ready: "WebGPU · Adapter ready",
            unavailable: "WebGPU unavailable"
        },
        perf: {
            fps: "fps",
            ms: "ms"
        }
    }
} as const;
