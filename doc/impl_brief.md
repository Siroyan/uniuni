# Browser-based Universal Perfboard CAD (OSS) — Implementation Brief for Codex

## 1. Goal
Develop a browser-based CAD application for hobbyist electronics builders to design wiring on **universal perfboard (ユニバーサル基板)**.

Key properties:
- Runs entirely in the browser (PWA-ready).
- Users can add/maintain custom part (component) definitions.
- Open-source project.

## 2. Chosen Approach (Architecture Option A)
**Front-end complete (no server)** + **Rust core compiled to WebAssembly (WASM)**.

### Frontend (TypeScript)
- UI & interaction: **TypeScript + React**
- Rendering: **Canvas 2D**
- Local persistence: **IndexedDB** (e.g., via Dexie.js)
- Import/Export: JSON (+ assets packaged as ZIP)

### Core (Rust -> WASM)
Rust is used for:
- Domain data model & invariants
- Command application (edit operations)
- Undo/Redo foundations (command log / invertible commands)
- DRC checks
- Hit testing helpers / occupancy maps (fast lookups)

WASM bridge:
- wasm-bindgen + serde for JS↔Rust data exchange
- Build via wasm-pack (or equivalent Vite integration)

## 3. Core Design Principles
### 3.1 Command-centric editing (Undo/Redo first-class)
All edits are represented as **Commands**.
- JS converts user events → Commands
- Rust applies Commands → new State (or returns patches)
- Undo/Redo uses command inversion or patch-based approach

Minimum viable strategy:
- In early MVP, keep routing "preview" in JS, then **commit** final command to Rust.

### 3.2 Rendering separation
- UI/Canvas draws from State
- Keep drawing layered conceptually:
  - grid/holes
  - parts
  - wires
  - highlights (selection / same-net)
- Prepare for future optimizations (viewport filtering, caching), but start simple.

### 3.3 Manhattan-only wiring on grid points
Wiring is **manual only**, and restricted to:
- **Manhattan path**
- **one-grid-step segments only**
This drastically simplifies:
- Data model
- DRC
- Hit testing
- Editing

## 4. Board Model (Perfboard Abstraction)
- Board is a **rectangular grid of points** (holes are implicit by coordinates).
- No copper/land geometry needed.
- Grid pitch is parameterized (default 2.54mm), but model uses integer grid coordinates.

## 5. Data Model (Proposed)
### 5.1 Common types
- `GridPt = (i32, i32)` integer grid coordinate.
- `Rot = 0|90|180|270` degrees.

### 5.2 Board
- `grid_pitch_mm: f32` (default 2.54)
- `width: i32` (#columns)
- `height: i32` (#rows)

### 5.3 Part Definition (user-editable library)
A part definition provides:
- **Pins occupied** (pin positions)
- **Occupied area** (cells that the part covers)
- **Image** (visual appearance)

Suggested structure:
- `PartDef`
  - `id: UUID`
  - `name: String`
  - `pins: Vec<PinDef>`
    - `name: String` (e.g., "1", "GND")
    - `pos: GridPt` relative to part origin
  - `occupied: Vec<GridPt>` relative occupied cells (simple MVP representation)
    - Optional: allow `hard/soft` occupancy later
  - `image: ImageRef`
    - `image_id: UUID`
    - `mime: String`
    - `width_px, height_px: u32`
  - `image_anchor: (f32, f32)` (alignment)
  - `image_scale: f32`

Notes:
- The **truth** is pins/occupied; image is only for visualization.

### 5.4 Part Instance (placed on board)
- `PartInst`
  - `id: UUID`
  - `def_id: UUID`
  - `at: GridPt` (board location)
  - `rot: Rot`
  - `refdes: String` (e.g., "R1", "U3")
  - `net_assign: Map<pin_name, net_id>` (pin-to-net)

### 5.5 Nets
- `Net`
  - `id: UUID`
  - `name: String`

### 5.6 Wires (manual, Manhattan)
- `Wire`
  - `id: UUID`
  - `net_id: UUID`
  - `path: Vec<GridPt>`  **grid point polyline**

Constraints:
- Adjacent points only: for each consecutive pair, `|dx| + |dy| == 1`
- No repeated consecutive points
- Valid if `path.len() >= 2`

Derived caches (recomputable, optional):
- `points_set: HashSet<GridPt>` for fast checks
- `aabb` for viewport filtering

## 6. Occupancy / Lookup Maps (for fast DRC & selection)
Maintain recomputable board maps:
- `occ_part_hard: HashMap<GridPt, PartInstId>`
- (Optional later) `occ_part_soft`
- `occ_wire: HashMap<GridPt, NetId>` or `HashMap<GridPt, Vec<NetId>>`

Because wiring is Manhattan on grid points, many checks become O(1) lookups.

## 7. Hit Testing (Selection) Policy
Because everything lies on grid points/cells:
1. Convert mouse position → nearest `GridPt` (snap)
2. Check entities at that point in priority order:
   1) Part pin at that point
   2) Wire point at that point
   3) Occupied cell at that point
3. If multiple, allow cycling selection (e.g., Tab).

Avoid segment-distance hit tests in MVP.

## 8. DRC Rules (Minimal but valuable)
Given the simplified model:
1. **Part-part collision (hard occupancy overlap)** → Error
2. **Wire vs part occupancy**:
   - If a wire point lies in occupied hard cell → Error
   - Exception: wire points that correspond to a part pin cell may be allowed
3. **Short**:
   - Same grid point used by wires of different `net_id` → Error
4. **Unconnected pin**:
   - For each pin with assigned net, if its grid point is not present in that net's wire points → Warning

Policy note:
- "Crossing = connection" because shared grid point implies connection.
- If later needed, introduce explicit jumper component concept.

## 9. Commands (Edit Operations) — MVP Set
General:
- `AddPartInst`
- `MovePartInst`
- `RotatePartInst`
- `DeleteSelection` (or delete by id)
- `AssignNetName`
- `AssignPinToNet`

Wire creation:
- In MVP: route preview in JS, commit in Rust:
  - `CommitWire { net_id, path }`
- Additional operations (optional later):
  - `DeleteWire { wire_id }`
  - `SplitWireAt { wire_id, at }`

Undo/Redo:
- Implement as command log + invertible commands or patch deltas.

## 10. Persistence & File Packaging
### Local storage
- Projects and part library stored in IndexedDB.
- Images stored as Blob in IndexedDB referenced by `image_id`.

### Export
- Export JSON project (`schema_version` included)
- Package assets as ZIP:
  - `project.json`
  - `assets/<image_id>.<ext>` (or a manifest)

### Import
- Load ZIP → restore JSON + assets

### Schema versioning
Include:
- `schema_version: u32`
- Prepare for migrations.

## 11. MVP Implementation Order (Recommended)
1. Coordinate system: screen ↔ world ↔ grid, pan/zoom, snap
2. Part placement with rotation (using pins + occupied cells)
3. Wire routing tool (Manhattan, one-grid step), JS preview → `CommitWire`
4. DRC minimal set (collision, short, unconnected)
5. Undo/Redo (command log)
6. Part editor:
   - edit pins (add/move/remove)
   - paint occupied cells
   - attach/position image (transparent PNG recommended)

## 12. Non-goals for MVP
- Auto-routing
- Copper/land/trace width geometry
- WebGL/WebGPU rendering
- Collaboration / cloud sync
- "Non-connecting crossings" (requires jumpers/bridges concept)

## 13. Open Questions / Future Extensions (Do not block MVP)
- Soft occupancy (warning-only) vs hard occupancy (error)
- Allow wires under parts (per-part setting)
- Jumper/bridge representation to allow non-connecting crossings
- Performance optimizations: viewport filtering, tile caching, WebGL migration