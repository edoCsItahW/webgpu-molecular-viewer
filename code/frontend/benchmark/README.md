# MolVista Benchmark

Reusable browser/Node benchmark harness for the MolVista viewer.

## Usage

```bash
cd code/frontend/benchmark

# all scenarios
node cli.mjs --scenario all

# quick load + render
node cli.mjs --scenario load,render --no-screenshots

# headed Chrome / custom port
node cli.mjs --scenario picking --headed --port 7281
```

Results are written to `out/report.md`, `out/results.json`, and `out/screenshots/`
(all gitignored).

## Scenarios

| id | content |
|---|---|
| `parser` | Node-side PDB/CIF/SDF parsing through `@wmv/parser/dist` |
| `load` | browser Worker parse + first frame |
| `render` | rAF throughput for 4HHB and 5A9Z |
| `md` | 4HHB GPU MD steps/s and energy |
| `picking` | click-to-selection latency |
| `ui` | showcase/workbench first-screen rAF |

## Fixtures

Small PDB/SDF fixtures are committed under `code/backend/assets`.
Large CIF fixtures (1FFK, 5A9Z, 4V6X, 9Y4H, …) and `pdb/1FFK.pdb` are local
benchmark data and are gitignored; download or copy them into
`code/backend/assets/cif/` before running CIF cases.

Chrome is detected via `CHROME_PATH` or common installation paths. Playwright and
Vite are reused from `mol-vista`, so no extra install is required.
