# Development Progress

## 2026-03-07
Started implementation based on `doc/impl_brief.md`.

Implemented:
- Project scaffolding for browser-first architecture.
- `web` Canvas prototype with:
  - grid rendering
  - board boundary rendering
  - pan (middle/right drag)
  - zoom (wheel, cursor anchored)
  - snapped grid-point HUD
- `core` Rust prototype with:
  - domain structs (`Board`, `GridPt`, `Wire`, `Net`, `PartDef`, `PartInst`)
  - command enum (`CommitWire`, `AssignNetName`)
  - wire path validator (Manhattan one-grid-step)
  - minimal DRC (short detection on shared grid points)
  - wasm-bindgen JSON bridge (`create_empty_project_json`, `apply_command_json`, `drc_json`)

Validation:
- `npm run build -w web` passed.
- `cargo check` not run because toolchain unavailable in environment.
