import { useEffect, useMemo, useRef, useState } from "react";
import { absoluteOccupied, absolutePins } from "./parts";
import { clampZoom, gridToWorld, screenToWorld, worldToGrid, worldToScreen } from "./coords";
import type { Board, GridPt, PartDef, PartInst, Viewport, Wire } from "./types";

type Props = {
  board: Board;
  parts: PartInst[];
  partDefs: PartDef[];
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
const NET_COLORS = ["#51c4ff", "#e5ff66", "#ff8aa8", "#7cff8f", "#ffa94d", "#d8a1ff"];

function colorForNet(netId: string): string {
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
    const xs = occupied.map((pt) => pt.x);
    const ys = occupied.map((pt) => pt.y);
    const minX = Math.min(...xs) - 0.5;
    const maxX = Math.max(...xs) + 0.5;
    const minY = Math.min(...ys) - 0.5;
    const maxY = Math.max(...ys) + 0.5;
    const scale = def.imageScale ?? 1;
    const offsetX = def.imageOffsetX ?? 0;
    const offsetY = def.imageOffsetY ?? 0;
    const topLeft = worldToScreen(
      { x: (minX + offsetX) * CELL_SIZE, y: (minY + offsetY) * CELL_SIZE },
      viewport
    );
    const bottomRight = worldToScreen(
      { x: (maxX + offsetX) * CELL_SIZE, y: (maxY + offsetY) * CELL_SIZE },
      viewport
    );
    const baseW = bottomRight.x - topLeft.x;
    const baseH = bottomRight.y - topLeft.y;
    const drawW = baseW * scale;
    const drawH = baseH * scale;
    const cx = topLeft.x + baseW / 2;
    const cy = topLeft.y + baseH / 2;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(
      partImage,
      cx - drawW / 2,
      cy - drawH / 2,
      drawW,
      drawH
    );
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

export function BoardCanvas({
  board,
  parts,
  partDefs,
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
  const boardPx = useMemo(
    () => ({ width: board.width * CELL_SIZE, height: board.height * CELL_SIZE }),
    [board.height, board.width]
  );

  useEffect(() => {
    for (const def of partDefs) {
      const src = def.imageDataUrl;
      if (!src) continue;
      const cached = imageCacheRef.current.get(def.id);
      if (cached && cached.src === src) continue;
      const img = new Image();
      img.src = src;
      imageCacheRef.current.set(def.id, img);
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

    ctx.fillStyle = "#111822";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.strokeStyle = "#263140";
    ctx.lineWidth = 1;

    for (let x = 0; x <= board.width; x += 1) {
      const worldX = x * CELL_SIZE;
      const from = worldToScreen({ x: worldX, y: 0 }, viewport);
      const to = worldToScreen({ x: worldX, y: boardPx.height }, viewport);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    for (let y = 0; y <= board.height; y += 1) {
      const worldY = y * CELL_SIZE;
      const from = worldToScreen({ x: 0, y: worldY }, viewport);
      const to = worldToScreen({ x: boardPx.width, y: worldY }, viewport);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }

    ctx.strokeStyle = "#5ba4ff";
    ctx.lineWidth = 1.5;
    const topLeft = worldToScreen({ x: 0, y: 0 }, viewport);
    const bottomRight = worldToScreen({ x: boardPx.width, y: boardPx.height }, viewport);
    ctx.strokeRect(
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y
    );

    for (const wire of wires) {
      const color = colorForNet(wire.netId);
      const isSelected = wire.id === selectedWireId;
      drawWirePath(ctx, wire.path, viewport, isSelected ? "#ffd166" : color, isSelected ? "#ffd166" : color, isSelected ? 3.2 : 2.2);
    }

    if (wireDraftPath.length > 0) {
      drawWirePath(ctx, wireDraftPath, viewport, "#ffd166", "#ffd166", 2.4);
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
    boardPx.height,
    boardPx.width,
    hoverGrid,
    movePreviewPart,
    movePreviewValid,
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
