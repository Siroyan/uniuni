import { useMemo, useState } from "react";
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

  const selectedDefId = partDefs[0].id;
  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), []);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;

  const handleGridClick = (grid: GridPt): void => {
    if (tool === "place") {
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
      return;
    }

    const clickedPartId = findPartAtGrid(grid, parts, defsById);
    if (clickedPartId) {
      setSelectedPartId(clickedPartId);
      return;
    }

    if (!selectedPart) return;
    const moved: PartInst = { ...selectedPart, at: grid };
    if (!canPlacePart(board, parts, defsById, moved, selectedPart.id)) return;
    setParts((prev) => prev.map((part) => (part.id === selectedPart.id ? moved : part)));
  };

  const handleRotateSelected = (): void => {
    if (!selectedPart) return;
    const rotated: PartInst = { ...selectedPart, rot: nextRot(selectedPart.rot) };
    if (!canPlacePart(board, parts, defsById, rotated, selectedPart.id)) return;
    setParts((prev) => prev.map((part) => (part.id === selectedPart.id ? rotated : part)));
  };

  const handleDeleteSelected = (): void => {
    if (!selectedPartId) return;
    setParts((prev) => prev.filter((part) => part.id !== selectedPartId));
    setSelectedPartId(null);
  };

  return (
    <main className="app-root">
      <header className="toolbar">
        <h1>uniuni</h1>
        <p>Step1: part placement / select / move / rotate / delete</p>
        <div className="toolbar-row">
          <button
            type="button"
            className={tool === "place" ? "btn active" : "btn"}
            onClick={() => setTool("place")}
          >
            Place
          </button>
          <button
            type="button"
            className={tool === "select" ? "btn active" : "btn"}
            onClick={() => setTool("select")}
          >
            Select/Move
          </button>
          <button type="button" className="btn" onClick={() => setActiveRot((prev) => nextRot(prev))}>
            Rotate Place: {activeRot}
          </button>
          <button type="button" className="btn" onClick={handleRotateSelected}>
            Rotate Selected
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
      />
    </main>
  );
}
