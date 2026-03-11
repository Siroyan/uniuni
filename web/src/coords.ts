import type { GridPt, Viewport } from "./types";

export type WorldPt = {
  x: number;
  y: number;
};

export type ScreenPt = {
  x: number;
  y: number;
};

export function screenToWorld(screen: ScreenPt, viewport: Viewport): WorldPt {
  return {
    x: (screen.x - viewport.panX) / viewport.zoom,
    y: (screen.y - viewport.panY) / viewport.zoom
  };
}

export function worldToScreen(world: WorldPt, viewport: Viewport): ScreenPt {
  return {
    x: world.x * viewport.zoom + viewport.panX,
    y: world.y * viewport.zoom + viewport.panY
  };
}

export function worldToGrid(world: WorldPt, cellSizePx: number): GridPt {
  return {
    x: Math.round(world.x / cellSizePx),
    y: Math.round(world.y / cellSizePx)
  };
}

export function gridToWorld(grid: GridPt, cellSizePx: number): WorldPt {
  return {
    x: grid.x * cellSizePx,
    y: grid.y * cellSizePx
  };
}

export function clampZoom(nextZoom: number): number {
  return Math.max(0.2, Math.min(4, nextZoom));
}
