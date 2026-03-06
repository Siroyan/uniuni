# uniuni

Browser-based universal perfboard CAD (MVP bootstrap).

## Current Status
- Implemented initial architecture split:
  - `web`: React + TypeScript + Canvas 2D
  - `core`: Rust domain model + command application + minimal DRC + wasm-bindgen bridge
- MVP step 1 started:
  - screen/world/grid coordinate conversion
  - pan/zoom interaction
  - nearest-grid snap hover visualization

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
- Next implementation target from `doc/impl_brief.md`: part placement with rotation.
