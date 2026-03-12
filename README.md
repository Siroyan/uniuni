# uniuni

Browser-based universal perfboard CAD (MVP bootstrap).

## Current Status
- Implemented architecture split:
  - `web`: React + TypeScript + Canvas 2D
  - `core`: Rust domain model + command application + DRC + wasm-bindgen bridge
- Implemented up to MVP Step 7 baseline:
  - part placement/move/rotate/delete
  - manual one-step Manhattan wiring + wire delete
  - net rename + pin-to-net assignment
  - DRC run and issue display
  - undo/redo (snapshot history)
  - IndexedDB autosave + JSON export/import
  - Part editor (pin / occupied / image)
  - Part library persistence in IndexedDB (PartDef + image assets)
  - ZIP export/import (`project.json` + `part-library.json` + `assets/*`)
  - WASM/fallback bridge mode detection + visibility
  - Hit-test priority (`pin -> wire -> occupied`) + Tab candidate cycle

## Local Run
1. Install dependencies (root workspace):
```bash
npm install
```

2. Start the web app (Vite dev server):
```bash
npm run dev -w web
```

3. Open:
`http://localhost:5173`

## Build
Web production build:
```bash
npm run build -w web
```

Web E2E test (Playwright):
```bash
npm run e2e:install -w web
npm run test:e2e -w web
```

Rust core build/check:
```bash
cd core
cargo check
cargo build
```

## Notes
- 仕様は `doc/specification_ja.md` を参照。
- MVP Step1-7 roadmap is complete; next phase candidates are tracked in `doc/implementation_guide_ja.md`.
- CI（unit/build/core/e2e）は `.github/workflows/ci.yml` を参照。
