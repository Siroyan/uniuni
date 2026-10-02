type RecordValue = Record<string, unknown>;
type Point = { x: number; y: number };

function object(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value as RecordValue;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value;
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < -2147483648 || (value as number) > 2147483647) throw new Error(`invalid ${label}`);
  return value as number;
}

function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error(`invalid ${label}`);
  return value;
}

function point(value: unknown, label: string): Point {
  const pt = object(value, label);
  return { x: integer(pt.x, `${label}.x`), y: integer(pt.y, `${label}.y`) };
}

function unique(ids: Set<string>, id: string, label: string): void {
  if (ids.has(id)) throw new Error(`duplicate ${label}: ${id}`);
  ids.add(id);
}

function rotated(pt: Point, rot: string): Point {
  if (rot === "Deg90") return { x: -pt.y, y: pt.x };
  if (rot === "Deg180") return { x: -pt.x, y: -pt.y };
  if (rot === "Deg270") return { x: pt.y, y: -pt.x };
  return pt;
}

// Validate data from ZIP and IndexedDB before it reaches either core bridge.
export function validateProjectStateJson(json: string): void {
  const state = object(JSON.parse(json), "project");
  if (state.schema_version !== 1) throw new Error("unsupported project schema_version");
  const board = object(state.board, "board");
  const width = integer(board.width, "board.width");
  const height = integer(board.height, "board.height");
  if (width < 1 || height < 1) throw new Error("board size must be positive");
  if (typeof board.grid_pitch_mm !== "number" || !Number.isFinite(board.grid_pitch_mm) || board.grid_pitch_mm <= 0) throw new Error("invalid board.grid_pitch_mm");
  const inside = (pt: Point): boolean => pt.x >= 0 && pt.y >= 0 && pt.x < width && pt.y < height;

  const defs = new Map<string, { pins: Map<string, Point>; occupied: Point[] }>();
  const defNames = new Set<string>();
  for (const raw of array(state.part_defs, "part_defs")) {
    const def = object(raw, "part definition");
    const id = uuid(def.id, "part definition id");
    if (defs.has(id)) throw new Error(`duplicate part definition id: ${id}`);
    if (typeof def.name !== "string" || !def.name.trim()) throw new Error("invalid part definition name");
    unique(defNames, def.name.trim(), "part definition name");
    const pins = new Map<string, Point>();
    const pinPositions = new Set<string>();
    for (const rawPin of array(def.pins, "pins")) {
      const pin = object(rawPin, "pin");
      if (typeof pin.name !== "string" || !pin.name.trim()) throw new Error("invalid pin name");
      const pos = point(pin.pos, "pin.pos");
      if (pins.has(pin.name.trim())) throw new Error("duplicate pin name");
      unique(pinPositions, `${pos.x}:${pos.y}`, "pin position");
      pins.set(pin.name, pos);
    }
    if (!pins.size) throw new Error("part definition must have at least one pin");
    const occupied = array(def.occupied, "occupied").map((pt) => point(pt, "occupied cell"));
    if (!occupied.length) throw new Error("part definition must have at least one occupied cell");
    const cells = new Set<string>();
    for (const pt of occupied) unique(cells, `${pt.x}:${pt.y}`, "occupied cell");
    defs.set(id, { pins, occupied });
  }

  const netIds = new Set<string>();
  for (const raw of array(state.nets, "nets")) {
    const net = object(raw, "net");
    unique(netIds, uuid(net.id, "net id"), "net id");
    if (typeof net.name !== "string") throw new Error("invalid net name");
    if (net.color != null && (typeof net.color !== "string" || !/^#[0-9a-f]{6}$/i.test(net.color))) throw new Error("invalid net color");
  }

  const partIds = new Set<string>();
  const occupied = new Set<string>();
  for (const raw of array(state.part_insts, "part_insts")) {
    const inst = object(raw, "part instance");
    unique(partIds, uuid(inst.id, "part id"), "part id");
    const def = defs.get(uuid(inst.def_id, "part def_id"));
    if (!def) throw new Error("part definition not found");
    const at = point(inst.at, "part.at");
    if (!["Deg0", "Deg90", "Deg180", "Deg270"].includes(String(inst.rot))) throw new Error("invalid part rotation");
    if (typeof inst.refdes !== "string") throw new Error("invalid part refdes");
    const assigned = object(inst.net_assign, "part.net_assign");
    for (const [pin, net] of Object.entries(assigned)) {
      if (!def.pins.has(pin)) throw new Error("assigned pin not found");
      if (!netIds.has(uuid(net, "assigned net id"))) throw new Error("assigned net not found");
    }
    for (const rel of def.occupied) {
      const turn = rotated(rel, inst.rot as string);
      const pt = { x: at.x + turn.x, y: at.y + turn.y };
      if (!inside(pt)) throw new Error("part occupancy outside board");
      unique(occupied, `${pt.x}:${pt.y}`, "part occupancy");
    }
  }

  const wireIds = new Set<string>();
  for (const raw of array(state.wires, "wires")) {
    const wire = object(raw, "wire");
    unique(wireIds, uuid(wire.id, "wire id"), "wire id");
    if (!netIds.has(uuid(wire.net_id, "wire net_id"))) throw new Error("wire net not found");
    const path = array(wire.path, "wire.path").map((pt) => point(pt, "wire point"));
    if (path.length < 2) throw new Error("wire path must have >=2 points");
    for (let i = 0; i < path.length; i += 1) {
      if (!inside(path[i])) throw new Error("wire path is outside board");
      if (i && Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y) !== 1) throw new Error("wire segments must be one-grid-step Manhattan");
    }
  }
}
