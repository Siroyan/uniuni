import { useEffect, useMemo, useState } from "react";
import { BoardCanvas } from "./BoardCanvas";
import { canPlacePart, findPartAtGrid, nextRot } from "./parts";
import type { Board, GridPt, Net, PartDef, PartInst, Rot, ToolMode, Wire } from "./types";

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

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}`;
}

function nextRefdes(parts: PartInst[], defId: string): string {
  const prefix = defPrefixById[defId] ?? "U";
  const used = parts.filter((part) => part.refdes.startsWith(prefix)).length;
  return `${prefix}${used + 1}`;
}

function isAdjacent(a: GridPt, b: GridPt): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function App(): JSX.Element {
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeRot, setActiveRot] = useState<Rot>("Deg0");
  const [parts, setParts] = useState<PartInst[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [nets, setNets] = useState<Net[]>([{ id: "net_1", name: "N-1" }]);
  const [selectedNetId, setSelectedNetId] = useState<string>("net_1");
  const [wireDraftPath, setWireDraftPath] = useState<GridPt[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [moveArmedPartId, setMoveArmedPartId] = useState<string | null>(null);
  const [moveArmedRot, setMoveArmedRot] = useState<Rot | null>(null);
  const [placeArmedDefId, setPlaceArmedDefId] = useState<string | null>(null);
  const [placeArmedRot, setPlaceArmedRot] = useState<Rot>("Deg0");
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);

  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), []);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const moveArmedPart = parts.find((part) => part.id === moveArmedPartId) ?? null;
  const hoveredPartId = useMemo(() => {
    if (!hoverGrid) return null;
    return findPartAtGrid(hoverGrid, parts, defsById);
  }, [defsById, hoverGrid, parts]);

  const armPlacement = (defId: string): void => {
    setPlaceArmedDefId(defId);
    setPlaceArmedRot(activeRot);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setSelectedPartId(null);
    setWireDraftPath([]);
    setTool("place");
  };

  const rotatePartAtCurrentPosition = (partId: string): void => {
    const part = parts.find((candidate) => candidate.id === partId);
    if (!part) return;
    const rotated: PartInst = { ...part, rot: nextRot(part.rot) };
    if (!canPlacePart(board, parts, defsById, rotated, part.id)) return;
    setParts((prev) => prev.map((candidate) => (candidate.id === part.id ? rotated : candidate)));
  };

  const armMoveForPart = (partId: string): void => {
    const part = parts.find((candidate) => candidate.id === partId);
    if (!part) return;
    setMoveArmedPartId(partId);
    setMoveArmedRot(part.rot);
    setPlaceArmedDefId(null);
    setWireDraftPath([]);
    setSelectedPartId(partId);
    setTool("select");
  };

  const commitWireDraft = (): void => {
    if (wireDraftPath.length < 2 || !selectedNetId) return;
    setWires((prev) => [
      ...prev,
      {
        id: newId("wire"),
        netId: selectedNetId,
        path: wireDraftPath
      }
    ]);
    setWireDraftPath([]);
  };

  const addNet = (): void => {
    const newNet: Net = {
      id: newId("net"),
      name: `N-${nets.length + 1}`
    };
    setNets((prev) => [...prev, newNet]);
    setSelectedNetId(newNet.id);
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
    if (tool === "wire") {
      if (!selectedNetId) return;
      const last = wireDraftPath[wireDraftPath.length - 1];
      if (!last) {
        setWireDraftPath([grid]);
        return;
      }
      if (last.x === grid.x && last.y === grid.y) return;
      if (!isAdjacent(last, grid)) return;
      setWireDraftPath((prev) => [...prev, grid]);
      return;
    }

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
        id: newId("part"),
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

    setSelectedPartId(null);
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

      if (key === "enter" && tool === "wire") {
        event.preventDefault();
        commitWireDraft();
        return;
      }

      if (key === "w") {
        event.preventDefault();
        setTool("wire");
        setMoveArmedPartId(null);
        setMoveArmedRot(null);
        setPlaceArmedDefId(null);
        return;
      }

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
          rotatePartAtCurrentPosition(selectedPart.id);
          return;
        }

        if (hoveredPartId) {
          rotatePartAtCurrentPosition(hoveredPartId);
          return;
        }

        if (placeArmedDefId) {
          setPlaceArmedRot((prev) => nextRot(prev));
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
        event.preventDefault();
        if (moveArmedPart) return;
        if (selectedPartId) {
          armMoveForPart(selectedPartId);
          return;
        }
        if (hoveredPartId) {
          armMoveForPart(hoveredPartId);
        }
        return;
      }

      if (key === "escape") {
        setMoveArmedPartId(null);
        setMoveArmedRot(null);
        setPlaceArmedDefId(null);
        setWireDraftPath([]);
        if (tool === "wire") {
          setTool("select");
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeRot,
    defsById,
    hoverGrid,
    hoveredPartId,
    moveArmedPart,
    moveArmedRot,
    parts,
    placeArmedDefId,
    selectedPart,
    selectedPartId,
    tool,
    wireDraftPath,
    selectedNetId
  ]);

  return (
    <main className="app-root">
      <header className="toolbar">
        <h1>uniuni</h1>
        <p>
          Part: R/M/C/L | Wire: Wで開始, クリックで1ステップ追加, Enterで確定, Escで取消
        </p>
        <div className="toolbar-row">
          <button
            type="button"
            className={tool === "place" ? "btn active" : "btn"}
            onClick={() => {
              setTool("place");
              setMoveArmedPartId(null);
              setMoveArmedRot(null);
              setWireDraftPath([]);
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
              setWireDraftPath([]);
            }}
          >
            Select
          </button>
          <button
            type="button"
            className={tool === "wire" ? "btn active" : "btn"}
            onClick={() => {
              setTool("wire");
              setMoveArmedPartId(null);
              setMoveArmedRot(null);
              setPlaceArmedDefId(null);
            }}
          >
            Wire
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
        <div className="toolbar-row">
          <label className="net-label" htmlFor="net-select">
            Net:
          </label>
          <select
            id="net-select"
            className="net-select"
            value={selectedNetId}
            onChange={(event) => setSelectedNetId(event.target.value)}
          >
            {nets.map((net) => (
              <option key={net.id} value={net.id}>
                {net.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={addNet}>
            Add Net
          </button>
          <button type="button" className="btn" onClick={commitWireDraft}>
            Commit Wire
          </button>
          <button type="button" className="btn" onClick={() => setWireDraftPath([])}>
            Cancel Wire
          </button>
        </div>
      </header>
      <BoardCanvas
        board={board}
        parts={parts}
        partDefs={partDefs}
        wires={wires}
        wireDraftPath={wireDraftPath}
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
