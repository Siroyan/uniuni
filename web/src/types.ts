export type GridPt = {
  x: number;
  y: number;
};

export type Board = {
  width: number;
  height: number;
  gridPitchMm: number;
};

export type Viewport = {
  panX: number;
  panY: number;
  zoom: number;
};
