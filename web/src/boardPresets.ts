import type { Board, GridPt } from "./types";

export const ARDUINO_PROFILE = "arduino-uprotoshield-i" as const;

// PDF page 1: 68 x 52 mm, 369 through holes, diameter 0.90 mm.
// 2.54 mm pitch and origin/outline offsets are traced from the drawing.
// Origin: first prototyping column, outer DIGITAL row (about 14.8, 1.9 mm).
export const ARDUINO_BOARD = {
  width: 21, height: 20, gridPitchMm: 2.54, profile: ARDUINO_PROFILE
} satisfies Board;
export const ARDUINO_OUTLINE: GridPt[] = [
  { x: 0, y: 0 }, { x: 65.46, y: 0 }, { x: 65.46, y: 10.46 },
  { x: 68, y: 13 }, { x: 68, y: 47 }, { x: 65.46, y: 49.54 },
  { x: 65.46, y: 52 }, { x: 0, y: 52 }
].map(({ x, y }) => ({ x: (x - 14.8) / 2.54, y: (y - 1.9) / 2.54 }));

export function isArduinoHole(pt: GridPt): boolean {
  const { x, y } = pt;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 20) return false;
  if (y === 0) return x >= 12 && x <= 19;
  if (y === 1) return (x >= 1 && x <= 10) || (x >= 12 && x <= 19);
  if (y >= 3 && y <= 4) return x <= 19;
  if (y >= 5 && y <= 16) return true;
  if (y === 17) return x <= 4;
  if (y === 18 || y === 19) return x <= 3 || (x >= 5 && x <= 12) || (x >= 14 && x <= 19);
  return false;
}

export const ARDUINO_HOLES: GridPt[] = [];
for (let y = 0; y < 20; y++) {
  for (let x = 0; x < 21; x++) {
    if (isArduinoHole({ x, y })) ARDUINO_HOLES.push({ x, y });
  }
}
// The outer DIGITAL header is offset by half a pitch: display only in this CAD.
for (let x = 1.5; x <= 10.5; x++) ARDUINO_HOLES.push({ x, y: 0 });

export function validateBoardProfile(board: Board): void {
  if (board.profile != null && board.profile !== ARDUINO_PROFILE) throw new Error("unknown board profile");
  if (board.profile === ARDUINO_PROFILE && (board.width !== 21 || board.height !== 20 || Math.abs(board.gridPitchMm - 2.54) > 0.001)) {
    throw new Error("Arduino U.PROTO SHIELD I requires 21x20 grid at 2.54mm");
  }
}

export function isBoardPoint(board: Board, pt: GridPt): boolean {
  return pt.x >= 0 && pt.y >= 0 && pt.x < board.width && pt.y < board.height
    && (board.profile !== ARDUINO_PROFILE || isArduinoHole(pt));
}
