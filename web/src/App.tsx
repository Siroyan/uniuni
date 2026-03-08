import { useEffect, useMemo, useRef, useState } from "react";
import { BoardCanvas } from "./BoardCanvas";
import {
  applyCoreCommandJson,
  commandAddPartInstJson,
  commandAssignNetNameJson,
  commandAssignPinToNetJson,
  commandCommitWireJson,
  commandDeletePartInstJson,
  commandDeleteWireJson,
  commandMovePartInstJson,
  commandRotatePartInstJson,
  createInitialCoreStateJson,
  extractViewStateFromCoreJson,
  newUuid,
  runCoreDrcJson
} from "./coreBridge";
import { canPlacePart, findPartAtGrid, nextRot } from "./parts";
import { loadSnapshot, saveSnapshot } from "./persistence";
import type { Board, DrcIssue, GridPt, Net, PartDef, PartInst, Rot, ToolMode, Wire } from "./types";

const board: Board = {
  width: 64,
  height: 40,
  gridPitchMm: 2.54
};

const partDefs: PartDef[] = [
  {
    id: "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1",
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
    id: "f222f718-6ff6-42a6-b2ba-4c62090d8ca5",
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
    id: "01d260e9-ea3a-488f-9e8a-031ca0d679ce",
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
  "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1": "R",
  "f222f718-6ff6-42a6-b2ba-4c62090d8ca5": "C",
  "01d260e9-ea3a-488f-9e8a-031ca0d679ce": "L"
};

function nextRefdes(parts: PartInst[], defId: string): string {
  const prefix = defPrefixById[defId] ?? "U";
  const used = parts.filter((part) => part.refdes.startsWith(prefix)).length;
  return `${prefix}${used + 1}`;
}

function isAdjacent(a: GridPt, b: GridPt): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function findAddedPartId(before: PartInst[], after: PartInst[]): string | null {
  const prev = new Set(before.map((part) => part.id));
  for (const part of after) {
    if (!prev.has(part.id)) return part.id;
  }
  return null;
}

function findWireAtGrid(pt: GridPt, wires: Wire[]): string | null {
  for (let i = wires.length - 1; i >= 0; i -= 1) {
    const wire = wires[i];
    if (wire.path.some((node) => node.x === pt.x && node.y === pt.y)) {
      return wire.id;
    }
  }
  return null;
}

type HistoryEntry = {
  stateJson: string;
  selectedPartId: string | null;
  selectedWireId: string | null;
};

export function App(): JSX.Element {
  const [tool, setTool] = useState<ToolMode>("select");
  const [activeRot, setActiveRot] = useState<Rot>("Deg0");
  const [parts, setParts] = useState<PartInst[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [nets, setNets] = useState<Net[]>(() => [{ id: newUuid(), name: "N-1" }]);
  const [selectedNetId, setSelectedNetId] = useState<string>(() => nets[0]?.id ?? "");
  const [netNameDraft, setNetNameDraft] = useState<string>("");
  const [pinNameDraft, setPinNameDraft] = useState<string>("");
  const [wireDraftPath, setWireDraftPath] = useState<GridPt[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [moveArmedPartId, setMoveArmedPartId] = useState<string | null>(null);
  const [moveArmedRot, setMoveArmedRot] = useState<Rot | null>(null);
  const [placeArmedDefId, setPlaceArmedDefId] = useState<string | null>(null);
  const [placeArmedRot, setPlaceArmedRot] = useState<Rot>("Deg0");
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);
  const [coreStateJson, setCoreStateJson] = useState<string | null>(null);
  const [coreBridgeMode, setCoreBridgeMode] = useState<"native_or_fallback" | "unknown">("unknown");
  const [drcIssues, setDrcIssues] = useState<DrcIssue[]>([]);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [historyPast, setHistoryPast] = useState<HistoryEntry[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistoryEntry[]>([]);
  const coreStateJsonRef = useRef<string | null>(null);
  const selectedPartIdRef = useRef<string | null>(null);
  const selectedWireIdRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), []);
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const selectedPartDef = selectedPart ? defsById.get(selectedPart.defId) ?? null : null;
  const moveArmedPart = parts.find((part) => part.id === moveArmedPartId) ?? null;
  const hoveredPartId = useMemo(() => {
    if (!hoverGrid) return null;
    return findPartAtGrid(hoverGrid, parts, defsById);
  }, [defsById, hoverGrid, parts]);

  useEffect(() => {
    coreStateJsonRef.current = coreStateJson;
  }, [coreStateJson]);

  useEffect(() => {
    selectedPartIdRef.current = selectedPartId;
  }, [selectedPartId]);

  useEffect(() => {
    selectedWireIdRef.current = selectedWireId;
  }, [selectedWireId]);

  useEffect(() => {
    if (nets.length === 0) {
      setSelectedNetId("");
      return;
    }
    if (!nets.some((net) => net.id === selectedNetId)) {
      setSelectedNetId(nets[0].id);
    }
  }, [nets, selectedNetId]);

  useEffect(() => {
    if (!selectedNetId) {
      setNetNameDraft("");
      return;
    }
    const selected = nets.find((net) => net.id === selectedNetId);
    setNetNameDraft(selected?.name ?? "");
  }, [nets, selectedNetId]);

  useEffect(() => {
    if (!selectedPartDef || selectedPartDef.pins.length === 0) {
      setPinNameDraft("");
      return;
    }
    if (!selectedPartDef.pins.some((pin) => pin.name === pinNameDraft)) {
      setPinNameDraft(selectedPartDef.pins[0].name);
    }
  }, [pinNameDraft, selectedPartDef]);

  const syncFromCoreState = (nextState: string): { parts: PartInst[]; wires: Wire[]; nets: Net[] } => {
    const view = extractViewStateFromCoreJson(nextState);
    setCoreStateJson(nextState);
    setParts(view.parts);
    setWires(view.wires);
    setNets(view.nets);
    return view;
  };

  const resolveSelectedPartId = (
    partsInState: PartInst[],
    candidate: string | null
  ): string | null => {
    if (!candidate) return null;
    return partsInState.some((part) => part.id === candidate) ? candidate : null;
  };

  const resolveSelectedWireId = (
    wiresInState: Wire[],
    candidate: string | null
  ): string | null => {
    if (!candidate) return null;
    return wiresInState.some((wire) => wire.id === candidate) ? candidate : null;
  };

  const commitStateTransition = (prevState: string, nextState: string): { parts: PartInst[]; wires: Wire[]; nets: Net[] } => {
    const view = syncFromCoreState(nextState);
    if (prevState !== nextState) {
      setHistoryPast((prev) => [
        ...prev.slice(-99),
        {
          stateJson: prevState,
          selectedPartId: selectedPartIdRef.current,
          selectedWireId: selectedWireIdRef.current
        }
      ]);
      setHistoryFuture([]);
    }
    const resolvedSelected = resolveSelectedPartId(view.parts, selectedPartIdRef.current);
    const resolvedWire = resolveSelectedWireId(view.wires, selectedWireIdRef.current);
    setSelectedPartId(resolvedSelected);
    setSelectedWireId(resolvedWire);
    return view;
  };

  const refreshDrcForState = async (stateJson: string): Promise<void> => {
    const drcJson = await runCoreDrcJson(stateJson);
    setDrcIssues(JSON.parse(drcJson) as DrcIssue[]);
  };

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  useEffect(() => {
    let cancelled = false;
    const init = async (): Promise<void> => {
      try {
        const snapshot = await loadSnapshot();
        let nextState: string;
        let nextSelectedNetId = selectedNetId;
        if (snapshot?.coreStateJson) {
          nextState = snapshot.coreStateJson;
          nextSelectedNetId = snapshot.selectedNetId ?? "";
        } else {
          nextState = await createInitialCoreStateJson(board, partDefs);
          for (const net of nets) {
            nextState = await applyCoreCommandJson(nextState, commandAssignNetNameJson(net.id, net.name));
          }
        }
        if (cancelled) return;
        const view = syncFromCoreState(nextState);
        if (nextSelectedNetId && view.nets.some((net) => net.id === nextSelectedNetId)) {
          setSelectedNetId(nextSelectedNetId);
        } else if (view.nets.length > 0) {
          setSelectedNetId(view.nets[0].id);
        }
        setHistoryPast([]);
        setHistoryFuture([]);
        setCoreBridgeMode("native_or_fallback");
        const drcJson = await runCoreDrcJson(nextState);
        if (!cancelled) {
          setDrcIssues(JSON.parse(drcJson) as DrcIssue[]);
        }
      } catch (err) {
        if (cancelled) return;
        setCoreError(err instanceof Error ? err.message : "failed to initialize core bridge");
      }
    };

    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!coreStateJson) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          await saveSnapshot({
            schemaVersion: 1,
            coreStateJson,
            selectedNetId
          });
        } catch {
          if (!cancelled) {
            setCoreError("indexeddb save failed");
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [coreStateJson, selectedNetId]);

  const armPlacement = (defId: string): void => {
    setPlaceArmedDefId(defId);
    setPlaceArmedRot(activeRot);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setSelectedPartId(null);
    setSelectedWireId(null);
    setWireDraftPath([]);
    setTool("place");
  };

  const rotatePartAtCurrentPosition = (partId: string): void => {
    const part = parts.find((candidate) => candidate.id === partId);
    if (!part) return;
    const rotated: PartInst = { ...part, rot: nextRot(part.rot) };
    if (!canPlacePart(board, parts, defsById, rotated, part.id)) return;
    const state = coreStateJsonRef.current;
    if (!state) return;
    void (async () => {
      try {
        const nextState = await applyCoreCommandJson(
          state,
          commandRotatePartInstJson(part.id, rotated.rot)
        );
        commitStateTransition(state, nextState);
        await refreshDrcForState(nextState);
        setCoreError(null);
      } catch (err) {
        setCoreError(err instanceof Error ? err.message : "rotate part failed");
      }
    })();
  };

  const armMoveForPart = (partId: string): void => {
    const part = parts.find((candidate) => candidate.id === partId);
    if (!part) return;
    setMoveArmedPartId(partId);
    setMoveArmedRot(part.rot);
    setPlaceArmedDefId(null);
    setWireDraftPath([]);
    setSelectedPartId(partId);
    setSelectedWireId(null);
    setTool("select");
  };

  const commitWireDraft = async (): Promise<void> => {
    if (wireDraftPath.length < 2 || !selectedNetId) return;
    const state = coreStateJsonRef.current;
    if (!state) return;

    try {
      const cmd = commandCommitWireJson(selectedNetId, wireDraftPath);
      const nextState = await applyCoreCommandJson(state, cmd);
      commitStateTransition(state, nextState);
      setWireDraftPath([]);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "commit wire failed");
    }
  };

  const addNet = async (): Promise<void> => {
    const newNet: Net = {
      id: newUuid(),
      name: `N-${nets.length + 1}`
    };
    setNets((prev) => [...prev, newNet]);
    setSelectedNetId(newNet.id);
    const state = coreStateJsonRef.current;
    if (!state) return;
    try {
      const nextState = await applyCoreCommandJson(
        state,
        commandAssignNetNameJson(newNet.id, newNet.name)
      );
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "add net failed");
    }
  };

  const renameSelectedNet = async (): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state || !selectedNetId) return;
    const name = netNameDraft.trim();
    if (!name) return;
    try {
      const nextState = await applyCoreCommandJson(
        state,
        commandAssignNetNameJson(selectedNetId, name)
      );
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "rename net failed");
    }
  };

  const assignSelectedPinToNet = async (): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state || !selectedPart || !selectedNetId || !pinNameDraft) return;
    try {
      const nextState = await applyCoreCommandJson(
        state,
        commandAssignPinToNetJson(selectedPart.id, pinNameDraft, selectedNetId)
      );
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "assign pin to net failed");
    }
  };

  const runDrc = async (): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state) return;
    try {
      await refreshDrcForState(state);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "drc failed");
    }
  };

  const exportProjectJson = (): void => {
    const state = coreStateJsonRef.current;
    if (!state) return;
    const blob = new Blob([state], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    anchor.href = url;
    anchor.download = `uniuni-project-${timestamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const importProjectJson = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { schema_version?: unknown };
      if (typeof parsed.schema_version !== "number") {
        throw new Error("invalid project json: missing schema_version");
      }
      const nextView = extractViewStateFromCoreJson(text);
      const preferredNetId = nextView.nets[0]?.id ?? "";
      syncFromCoreState(text);
      setSelectedNetId(preferredNetId);
      setSelectedPartId(null);
      setSelectedWireId(null);
      setMoveArmedPartId(null);
      setMoveArmedRot(null);
      setPlaceArmedDefId(null);
      setWireDraftPath([]);
      setTool("select");
      setHistoryPast([]);
      setHistoryFuture([]);
      await refreshDrcForState(text);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "import project failed");
    }
  };

  const undo = async (): Promise<void> => {
    const current = coreStateJsonRef.current;
    if (!current || historyPast.length === 0) return;
    const previousEntry = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [
      {
        stateJson: current,
        selectedPartId: selectedPartIdRef.current,
        selectedWireId: selectedWireIdRef.current
      },
      ...prev
    ]);
    const view = syncFromCoreState(previousEntry.stateJson);
    setSelectedPartId(resolveSelectedPartId(view.parts, previousEntry.selectedPartId));
    setSelectedWireId(resolveSelectedWireId(view.wires, previousEntry.selectedWireId));
    setWireDraftPath([]);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setPlaceArmedDefId(null);
    setTool("select");
    await refreshDrcForState(previousEntry.stateJson);
    setCoreError(null);
  };

  const redo = async (): Promise<void> => {
    const current = coreStateJsonRef.current;
    if (!current || historyFuture.length === 0) return;
    const [nextEntry, ...rest] = historyFuture;
    setHistoryFuture(rest);
    setHistoryPast((prev) => [
      ...prev.slice(-99),
      {
        stateJson: current,
        selectedPartId: selectedPartIdRef.current,
        selectedWireId: selectedWireIdRef.current
      }
    ]);
    const view = syncFromCoreState(nextEntry.stateJson);
    setSelectedPartId(resolveSelectedPartId(view.parts, nextEntry.selectedPartId));
    setSelectedWireId(resolveSelectedWireId(view.wires, nextEntry.selectedWireId));
    setWireDraftPath([]);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setPlaceArmedDefId(null);
    setTool("select");
    await refreshDrcForState(nextEntry.stateJson);
    setCoreError(null);
  };

  const handleDeleteSelected = (): void => {
    const state = coreStateJsonRef.current;
    if (!state) return;

    if (selectedPartId) {
      void (async () => {
        try {
          const nextState = await applyCoreCommandJson(
            state,
            commandDeletePartInstJson(selectedPartId)
          );
          commitStateTransition(state, nextState);
        if (moveArmedPartId === selectedPartId) {
          setMoveArmedPartId(null);
          setMoveArmedRot(null);
        }
        setSelectedPartId(null);
        setSelectedWireId(null);
        await refreshDrcForState(nextState);
          setCoreError(null);
        } catch (err) {
          setCoreError(err instanceof Error ? err.message : "delete part failed");
        }
      })();
      return;
    }

    if (!selectedWireId) return;
    void (async () => {
      try {
        const nextState = await applyCoreCommandJson(
          state,
          commandDeleteWireJson(selectedWireId)
        );
        commitStateTransition(state, nextState);
        setSelectedWireId(null);
        await refreshDrcForState(nextState);
        setCoreError(null);
      } catch (err) {
        setCoreError(err instanceof Error ? err.message : "delete wire failed");
      }
    })();
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
      const state = coreStateJsonRef.current;
      if (!state) return;
      void (async () => {
        try {
          const nextState = await applyCoreCommandJson(
            state,
            commandMovePartInstJson(moveArmedPart.id, grid)
          );
          commitStateTransition(state, nextState);
          setMoveArmedPartId(null);
          setMoveArmedRot(null);
          setTool("select");
          setSelectedPartId(moved.id);
          setSelectedWireId(null);
          await refreshDrcForState(nextState);
          setCoreError(null);
        } catch (err) {
          setCoreError(err instanceof Error ? err.message : "move part failed");
        }
      })();
      return;
    }

    if (placeArmedDefId) {
      const preview: PartInst = {
        id: "__candidate__",
        defId: placeArmedDefId,
        at: grid,
        rot: placeArmedRot,
        refdes: nextRefdes(parts, placeArmedDefId),
        netAssign: {}
      };
      if (!canPlacePart(board, parts, defsById, preview)) return;
      const state = coreStateJsonRef.current;
      if (!state) return;
      void (async () => {
        try {
          const nextState = await applyCoreCommandJson(
            state,
            commandAddPartInstJson(placeArmedDefId, grid, placeArmedRot, preview.refdes)
          );
          const nextView = commitStateTransition(state, nextState);
          const addedPartId = findAddedPartId(parts, nextView.parts);
          setPlaceArmedDefId(null);
          setSelectedPartId(addedPartId);
          setSelectedWireId(null);
          setTool("select");
          await refreshDrcForState(nextState);
          setCoreError(null);
        } catch (err) {
          setCoreError(err instanceof Error ? err.message : "add part failed");
        }
      })();
      return;
    }

    const clickedPartId = findPartAtGrid(grid, parts, defsById);
    if (clickedPartId) {
      setSelectedPartId(clickedPartId);
      setSelectedWireId(null);
      return;
    }

    const clickedWireId = findWireAtGrid(grid, wires);
    if (clickedWireId) {
      setSelectedWireId(clickedWireId);
      setSelectedPartId(null);
      return;
    }

    setSelectedPartId(null);
    setSelectedWireId(null);
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
      refdes: "",
      netAssign: {}
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

      if ((event.ctrlKey || event.metaKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          void redo();
        } else {
          void undo();
        }
        return;
      }

      if ((event.ctrlKey || event.metaKey) && key === "y") {
        event.preventDefault();
        void redo();
        return;
      }

      if (key === "delete" || key === "backspace") {
        event.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (key === "enter" && tool === "wire") {
        event.preventDefault();
        void commitWireDraft();
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

        armPlacement(partDefs[0].id);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        armPlacement(partDefs[1].id);
        return;
      }

      if (key === "l") {
        event.preventDefault();
        armPlacement(partDefs[2].id);
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
    redo,
    selectedPart,
    selectedPartId,
    selectedWireId,
    tool,
    undo,
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
          <button type="button" className="btn" onClick={() => armPlacement(partDefs[0].id)}>
            Arm R
          </button>
          <button type="button" className="btn" onClick={() => armPlacement(partDefs[1].id)}>
            Arm C
          </button>
          <button type="button" className="btn" onClick={() => armPlacement(partDefs[2].id)}>
            Arm L
          </button>
          <button type="button" className="btn danger" onClick={handleDeleteSelected}>
            Delete Selected
          </button>
          <button type="button" className="btn" onClick={() => void undo()} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="btn" onClick={() => void redo()} disabled={!canRedo}>
            Redo
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
            onChange={(event) => {
              setSelectedNetId(event.target.value);
            }}
          >
            {nets.map((net) => (
              <option key={net.id} value={net.id}>
                {net.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            className="net-input"
            value={netNameDraft}
            placeholder="Net name"
            onChange={(event) => setNetNameDraft(event.target.value)}
          />
          <button type="button" className="btn" onClick={() => void addNet()}>
            Add Net
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void renameSelectedNet()}
            disabled={!selectedNetId || netNameDraft.trim().length === 0}
          >
            Rename Net
          </button>
          <select
            className="net-select"
            value={pinNameDraft}
            onChange={(event) => setPinNameDraft(event.target.value)}
            disabled={!selectedPartDef || selectedPartDef.pins.length === 0}
          >
            {(selectedPartDef?.pins ?? []).map((pin) => (
              <option key={pin.name} value={pin.name}>
                Pin {pin.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            onClick={() => void assignSelectedPinToNet()}
            disabled={!selectedPart || !selectedNetId || !pinNameDraft}
          >
            Assign Pin To Net
          </button>
          <button type="button" className="btn" onClick={() => void commitWireDraft()}>
            Commit Wire
          </button>
          <button type="button" className="btn" onClick={() => setWireDraftPath([])}>
            Cancel Wire
          </button>
          <button type="button" className="btn" onClick={() => void runDrc()}>
            Run DRC
          </button>
          <button type="button" className="btn" onClick={exportProjectJson}>
            Export JSON
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              importInputRef.current?.click();
            }}
          >
            Import JSON
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importProjectJson(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="toolbar-row">
          <span>Core Bridge: {coreBridgeMode === "unknown" ? "initializing" : "ready"}</span>
          <span>DRC Issues: {drcIssues.length}</span>
          {coreError ? <span className="error-text">Error: {coreError}</span> : null}
        </div>
        {drcIssues.length > 0 ? (
          <div className="toolbar-row">
            {drcIssues.slice(0, 3).map((issue, idx) => (
              <span key={`${issue.code}-${idx}`}>
                [{issue.level}] {issue.code}
                {issue.at ? ` @ (${issue.at.x},${issue.at.y})` : ""}: {issue.message}
              </span>
            ))}
          </div>
        ) : null}
      </header>
      <BoardCanvas
        board={board}
        parts={parts}
        partDefs={partDefs}
        wires={wires}
        selectedWireId={selectedWireId}
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
