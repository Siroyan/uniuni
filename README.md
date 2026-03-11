# uniuni

Browser-based universal perfboard CAD (MVP bootstrap).

## Current Status
- Implemented architecture split:
  - `web`: React + TypeScript + Canvas 2D
  - `core`: Rust domain model + command application + DRC + wasm-bindgen bridge
- Implemented up to MVP Step 5 baseline:
  - part placement/move/rotate/delete
  - manual one-step Manhattan wiring + wire delete
  - net rename + pin-to-net assignment
  - DRC run and issue display
  - undo/redo (snapshot history)
  - IndexedDB autosave + JSON export/import
  - Part editor (pin / occupied / image)
  - Part library persistence in IndexedDB (PartDef + image assets)

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

Rust core build/check:
```bash
cd core
cargo check
cargo build
```

## Notes
- Next implementation phases are tracked in `doc/impl_brief.md` and `doc/implementation_guide_ja.md` (Step 4-7).
