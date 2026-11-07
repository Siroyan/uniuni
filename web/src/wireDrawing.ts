import { isBoardPoint } from "./boardPresets";
import type { Board, GridPt } from "./types";

/** Extend a draft along one axis, retaining every intermediate connection point. */
export function extendWireDraft(path: GridPt[], target: GridPt, board: Board): GridPt[] {
  if (!isBoardPoint(board, target)) return path;
  const last = path[path.length - 1];
  if (!last) return [target];
  if (last.x !== target.x && last.y !== target.y) return path;
  const length = Math.abs(target.x - last.x) + Math.abs(target.y - last.y);
  if (length === 0) return path;
  const dx = Math.sign(target.x - last.x);
  const dy = Math.sign(target.y - last.y);
  const segment = Array.from({ length }, (_, i) => ({
    x: last.x + dx * (i + 1), y: last.y + dy * (i + 1)
  }));
  // A valid endpoint can lie beyond a gap in a shaped board's hole pattern.
  return segment.every((point) => isBoardPoint(board, point)) ? [...path, ...segment] : path;
}
