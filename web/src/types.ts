export type GridPt = {
  x: number;
  y: number;
};

export type Rot = "Deg0" | "Deg90" | "Deg180" | "Deg270";

export type Board = {
  width: number;
  height: number;
  gridPitchMm: number;
};

export type PinDef = {
  name: string;
  pos: GridPt;
};

export type PartDef = {
  id: string;
  name: string;
  pins: PinDef[];
  occupied: GridPt[];
};

export type PartInst = {
  id: string;
  defId: string;
  at: GridPt;
  rot: Rot;
  refdes: string;
};

export type ToolMode = "place" | "select";

export type Viewport = {
  panX: number;
  panY: number;
  zoom: number;
};
