import { useEffect, useMemo, useState } from "react";
import { BoardCanvas } from "./BoardCanvas";
import { canPlacePart, findPartAtGrid, nextRot } from "./parts";
import type { Board, GridPt, PartDef, PartInst, Rot, ToolMode } from "./types";

const board: Board = {
  width: 64,
  height: 40,
  gridPitchMm: 2.54
};

const partDefs: PartDef[] = [
  {
    id: "resistor_axial",
    name: "Resistor Axial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 2, y: 0 } }
    ],
    occupied: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ]
  }
];

function newPartId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `part_${Date.now()}`;
}

export function App(): JSX.Element {
  const [tool, setTool] = useState<ToolMode>("place");
  const [activeRot, setActiveRot] = useState<Rot>("Deg0");
  const [parts, setParts] = useState<PartInst[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [moveArmedPartId, setMoveArmedPartId] = useState<string | null>(null);
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);

  const selectedDefId = partDefs[0].id;
  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), []);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const moveArmedPart = parts.find((part) => part.id === moveArmedPartId) ?? null;

  const handleRotateSelected = (): void => {
    if (!selectedPart) return;
    const rotated: PartInst = { ...selectedPart, rot: nextRot(selectedPart.rot) };
    if (!canPlacePart(board, parts, defsById, rotated, selectedPart.id)) return;
    setParts((prev) => prev.map((part) => (part.id === selectedPart.id ? rotated : part)));
  };

  const handleDeleteSelected = (): void => {
    if (!selectedPartId) return;
    setParts((prev) => prev.filter((part) => part.id !== selectedPartId));
    if (moveArmedPartId === selectedPartId) {
      setMoveArmedPartId(null);
    }
    setSelectedPartId(null);
  };

  const handleGridClick = (grid: GridPt): void => {
    if (moveArmedPart) {
      const moved: PartInst = { ...moveArmedPart, at: grid };
      if (!canPlacePart(board, parts, defsById, moved, moveArmedPart.id)) return;
      setParts((prev) => prev.map((part) => (part.id === moveArmedPart.id ? moved : part)));
      setMoveArmedPartId(null);
      setTool("select");
      return;
    }

    const clickedPartId = findPartAtGrid(grid, parts, defsById);
    if (clickedPartId) {
      setSelectedPartId(clickedPartId);
      return;
    }

    if (tool !== "place") {
      setSelectedPartId(null);
      return;
    }

    const newPart: PartInst = {
      id: newPartId(),
      defId: selectedDefId,
      at: grid,
      rot: activeRot,
      refdes: `R${parts.length + 1}`
    };
    if (!canPlacePart(board, parts, defsById, newPart)) return;
    setParts((prev) => [...prev, newPart]);
    setSelectedPartId(newPart.id);
    setTool("select");
  };

  const movePreviewPart = useMemo(() => {
    if (!moveArmedPart || !hoverGrid) return null;
    return { ...moveArmedPart, at: hoverGrid };
  }, [hoverGrid, moveArmedPart]);

  const movePreviewValid = useMemo(() => {
    if (!movePreviewPart || !moveArmedPart) return true;
    return canPlacePart(board, parts, defsById, movePreviewPart, moveArmedPart.id);
  }, [defsById, moveArmedPart, movePreviewPart, parts]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        handleRotateSelected();
      }

      if (key === "m") {
        if (!selectedPartId) return;
        event.preventDefault();
        setMoveArmedPartId(selectedPartId);
        setTool("select");
      }

      if (key === "escape") {
        setMoveArmedPartId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleRotateSelected, selectedPartId]);

  return (
    <main className="app-root">
      <header className="toolbar">
        <h1>uniuni</h1>
        <p>選択中ショートカット: R=回転 / M=移動 / Esc=移動キャンセル</p>
        <div className="toolbar-row">
          <button
            type="button"
            className={tool === "place" ? "btn active" : "btn"}
            onClick={() => {
              setTool("place");
              setMoveArmedPartId(null);
            }}
          >
            Place
          </button>
          <button
            type="button"
            className={tool === "select" ? "btn active" : "btn"}
            onClick={() => {
              setTool("select");
              setMoveArmedPartId(null);
            }}
          >
            Select
          </button>
          <button type="button" className="btn" onClick={() => setActiveRot((prev) => nextRot(prev))}>
            Rotate Place: {activeRot}
          </button>
          <button type="button" className="btn danger" onClick={handleDeleteSelected}>
            Delete Selected
          </button>
        </div>
      </header>
      <BoardCanvas
        board={board}
        parts={parts}
        partDefs={partDefs}
        selectedPartId={selectedPartId}
        onGridClick={handleGridClick}
        onHoverGridChange={setHoverGrid}
        movePreviewPart={movePreviewPart}
        movePreviewValid={movePreviewValid}
      />
    </main>
  );
}
