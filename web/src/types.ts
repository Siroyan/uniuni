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

export type PartCategory = "passive" | "semiconductor" | "ic" | "connector" | "switch" | "other";

export type PartDef = {
  id: string;
  name: string;
  category?: PartCategory;
  pins: PinDef[];
  occupied: GridPt[];
  imageDataUrl?: string | null;
  imagePixelated?: boolean;
  imageScale?: number;
  imageOffsetX?: number;
  imageOffsetY?: number;
};

export type PartInst = {
  id: string;
  defId: string;
  at: GridPt;
  rot: Rot;
  refdes: string;
  netAssign: Record<string, string>;
};

export type Net = {
  id: string;
  name: string;
  color?: string | null;
};

export type Wire = {
  id: string;
  netId: string;
  path: GridPt[];
};

export type ToolMode = "place" | "select" | "wire";

export type Viewport = {
  panX: number;
  panY: number;
  zoom: number;
};

export type IssueLevel = "Error" | "Warning";

export type DrcIssue = {
  level: IssueLevel;
  code: string;
  message: string;
  at: GridPt | null;
};
