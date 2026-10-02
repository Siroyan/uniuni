import { useEffect, useMemo, useRef, useState } from "react";
import { absoluteOccupied, absolutePins } from "./parts";
import { clampZoom, gridToWorld, screenToWorld, worldToGrid, worldToScreen } from "./coords";
import type { Board, GridPt, Net, PartDef, PartInst, Viewport, Wire } from "./types";

type Props = {
  board: Board;
  parts: PartInst[];
  partDefs: PartDef[];
  nets: Net[];
  wires: Wire[];
  selectedWireId: string | null;
  wireDraftPath: GridPt[];
  selectedPartId: string | null;
  onGridClick: (grid: GridPt) => void;
  onHoverGridChange: (grid: GridPt | null) => void;
  movePreviewPart: PartInst | null;
  movePreviewValid: boolean;
  placePreviewPart: PartInst | null;
  placePreviewValid: boolean;
};

const CELL_SIZE = 24;
const BOARD_MARGIN_CELLS = 2.3;
const NET_COLORS = ["#51c4ff", "#e5ff66", "#ff8aa8", "#7cff8f", "#ffa94d", "#d8a1ff"];
const AKIZUKI_B_LEGACY_GRID_WIDTH = 37;
const AKIZUKI_B_LEGACY_GRID_HEIGHT = 28;
const AKIZUKI_B_GRID_WIDTH = 36;
const AKIZUKI_B_GRID_HEIGHT = 27;
const AKIZUKI_B_THROUGH_HOLE_COLS = 36;
const AKIZUKI_B_THROUGH_HOLE_ROWS = 27;
const AKIZUKI_B_MOUNT_HOLE_DIAMETER_MM = 3.2;

function colorForNet(netId: string, explicitColor?: string | null): string {
  if (explicitColor) return explicitColor;
  let hash = 0;
  for (let i = 0; i < netId.length; i += 1) {
    hash = (hash * 31 + netId.charCodeAt(i)) >>> 0;
  }
  return NET_COLORS[hash % NET_COLORS.length];
}

function drawWirePath(
  ctx: CanvasRenderingContext2D,
  path: GridPt[],
  viewport: Viewport,
  stroke: string,
  point: string,
  width = 2
): void {
  if (path.length < 1) return;

  if (path.length > 1) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    const start = worldToScreen(gridToWorld(path[0], CELL_SIZE), viewport);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < path.length; i += 1) {
      const p = worldToScreen(gridToWorld(path[i], CELL_SIZE), viewport);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = point;
  for (const pt of path) {
    const p = worldToScreen(gridToWorld(pt, CELL_SIZE), viewport);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(2.5, viewport.zoom * 2), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  part: PartInst,
  def: PartDef,
  viewport: Viewport,
  fillColor: string,
  pinColor: string,
  partImage: HTMLImageElement | null
): void {
  const occupied = absoluteOccupied(def, part);

  ctx.fillStyle = fillColor;
  for (const cell of occupied) {
    const base = worldToScreen(gridToWorld(cell, CELL_SIZE), viewport);
    const unit = CELL_SIZE * viewport.zoom;
    ctx.fillRect(base.x - unit / 2, base.y - unit / 2, unit, unit);
  }

  if (partImage && occupied.length > 0) {
    const relXs = def.occupied.map((pt) => pt.x);
    const relYs = def.occupied.map((pt) => pt.y);
    const minRelX = Math.min(...relXs);
    const maxRelX = Math.max(...relXs);
    const minRelY = Math.min(...relYs);
    const maxRelY = Math.max(...relYs);
    const scale = def.imageScale ?? 1;
    const offsetX = def.imageOffsetX ?? 0;
    const offsetY = def.imageOffsetY ?? 0;

    const centerRelX = (minRelX + maxRelX) / 2 + offsetX;
    const centerRelY = (minRelY + maxRelY) / 2 + offsetY;
    const rotatedCenter =
      part.rot === "Deg90"
        ? { x: -centerRelY, y: centerRelX }
        : part.rot === "Deg180"
          ? { x: -centerRelX, y: -centerRelY }
          : part.rot === "Deg270"
            ? { x: centerRelY, y: -centerRelX }
            : { x: centerRelX, y: centerRelY };

    const center = worldToScreen(
      {
        x: (part.at.x + rotatedCenter.x) * CELL_SIZE,
        y: (part.at.y + rotatedCenter.y) * CELL_SIZE
      },
      viewport
    );

    const baseW = (maxRelX - minRelX + 1) * CELL_SIZE * viewport.zoom;
    const baseH = (maxRelY - minRelY + 1) * CELL_SIZE * viewport.zoom;
    const drawW = baseW * scale;
    const drawH = baseH * scale;
    const rotationRad =
      part.rot === "Deg90"
        ? Math.PI / 2
        : part.rot === "Deg180"
          ? Math.PI
          : part.rot === "Deg270"
            ? (Math.PI * 3) / 2
            : 0;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.translate(center.x, center.y);
    ctx.rotate(rotationRad);
    ctx.drawImage(partImage, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  ctx.fillStyle = pinColor;
  for (const pin of absolutePins(def, part)) {
    const p = worldToScreen(gridToWorld(pin, CELL_SIZE), viewport);
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(3, viewport.zoom * 2.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

function isAkizukiBBoard(board: Board): boolean {
  const isCurrent =
    board.width === AKIZUKI_B_GRID_WIDTH && board.height === AKIZUKI_B_GRID_HEIGHT;
  const isLegacy =
    board.width === AKIZUKI_B_LEGACY_GRID_WIDTH &&
    board.height === AKIZUKI_B_LEGACY_GRID_HEIGHT;
  return (
    (isCurrent || isLegacy) &&
    Math.abs(board.gridPitchMm - 2.54) < 0.001
  );
}

type HolePt = { x: number; y: number };

function holeKey(pt: HolePt): string {
  return `${pt.x},${pt.y}`;
}

function buildAkizukiBHoleLayout(): { throughHoles: HolePt[]; mountHoles: HolePt[] } {
  const allHoles: HolePt[] = [];
  for (let y = 0; y < AKIZUKI_B_THROUGH_HOLE_ROWS; y += 1) {
    for (let x = 0; x < AKIZUKI_B_THROUGH_HOLE_COLS; x += 1) {
      allHoles.push({ x, y });
    }
  }

  const mountHoles: HolePt[] = [
    { x: 0, y: 0 },
    { x: AKIZUKI_B_THROUGH_HOLE_COLS - 1, y: 0 },
    { x: 0, y: AKIZUKI_B_THROUGH_HOLE_ROWS - 1 },
    { x: AKIZUKI_B_THROUGH_HOLE_COLS - 1, y: AKIZUKI_B_THROUGH_HOLE_ROWS - 1 }
  ];

  const removed = new Set<string>();
  for (const mount of mountHoles) {
    removed.add(holeKey(mount));
    const orthogonalNeighbors: HolePt[] = [
      { x: mount.x - 1, y: mount.y },
      { x: mount.x + 1, y: mount.y },
      { x: mount.x, y: mount.y - 1 },
      { x: mount.x, y: mount.y + 1 }
    ];
    for (const neighbor of orthogonalNeighbors) {
      if (
        neighbor.x < 0 ||
        neighbor.y < 0 ||
        neighbor.x >= AKIZUKI_B_THROUGH_HOLE_COLS ||
        neighbor.y >= AKIZUKI_B_THROUGH_HOLE_ROWS
      ) {
        continue;
      }
      removed.add(holeKey(neighbor));
    }
  }

  return {
    throughHoles: allHoles.filter((hole) => !removed.has(holeKey(hole))),
    mountHoles
  };
}

const AKIZUKI_B_HOLE_LAYOUT = buildAkizukiBHoleLayout();

export function BoardCanvas({
  board,
  parts,
  partDefs,
  nets,
  wires,
  selectedWireId,
  wireDraftPath,
  selectedPartId,
  onGridClick,
  onHoverGridChange,
  movePreviewPart,
  movePreviewValid,
  placePreviewPart,
  placePreviewValid
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const [viewport, setViewport] = useState<Viewport>({
    panX: 120,
    panY: 80,
    zoom: 1
  });
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);

  const partDefMap = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), [partDefs]);
  const netColorMap = useMemo(
    () => new Map(nets.map((net) => [net.id, net.color ?? null])),
    [nets]
  );
  const gridMaxWorld = useMemo(
    () => ({
      x: Math.max(0, (board.width - 1) * CELL_SIZE),
      y: Math.max(0, (board.height - 1) * CELL_SIZE)
    }),
    [board.height, board.width]
  );

  useEffect(() => {
    const cache = imageCacheRef.current;
    const defIds = new Set(partDefs.map((def) => def.id));

    for (const def of partDefs) {
      const src = def.imageDataUrl;
      if (!src) {
        cache.delete(def.id);
        continue;
      }
      const cached = cache.get(def.id);
      if (cached && cached.src === src) continue;
      const img = new Image();
      img.src = src;
      cache.set(def.id, img);
    }

    for (const id of Array.from(cache.keys())) {
      if (!defIds.has(id)) {
        cache.delete(id);
      }
    }
  }, [partDefs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.floor(rect.width * dpr);
    const height = Math.floor(rect.height * dpr);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = "#0d131b";
    ctx.fillRect(0, 0, rect.width, rect.height);

    const isBBoard = isAkizukiBBoard(board);
    const boardWorldBounds = isBBoard
      ? (() => {
          const mountXs = AKIZUKI_B_HOLE_LAYOUT.mountHoles.map((hole) => hole.x * CELL_SIZE);
          const mountYs = AKIZUKI_B_HOLE_LAYOUT.mountHoles.map((hole) => hole.y * CELL_SIZE);
          const edgeMarginWorld = (3 / board.gridPitchMm) * CELL_SIZE;
          return {
            left: Math.min(...mountXs) - edgeMarginWorld,
            top: Math.min(...mountYs) - edgeMarginWorld,
            right: Math.max(...mountXs) + edgeMarginWorld,
            bottom: Math.max(...mountYs) + edgeMarginWorld
          };
        })()
      : {
          left: -CELL_SIZE * BOARD_MARGIN_CELLS,
          top: -CELL_SIZE * BOARD_MARGIN_CELLS,
          right: gridMaxWorld.x + CELL_SIZE * BOARD_MARGIN_CELLS,
          bottom: gridMaxWorld.y + CELL_SIZE * BOARD_MARGIN_CELLS
        };
    // Draw board edge with an outer margin around the wiring grid.
    const topLeft = worldToScreen({ x: boardWorldBounds.left, y: boardWorldBounds.top }, viewport);
    const bottomRight = worldToScreen(
      { x: boardWorldBounds.right, y: boardWorldBounds.bottom },
      viewport
    );
    const boardScreenWidth = bottomRight.x - topLeft.x;
    const boardScreenHeight = bottomRight.y - topLeft.y;

    if (boardScreenWidth > 0 && boardScreenHeight > 0) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
      ctx.fillRect(topLeft.x + 4, topLeft.y + 6, boardScreenWidth, boardScreenHeight);

      const boardGrad = ctx.createLinearGradient(topLeft.x, topLeft.y, topLeft.x, bottomRight.y);
      boardGrad.addColorStop(0, "#f2d297");
      boardGrad.addColorStop(1, "#f2d297");
      ctx.fillStyle = boardGrad;
      ctx.fillRect(topLeft.x, topLeft.y, boardScreenWidth, boardScreenHeight);

      const worldTopLeft = screenToWorld({ x: 0, y: 0 }, viewport);
      const worldBottomRight = screenToWorld({ x: rect.width, y: rect.height }, viewport);
      const worldMinX = Math.min(worldTopLeft.x, worldBottomRight.x);
      const worldMaxX = Math.max(worldTopLeft.x, worldBottomRight.x);
      const worldMinY = Math.min(worldTopLeft.y, worldBottomRight.y);
      const worldMaxY = Math.max(worldTopLeft.y, worldBottomRight.y);
      const startX = Math.max(0, Math.floor(worldMinX / CELL_SIZE) - 2);
      const endX = Math.min(board.width - 1, Math.ceil(worldMaxX / CELL_SIZE) + 2);
      const startY = Math.max(0, Math.floor(worldMinY / CELL_SIZE) - 2);
      const endY = Math.min(board.height - 1, Math.ceil(worldMaxY / CELL_SIZE) + 2);

      const ringRadius = Math.max(2.4, viewport.zoom * 7.6);
      const holeRadius = Math.max(1.6, viewport.zoom * 3.4);

      const drawThroughHole = (gridX: number, gridY: number): void => {
        const center = worldToScreen({ x: gridX * CELL_SIZE, y: gridY * CELL_SIZE }, viewport);
        ctx.fillStyle = "#c4c9d1";
        ctx.beginPath();
        ctx.arc(center.x, center.y, ringRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#a8afbb";
        ctx.beginPath();
        ctx.arc(center.x, center.y, holeRadius, 0, Math.PI * 2);
        ctx.fill();
      };

      if (isBBoard) {
        for (const hole of AKIZUKI_B_HOLE_LAYOUT.throughHoles) {
          if (hole.x < startX || hole.x > endX || hole.y < startY || hole.y > endY) continue;
          drawThroughHole(hole.x, hole.y);
        }
      } else {
        for (let y = startY; y <= endY; y += 1) {
          for (let x = startX; x <= endX; x += 1) {
            drawThroughHole(x, y);
          }
        }
      }

      // Draw M3 mounting holes.
      const gridTopLeft = worldToScreen({ x: 0, y: 0 }, viewport);
      const gridBottomRight = worldToScreen({ x: gridMaxWorld.x, y: gridMaxWorld.y }, viewport);
      const marginLeft = Math.max(0, gridTopLeft.x - topLeft.x);
      const marginRight = Math.max(0, bottomRight.x - gridBottomRight.x);
      const marginTop = Math.max(0, gridTopLeft.y - topLeft.y);
      const marginBottom = Math.max(0, bottomRight.y - gridBottomRight.y);
      const minMargin = Math.max(0, Math.min(marginLeft, marginRight, marginTop, marginBottom));
      const mountDiameterMm = isBBoard ? AKIZUKI_B_MOUNT_HOLE_DIAMETER_MM : 3;
      const radiusFromMm = Math.max(
        2.5,
        ((mountDiameterMm / board.gridPitchMm) * CELL_SIZE * viewport.zoom) / 2
      );
      const mountHoleRadius = isBBoard
        ? radiusFromMm
        : Math.min(radiusFromMm, Math.max(2.5, minMargin * 0.42));
      const mountCenters = isBBoard
        ? AKIZUKI_B_HOLE_LAYOUT.mountHoles.map((hole) =>
            worldToScreen({ x: hole.x * CELL_SIZE, y: hole.y * CELL_SIZE }, viewport)
          )
        : [
            { x: (topLeft.x + gridTopLeft.x) / 2, y: (topLeft.y + gridTopLeft.y) / 2 },
            { x: (bottomRight.x + gridBottomRight.x) / 2, y: (topLeft.y + gridTopLeft.y) / 2 },
            { x: (topLeft.x + gridTopLeft.x) / 2, y: (bottomRight.y + gridBottomRight.y) / 2 },
            { x: (bottomRight.x + gridBottomRight.x) / 2, y: (bottomRight.y + gridBottomRight.y) / 2 }
          ];
      for (const center of mountCenters) {
        ctx.fillStyle = "#ded3bd";
        ctx.beginPath();
        ctx.arc(center.x, center.y, mountHoleRadius + 0.8, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#8d93a0";
        ctx.beginPath();
        ctx.arc(center.x, center.y, mountHoleRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = "#cfc5ad";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(topLeft.x, topLeft.y, boardScreenWidth, boardScreenHeight);
    }

    for (const wire of wires) {
      const color = colorForNet(wire.netId, netColorMap.get(wire.netId) ?? null);
      const isSelected = wire.id === selectedWireId;
      drawWirePath(
        ctx,
        wire.path,
        viewport,
        isSelected ? "#ffd166" : color,
        isSelected ? "#ffd166" : color,
        isSelected ? 4.6 : 3.6
      );
    }

    if (wireDraftPath.length > 0) {
      drawWirePath(ctx, wireDraftPath, viewport, "#ffd166", "#ffd166", 3.8);
    }

    for (const part of parts) {
      const def = partDefMap.get(part.defId);
      if (!def) continue;
      const isSelected = part.id === selectedPartId;
      drawPart(
        ctx,
        part,
        def,
        viewport,
        isSelected ? "rgba(255, 209, 102, 0.5)" : "rgba(91, 164, 255, 0.45)",
        "#ff9f1c",
        imageCacheRef.current.get(def.id) ?? null
      );
    }

    if (movePreviewPart) {
      const def = partDefMap.get(movePreviewPart.defId);
      if (def) {
        drawPart(
          ctx,
          movePreviewPart,
          def,
          viewport,
          movePreviewValid ? "rgba(102, 217, 125, 0.35)" : "rgba(217, 102, 102, 0.4)",
          movePreviewValid ? "#6fe893" : "#ff9090",
          imageCacheRef.current.get(def.id) ?? null
        );
      }
    }

    if (placePreviewPart) {
      const def = partDefMap.get(placePreviewPart.defId);
      if (def) {
        drawPart(
          ctx,
          placePreviewPart,
          def,
          viewport,
          placePreviewValid ? "rgba(102, 217, 125, 0.28)" : "rgba(217, 102, 102, 0.35)",
          placePreviewValid ? "#99f2b0" : "#ffb0b0",
          imageCacheRef.current.get(def.id) ?? null
        );
      }
    }

    if (hoverGrid) {
      const snappedWorld = gridToWorld(hoverGrid, CELL_SIZE);
      const snapped = worldToScreen(snappedWorld, viewport);
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();
      ctx.arc(snapped.x, snapped.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    board.height,
    board.width,
    gridMaxWorld.x,
    gridMaxWorld.y,
    hoverGrid,
    movePreviewPart,
    movePreviewValid,
    netColorMap,
    partDefMap,
    parts,
    placePreviewPart,
    placePreviewValid,
    selectedPartId,
    viewport,
    wireDraftPath,
    wires
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button === 0) {
        const rect = canvas.getBoundingClientRect();
        const world = screenToWorld(
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
          viewport
        );
        onGridClick(worldToGrid(world, CELL_SIZE));
        return;
      }

      if (event.button !== 1 && event.button !== 2) return;
      isPanning = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const rect = canvas.getBoundingClientRect();
      const world = screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        viewport
      );
      const snapped = worldToGrid(world, CELL_SIZE);
      setHoverGrid(snapped);
      onHoverGridChange(snapped);

      if (!isPanning) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      setViewport((prev) => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
    };

    const onPointerUp = (event: PointerEvent): void => {
      if (!isPanning) return;
      isPanning = false;
      canvas.releasePointerCapture(event.pointerId);
    };

    const onPointerLeave = (): void => {
      setHoverGrid(null);
      onHoverGridChange(null);
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setViewport((prev) => {
        const nextZoom = clampZoom(prev.zoom * (event.deltaY > 0 ? 0.9 : 1.1));
        const wx = (anchor.x - prev.panX) / prev.zoom;
        const wy = (anchor.y - prev.panY) / prev.zoom;
        return {
          zoom: nextZoom,
          panX: anchor.x - wx * nextZoom,
          panY: anchor.y - wy * nextZoom
        };
      });
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [onGridClick, onHoverGridChange, viewport]);

  return (
    <section className="canvas-wrap">
      <canvas ref={canvasRef} className="board-canvas" />
      <div className="hud">
        <div>grid: {hoverGrid ? `${hoverGrid.x}, ${hoverGrid.y}` : "-"}</div>
        <div>zoom: {viewport.zoom.toFixed(2)}x</div>
      </div>
    </section>
  );
}
