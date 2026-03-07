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
  },
  {
    id: "capacitor_radial",
    name: "Capacitor Radial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 1, y: 0 } }
    ],
    occupied: [
      { x: 0, y: 0 },
      { x: 1, y: 0 }
    ]
  },
  {
    id: "inductor_axial",
    name: "Inductor Axial",
    pins: [
      { name: "1", pos: { x: 0, y: 0 } },
      { name: "2", pos: { x: 3, y: 0 } }
    ],
    occupied: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 }
    ]
  }
];

const defPrefixById: Record<string, string> = {
  resistor_axial: "R",
  capacitor_radial: "C",
  inductor_axial: "L"
};

function newPartId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `part_${Date.now()}`;
}

function nextRefdes(parts: PartInst[], defId: string): string {
  const prefix = defPrefixById[defId] ?? "U";
  const used = parts.filter((part) => part.refdes.startsWith(prefix)).length;
  return `${prefix}${used + 1}`;
}

export function App(): JSX.Element {
  const [tool, setTool] = useState<ToolMode>("place");
  const [activeRot, setActiveRot] = useState<Rot>("Deg0");
  const [parts, setParts] = useState<PartInst[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [moveArmedPartId, setMoveArmedPartId] = useState<string | null>(null);
  const [moveArmedRot, setMoveArmedRot] = useState<Rot | null>(null);
  const [placeArmedDefId, setPlaceArmedDefId] = useState<string | null>(null);
  const [placeArmedRot, setPlaceArmedRot] = useState<Rot>("Deg0");
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);

  const selectedDefId = partDefs[0].id;
  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), []);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const moveArmedPart = parts.find((part) => part.id === moveArmedPartId) ?? null;

  const armPlacement = (defId: string): void => {
    setPlaceArmedDefId(defId);
    setPlaceArmedRot(activeRot);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setSelectedPartId(null);
    setTool("place");
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
    if (moveArmedPartId === selectedPartId) {
      setMoveArmedPartId(null);
      setMoveArmedRot(null);
    }
    setSelectedPartId(null);
  };

  const handleGridClick = (grid: GridPt): void => {
    if (moveArmedPart) {
      const moved: PartInst = {
        ...moveArmedPart,
        at: grid,
        rot: moveArmedRot ?? moveArmedPart.rot
      };
      if (!canPlacePart(board, parts, defsById, moved, moveArmedPart.id)) return;
      setParts((prev) => prev.map((part) => (part.id === moveArmedPart.id ? moved : part)));
      setMoveArmedPartId(null);
      setMoveArmedRot(null);
      setTool("select");
      setSelectedPartId(moved.id);
      return;
    }

    if (placeArmedDefId) {
      const newPart: PartInst = {
        id: newPartId(),
        defId: placeArmedDefId,
        at: grid,
        rot: placeArmedRot,
        refdes: nextRefdes(parts, placeArmedDefId)
      };
      if (!canPlacePart(board, parts, defsById, newPart)) return;
      setParts((prev) => [...prev, newPart]);
      setPlaceArmedDefId(null);
      setSelectedPartId(newPart.id);
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
      refdes: nextRefdes(parts, selectedDefId)
    };
    if (!canPlacePart(board, parts, defsById, newPart)) return;
    setParts((prev) => [...prev, newPart]);
    setSelectedPartId(newPart.id);
    setTool("select");
  };

  const movePreviewPart = useMemo(() => {
    if (!moveArmedPart || !hoverGrid) return null;
    return {
      ...moveArmedPart,
      at: hoverGrid,
      rot: moveArmedRot ?? moveArmedPart.rot
    };
  }, [hoverGrid, moveArmedPart, moveArmedRot]);

  const movePreviewValid = useMemo(() => {
    if (!movePreviewPart || !moveArmedPart) return true;
    return canPlacePart(board, parts, defsById, movePreviewPart, moveArmedPart.id);
  }, [defsById, moveArmedPart, movePreviewPart, parts]);

  const placePreviewPart = useMemo(() => {
    if (!placeArmedDefId || !hoverGrid) return null;
    return {
      id: "__place_preview__",
      defId: placeArmedDefId,
      at: hoverGrid,
      rot: placeArmedRot,
      refdes: ""
    } as PartInst;
  }, [hoverGrid, placeArmedDefId, placeArmedRot]);

  const placePreviewValid = useMemo(() => {
    if (!placePreviewPart) return true;
    return canPlacePart(board, parts, defsById, placePreviewPart);
  }, [defsById, parts, placePreviewPart]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "r") {
        event.preventDefault();
        if (moveArmedPart) {
          if (!hoverGrid) return;
          const currentRot = moveArmedRot ?? moveArmedPart.rot;
          const rotated: PartInst = {
            ...moveArmedPart,
            at: hoverGrid,
            rot: nextRot(currentRot)
          };
          if (!canPlacePart(board, parts, defsById, rotated, moveArmedPart.id)) return;
          setMoveArmedRot(rotated.rot);
          return;
        }

        if (selectedPart) {
          handleRotateSelected();
          return;
        }

        armPlacement("resistor_axial");
        return;
      }

      if (key === "c") {
        event.preventDefault();
        armPlacement("capacitor_radial");
        return;
      }

      if (key === "l") {
        event.preventDefault();
        armPlacement("inductor_axial");
        return;
      }

      if (key === "m") {
        if (!selectedPartId) return;
        event.preventDefault();
        setMoveArmedPartId(selectedPartId);
        setMoveArmedRot(selectedPart?.rot ?? null);
        setPlaceArmedDefId(null);
        setTool("select");
        return;
      }

      if (key === "escape") {
        setMoveArmedPartId(null);
        setMoveArmedRot(null);
        setPlaceArmedDefId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeRot,
    defsById,
    handleRotateSelected,
    hoverGrid,
    moveArmedPart,
    moveArmedRot,
    parts,
    selectedPart,
    selectedPartId
  ]);

  return (
    <main className="app-root">
      <header className="toolbar">
        <h1>uniuni</h1>
        <p>選択中ショートカット: R=回転 / M=移動 / Esc=移動キャンセル | 配置: R/C/L</p>
        <div className="toolbar-row">
          <button
            type="button"
            className={tool === "place" ? "btn active" : "btn"}
            onClick={() => {
              setTool("place");
              setMoveArmedPartId(null);
              setMoveArmedRot(null);
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
              setMoveArmedRot(null);
              setPlaceArmedDefId(null);
            }}
          >
            Select
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const next = nextRot(activeRot);
              setActiveRot(next);
              if (placeArmedDefId) {
                setPlaceArmedRot(next);
              }
            }}
          >
            Rotate Place: {placeArmedDefId ? placeArmedRot : activeRot}
          </button>
          <button type="button" className="btn" onClick={() => armPlacement("resistor_axial")}>
            Arm R
          </button>
          <button type="button" className="btn" onClick={() => armPlacement("capacitor_radial")}>
            Arm C
          </button>
          <button type="button" className="btn" onClick={() => armPlacement("inductor_axial")}>
            Arm L
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
        placePreviewPart={placePreviewPart}
        placePreviewValid={placePreviewValid}
      />
    </main>
  );
}
