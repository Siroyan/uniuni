import { useEffect, useMemo, useRef, useState } from "react";
import { absoluteOccupied, absolutePins } from "./parts";
import { clampZoom, gridToWorld, screenToWorld, worldToGrid, worldToScreen } from "./coords";
import type { Board, GridPt, PartDef, PartInst, Viewport } from "./types";

type Props = {
  board: Board;
  parts: PartInst[];
  partDefs: PartDef[];
  selectedPartId: string | null;
  onGridClick: (grid: GridPt) => void;
};

const CELL_SIZE = 24;

export function BoardCanvas({
  board,
  parts,
  partDefs,
  selectedPartId,
  onGridClick
}: Props): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

    for (const part of parts) {
      const def = partDefMap.get(part.defId);
      if (!def) continue;

      const isSelected = part.id === selectedPartId;
      ctx.fillStyle = isSelected ? "rgba(255, 209, 102, 0.5)" : "rgba(91, 164, 255, 0.45)";
      for (const cell of absoluteOccupied(def, part)) {
        const base = worldToScreen(gridToWorld(cell, CELL_SIZE), viewport);
        const unit = CELL_SIZE * viewport.zoom;
        ctx.fillRect(base.x - unit / 2, base.y - unit / 2, unit, unit);
      }

      ctx.fillStyle = "#ff9f1c";
      for (const pin of absolutePins(def, part)) {
        const p = worldToScreen(gridToWorld(pin, CELL_SIZE), viewport);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(3, viewport.zoom * 2.5), 0, Math.PI * 2);
        ctx.fill();
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
    partDefMap,
    parts,
    selectedPartId,
    viewport
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
      setHoverGrid(worldToGrid(world, CELL_SIZE));

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
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [onGridClick, viewport]);

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
