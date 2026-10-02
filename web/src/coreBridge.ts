import type { Board, DrcIssue, GridPt, Net, PartDef, PartInst, Rot, Wire } from "./types";

type CoreApi = {
  create_empty_project_json: () => string;
  apply_command_json: (stateJson: string, cmdJson: string) => string;
  drc_json: (stateJson: string) => string;
  default?: () => Promise<void>;
};

export type CoreBridgeMode = "wasm" | "fallback";

type CoreGridPt = { x: number; y: number };
type CoreWire = { id: string; net_id: string; path: CoreGridPt[] };
type CoreNet = { id: string; name: string; color?: string | null };
type CorePartDef = {
  id: string;
  name: string;
  pins: Array<{ name: string; pos: CoreGridPt }>;
  occupied: CoreGridPt[];
};
type CorePartInst = {
  id: string;
  def_id: string;
  at: CoreGridPt;
  rot: Rot;
  refdes: string;
  net_assign: Record<string, string>;
};
type CoreProjectState = {
  board: { grid_pitch_mm: number; width: number; height: number };
  part_defs: CorePartDef[];
  part_insts: CorePartInst[];
  nets: CoreNet[];
  wires: CoreWire[];
};

type CoreRuntime = {
  mode: CoreBridgeMode;
  api: CoreApi;
};

let coreRuntimePromise: Promise<CoreRuntime> | null = null;
const NET_COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

function isAdjacent(a: GridPt, b: GridPt): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function validateNetColor(color: string): void {
  if (!NET_COLOR_HEX.test(color)) {
    throw new Error("net color must be #RRGGBB");
  }
}

function rotateRelative(pt: GridPt, rot: Rot): GridPt {
  switch (rot) {
    case "Deg0":
      return pt;
    case "Deg90":
      return { x: -pt.y, y: pt.x };
    case "Deg180":
      return { x: -pt.x, y: -pt.y };
    case "Deg270":
      return { x: pt.y, y: -pt.x };
  }
}

function absoluteOccupied(def: CorePartDef, inst: CorePartInst): GridPt[] {
  return def.occupied.map((pt) => {
    const turned = rotateRelative(pt, inst.rot);
    return { x: inst.at.x + turned.x, y: inst.at.y + turned.y };
  });
}

function isInsideBoard(board: Board, pt: GridPt): boolean {
  return pt.x >= 0 && pt.y >= 0 && pt.x < board.width && pt.y < board.height;
}

function canPlacePart(state: CoreProjectState, candidate: CorePartInst, ignoreId?: string): boolean {
  const def = state.part_defs.find((d) => d.id === candidate.def_id);
  if (!def) return false;
  const board: Board = {
    gridPitchMm: state.board.grid_pitch_mm,
    width: state.board.width,
    height: state.board.height
  };
  const occupied = absoluteOccupied(def, candidate);
  if (!occupied.every((pt) => isInsideBoard(board, pt))) return false;

  for (const part of state.part_insts) {
    if (part.id === ignoreId) continue;
    const partDef = state.part_defs.find((d) => d.id === part.def_id);
    if (!partDef) continue;
    const occ = absoluteOccupied(partDef, part);
    for (const pt of occupied) {
      if (occ.some((other) => other.x === pt.x && other.y === pt.y)) {
        return false;
      }
    }
  }
  return true;
}

function validateBoardSize(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("board size must be positive");
  }
}

function validateResizeTarget(state: CoreProjectState, width: number, height: number): void {
  validateBoardSize(width, height);
  const resizedBoard: Board = {
    gridPitchMm: state.board.grid_pitch_mm,
    width,
    height
  };

  for (const wire of state.wires) {
    for (const pt of wire.path) {
      if (!isInsideBoard(resizedBoard, pt)) {
        throw new Error("board resize would place wire outside board");
      }
    }
  }

  for (const part of state.part_insts) {
    const partDef = state.part_defs.find((d) => d.id === part.def_id);
    if (!partDef) {
      throw new Error("part definition not found");
    }
    for (const pt of absoluteOccupied(partDef, part)) {
      if (!isInsideBoard(resizedBoard, pt)) {
        throw new Error("board resize would place part outside board");
      }
    }
  }
}

function validateCorePartDefs(partDefs: CorePartDef[]): void {
  const defIds = new Set<string>();
  const defNames = new Set<string>();

  for (const def of partDefs) {
    if (defIds.has(def.id)) {
      throw new Error(`duplicate part definition id: ${def.id}`);
    }
    defIds.add(def.id);

    const normalizedName = def.name.trim();
    if (normalizedName.length === 0) {
      throw new Error(`part definition name is empty (id: ${def.id})`);
    }
    if (defNames.has(normalizedName)) {
      throw new Error(`duplicate part definition name: ${normalizedName}`);
    }
    defNames.add(normalizedName);

    if (def.pins.length === 0) {
      throw new Error(`part definition must have at least one pin (id: ${def.id})`);
    }
    if (def.occupied.length === 0) {
      throw new Error(`part definition must have at least one occupied cell (id: ${def.id})`);
    }

    const pinNames = new Set<string>();
    const pinPositions = new Set<string>();
    for (const pin of def.pins) {
      const normalizedPinName = pin.name.trim();
      if (normalizedPinName.length === 0) {
        throw new Error(`pin name is empty in part definition ${def.id}`);
      }
      if (pinNames.has(normalizedPinName)) {
        throw new Error(`duplicate pin name in part definition ${def.id}: ${normalizedPinName}`);
      }
      pinNames.add(normalizedPinName);

      const pinPosKey = `${pin.pos.x}:${pin.pos.y}`;
      if (pinPositions.has(pinPosKey)) {
        throw new Error(
          `duplicate pin position in part definition ${def.id}: (${pin.pos.x},${pin.pos.y})`
        );
      }
      pinPositions.add(pinPosKey);
    }

    const occupiedPositions = new Set<string>();
    for (const occ of def.occupied) {
      const occKey = `${occ.x}:${occ.y}`;
      if (occupiedPositions.has(occKey)) {
        throw new Error(
          `duplicate occupied position in part definition ${def.id}: (${occ.x},${occ.y})`
        );
      }
      occupiedPositions.add(occKey);
    }
  }
}

function validatePartDefsAgainstState(state: CoreProjectState): void {
  for (const part of state.part_insts) {
    const partDef = state.part_defs.find((def) => def.id === part.def_id);
    if (!partDef) {
      throw new Error(`part definition not found for part instance ${part.id}`);
    }
    const pinNames = new Set(partDef.pins.map((pin) => pin.name));
    for (const pinName of Object.keys(part.net_assign ?? {})) {
      if (!pinNames.has(pinName)) {
        throw new Error(`assigned pin not found in part definition ${part.def_id}: ${pinName}`);
      }
    }
    if (!canPlacePart(state, part, part.id)) {
      throw new Error("part-part occupancy collision");
    }
  }
}

function fallbackCreateEmptyProjectJson(): string {
  return JSON.stringify({
    schema_version: 1,
    board: { grid_pitch_mm: 2.54, width: 64, height: 40 },
    part_defs: [],
    part_insts: [],
    nets: [],
    wires: []
  });
}

function fallbackApplyCommandJson(stateJson: string, cmdJson: string): string {
  const state = JSON.parse(stateJson) as CoreProjectState;
  const cmd = JSON.parse(cmdJson) as Record<string, unknown>;

  if ("ReplacePartDefs" in cmd) {
    const payload = cmd.ReplacePartDefs as { part_defs: CorePartDef[] };
    validateCorePartDefs(payload.part_defs);
    const nextState: CoreProjectState = { ...state, part_defs: payload.part_defs };
    validatePartDefsAgainstState(nextState);
    state.part_defs = payload.part_defs;
    return JSON.stringify(state);
  }

  if ("AssignNetName" in cmd) {
    const payload = cmd.AssignNetName as { net_id: string; name: string };
    const target = state.nets.find((net) => net.id === payload.net_id);
    if (target) {
      target.name = payload.name;
    } else {
      state.nets.push({ id: payload.net_id, name: payload.name, color: null });
    }
    return JSON.stringify(state);
  }

  if ("AssignNetColor" in cmd) {
    const payload = cmd.AssignNetColor as { net_id: string; color: string | null };
    if (payload.color !== null) {
      validateNetColor(payload.color);
    }
    const target = state.nets.find((net) => net.id === payload.net_id);
    if (target) {
      target.color = payload.color;
    } else {
      state.nets.push({
        id: payload.net_id,
        name: `N-${payload.net_id.slice(0, 8)}`,
        color: payload.color
      });
    }
    return JSON.stringify(state);
  }

  if ("ResizeBoard" in cmd) {
    const payload = cmd.ResizeBoard as { width: number; height: number };
    validateResizeTarget(state, payload.width, payload.height);
    state.board.width = payload.width;
    state.board.height = payload.height;
    return JSON.stringify(state);
  }

  if ("CommitWire" in cmd) {
    const payload = cmd.CommitWire as { net_id: string; path: GridPt[] };
    if (payload.path.length < 2) {
      throw new Error("wire path must have >=2 points");
    }
    for (let i = 1; i < payload.path.length; i += 1) {
      if (!isAdjacent(payload.path[i - 1], payload.path[i])) {
        throw new Error("wire segments must be one-grid-step Manhattan");
      }
    }

    if (!state.nets.some((net) => net.id === payload.net_id)) {
      state.nets.push({ id: payload.net_id, name: `N-${payload.net_id.slice(0, 8)}`, color: null });
    }
    state.wires.push({
      id: newUuid(),
      net_id: payload.net_id,
      path: payload.path
    });
    return JSON.stringify(state);
  }

  if ("DeleteWire" in cmd) {
    const payload = cmd.DeleteWire as { wire_id: string };
    const before = state.wires.length;
    state.wires = state.wires.filter((wire) => wire.id !== payload.wire_id);
    if (state.wires.length === before) {
      throw new Error("wire not found");
    }
    return JSON.stringify(state);
  }

  if ("AddPartInst" in cmd) {
    const payload = cmd.AddPartInst as {
      def_id: string;
      at: GridPt;
      rot: Rot;
      refdes: string;
    };
    const part: CorePartInst = {
      id: newUuid(),
      def_id: payload.def_id,
      at: payload.at,
      rot: payload.rot,
      refdes: payload.refdes,
      net_assign: {}
    };
    if (!canPlacePart(state, part)) {
      throw new Error("part placement invalid");
    }
    state.part_insts.push(part);
    return JSON.stringify(state);
  }

  if ("MovePartInst" in cmd) {
    const payload = cmd.MovePartInst as { part_id: string; to: GridPt };
    const part = state.part_insts.find((p) => p.id === payload.part_id);
    if (!part) {
      throw new Error("part instance not found");
    }
    const moved: CorePartInst = { ...part, at: payload.to };
    if (!canPlacePart(state, moved, part.id)) {
      throw new Error("part placement invalid");
    }
    part.at = payload.to;
    return JSON.stringify(state);
  }

  if ("MoveRotatePartInst" in cmd) {
    const payload = cmd.MoveRotatePartInst as { part_id: string; to: GridPt; rot: Rot };
    const part = state.part_insts.find((p) => p.id === payload.part_id);
    if (!part) {
      throw new Error("part instance not found");
    }
    const movedAndRotated: CorePartInst = { ...part, at: payload.to, rot: payload.rot };
    if (!canPlacePart(state, movedAndRotated, part.id)) {
      throw new Error("part placement invalid");
    }
    part.at = payload.to;
    part.rot = payload.rot;
    return JSON.stringify(state);
  }

  if ("RotatePartInst" in cmd) {
    const payload = cmd.RotatePartInst as { part_id: string; rot: Rot };
    const part = state.part_insts.find((p) => p.id === payload.part_id);
    if (!part) {
      throw new Error("part instance not found");
    }
    const rotated: CorePartInst = { ...part, rot: payload.rot };
    if (!canPlacePart(state, rotated, part.id)) {
      throw new Error("part placement invalid");
    }
    part.rot = payload.rot;
    return JSON.stringify(state);
  }

  if ("DeletePartInst" in cmd) {
    const payload = cmd.DeletePartInst as { part_id: string };
    const before = state.part_insts.length;
    state.part_insts = state.part_insts.filter((p) => p.id !== payload.part_id);
    if (state.part_insts.length === before) {
      throw new Error("part instance not found");
    }
    return JSON.stringify(state);
  }

  if ("AssignPinToNet" in cmd) {
    const payload = cmd.AssignPinToNet as {
      part_id: string;
      pin_name: string;
      net_id: string;
    };
    const part = state.part_insts.find((p) => p.id === payload.part_id);
    if (!part) {
      throw new Error("part instance not found");
    }
    const partDef = state.part_defs.find((d) => d.id === part.def_id);
    if (!partDef) {
      throw new Error("part definition not found");
    }
    if (!partDef.pins.some((pin) => pin.name === payload.pin_name)) {
      throw new Error("pin not found in part definition");
    }
    if (!state.nets.some((net) => net.id === payload.net_id)) {
      state.nets.push({ id: payload.net_id, name: `N-${payload.net_id.slice(0, 8)}`, color: null });
    }
    part.net_assign[payload.pin_name] = payload.net_id;
    return JSON.stringify(state);
  }

  throw new Error("unsupported command in fallback bridge");
}

function fallbackDrcJson(stateJson: string): string {
  const state = JSON.parse(stateJson) as { wires: Array<{ net_id: string; path: GridPt[] }> };
  const pointNets = new Map<string, Set<string>>();
  for (const wire of state.wires) {
    for (const pt of wire.path) {
      const key = `${pt.x}:${pt.y}`;
      const nets = pointNets.get(key) ?? new Set<string>();
      nets.add(wire.net_id);
      pointNets.set(key, nets);
    }
  }

  const issues: DrcIssue[] = [];
  for (const [key, nets] of pointNets.entries()) {
    if (nets.size < 2) continue;
    const [x, y] = key.split(":").map((v) => Number(v));
    issues.push({
      level: "Error",
      code: "SHORT",
      message: "multiple nets share one grid point",
      at: { x, y }
    });
  }
  return JSON.stringify(issues);
}

const fallbackCoreApi: CoreApi = {
  create_empty_project_json: fallbackCreateEmptyProjectJson,
  apply_command_json: fallbackApplyCommandJson,
  drc_json: fallbackDrcJson
};

function fallbackAllowed(): boolean {
  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env;
  if (nodeEnv?.UNIUNI_CORE_FORCE_FALLBACK === "1") {
    return true;
  }
  if (nodeEnv?.UNIUNI_CORE_DISABLE_FALLBACK === "1") {
    return false;
  }

  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, unknown> }).env;
  if (!metaEnv) return true;

  const disable = metaEnv.VITE_CORE_DISABLE_FALLBACK;
  if (typeof disable === "string") {
    const normalized = disable.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
      return false;
    }
  }

  const explicit = metaEnv.VITE_CORE_ALLOW_FALLBACK;
  if (typeof explicit === "string") {
    const normalized = explicit.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no") {
      return false;
    }
  }

  // Default is permissive for compatibility: prefer WASM, but allow fallback.
  return true;
}

async function loadCoreRuntime(): Promise<CoreRuntime> {
  if (!coreRuntimePromise) {
    coreRuntimePromise = (async (): Promise<CoreRuntime> => {
      try {
        const modulePath = "/core/pkg/uniuni_core.js";
        const mod = (await import(
          /* @vite-ignore */ modulePath
        )) as unknown as CoreApi;
        if (typeof mod.default === "function") {
          await mod.default();
        }
        return {
          mode: "wasm",
          api: mod
        };
      } catch {
        if (!fallbackAllowed()) {
          throw new Error(
            "WASM core の読み込みに失敗しました。`core/pkg` を生成するか、`VITE_CORE_DISABLE_FALLBACK` の設定を解除してください。"
          );
        }
        return {
          mode: "fallback",
          api: fallbackCoreApi
        };
      }
    })().catch((err) => {
      coreRuntimePromise = null;
      throw err;
    });
  }
  const runtimePromise = coreRuntimePromise;
  if (!runtimePromise) {
    throw new Error("core runtime initialization failed");
  }
  return runtimePromise;
}

function parseViewState(stateJson: string): { board: Board; nets: Net[]; wires: Wire[]; parts: PartInst[] } {
  const state = JSON.parse(stateJson) as CoreProjectState;
  return {
    board: {
      gridPitchMm: state.board.grid_pitch_mm,
      width: state.board.width,
      height: state.board.height
    },
    nets: state.nets.map((net) => ({
      id: net.id,
      name: net.name,
      color: typeof net.color === "string" && NET_COLOR_HEX.test(net.color) ? net.color : null
    })),
    wires: state.wires.map((wire) => ({
      id: wire.id,
      netId: wire.net_id,
      path: wire.path
    })),
    parts: state.part_insts.map((part) => ({
      id: part.id,
      defId: part.def_id,
      at: part.at,
      rot: part.rot,
      refdes: part.refdes,
      netAssign: part.net_assign ?? {}
    }))
  };
}

function partDefsToCore(partDefs: PartDef[]): CorePartDef[] {
  return partDefs.map((def) => ({
    id: def.id,
    name: def.name,
    pins: def.pins.map((pin) => ({ name: pin.name, pos: pin.pos })),
    occupied: def.occupied
  }));
}

export function commandReplacePartDefsJson(partDefs: PartDef[]): string {
  return JSON.stringify({
    ReplacePartDefs: {
      part_defs: partDefsToCore(partDefs)
    }
  });
}

export async function replacePartDefsInStateJson(
  stateJson: string,
  partDefs: PartDef[]
): Promise<string> {
  return applyCoreCommandJson(stateJson, commandReplacePartDefsJson(partDefs));
}

export function newUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export async function detectCoreBridgeMode(): Promise<CoreBridgeMode> {
  const runtime = await loadCoreRuntime();
  return runtime.mode;
}

export function __resetCoreRuntimeForTest(): void {
  coreRuntimePromise = null;
}

export async function createInitialCoreStateJson(board: Board, partDefs: PartDef[]): Promise<string> {
  const runtime = await loadCoreRuntime();
  const create = runtime.api.create_empty_project_json;
  const state = JSON.parse(create()) as CoreProjectState;
  state.board = {
    grid_pitch_mm: board.gridPitchMm,
    width: board.width,
    height: board.height
  };
  let stateJson = JSON.stringify(state);
  if (partDefs.length > 0) {
    stateJson = await applyCoreCommandJson(stateJson, commandReplacePartDefsJson(partDefs));
  }
  return stateJson;
}

export async function applyCoreCommandJson(stateJson: string, cmdJson: string): Promise<string> {
  const runtime = await loadCoreRuntime();
  const apply = runtime.api.apply_command_json;
  return apply(stateJson, cmdJson);
}

export async function runCoreDrcJson(stateJson: string): Promise<string> {
  const runtime = await loadCoreRuntime();
  const drc = runtime.api.drc_json;
  return drc(stateJson);
}

export function commandAssignNetNameJson(netId: string, name: string): string {
  return JSON.stringify({
    AssignNetName: {
      net_id: netId,
      name
    }
  });
}

export function commandAssignNetColorJson(netId: string, color: string | null): string {
  return JSON.stringify({
    AssignNetColor: {
      net_id: netId,
      color
    }
  });
}

export function commandResizeBoardJson(width: number, height: number): string {
  return JSON.stringify({
    ResizeBoard: {
      width,
      height
    }
  });
}

export function commandCommitWireJson(netId: string, path: GridPt[]): string {
  return JSON.stringify({
    CommitWire: {
      net_id: netId,
      path
    }
  });
}

export function commandDeleteWireJson(wireId: string): string {
  return JSON.stringify({
    DeleteWire: {
      wire_id: wireId
    }
  });
}

export function commandAddPartInstJson(defId: string, at: GridPt, rot: Rot, refdes: string): string {
  return JSON.stringify({
    AddPartInst: {
      def_id: defId,
      at,
      rot,
      refdes
    }
  });
}

export function commandMovePartInstJson(partId: string, to: GridPt): string {
  return JSON.stringify({
    MovePartInst: {
      part_id: partId,
      to
    }
  });
}

export function commandMoveRotatePartInstJson(partId: string, to: GridPt, rot: Rot): string {
  return JSON.stringify({
    MoveRotatePartInst: {
      part_id: partId,
      to,
      rot
    }
  });
}

export function commandRotatePartInstJson(partId: string, rot: Rot): string {
  return JSON.stringify({
    RotatePartInst: {
      part_id: partId,
      rot
    }
  });
}

export function commandDeletePartInstJson(partId: string): string {
  return JSON.stringify({
    DeletePartInst: {
      part_id: partId
    }
  });
}

export function commandAssignPinToNetJson(partId: string, pinName: string, netId: string): string {
  return JSON.stringify({
    AssignPinToNet: {
      part_id: partId,
      pin_name: pinName,
      net_id: netId
    }
  });
}

export function extractViewStateFromCoreJson(
  stateJson: string
): { board: Board; nets: Net[]; wires: Wire[]; parts: PartInst[] } {
  return parseViewState(stateJson);
}
