import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon } from "./ActionIcon";
import { BoardCanvas } from "./BoardCanvas";
import { PixelArtEditor } from "./PixelArtEditor";
import { addBuiltInArtwork, addMissingAdditionalParts, addMissingDatasheetParts, addMissingNewestParts, addMissingNextParts, addMissingPinHeaders, addMissingXhConnectors, correctBuiltInArtwork, defaultPartDefs, pinHeaderPartDefs, updateBuiltInTopViews, xhConnectorPartDefs } from "./defaultParts";
import { categorizeParts, isPartCategory, PART_CATEGORIES, partCategory } from "./partCategories";
import {
  applyCoreCommandJson,
  commandAddPartInstJson,
  commandAssignNetColorJson,
  commandAssignNetNameJson,
  commandAssignPinToNetJson,
  commandCommitWireAutoJson,
  commandDeletePartInstJson,
  commandDeleteWireJson,
  commandMoveRotatePartInstJson,
  commandResizeBoardJson,
  commandRotatePartInstJson,
  createInitialCoreStateJson,
  detectCoreBridgeMode,
  extractViewStateFromCoreJson,
  newUuid,
  replacePartDefsInStateJson,
  runCoreDrcJson
} from "./coreBridge";
import {
  buildHitCandidates,
  canPlacePart,
  findPartAtGrid,
  nextHitCandidateIndex,
  nextRot
} from "./parts";
import { BUILT_IN_CATALOG_VERSION, loadPartLibraryWithVersion, savePartLibrary } from "./partLibrary";
import { loadSnapshot, saveSnapshot } from "./persistence";
import { buildProjectZip, parseProjectZip } from "./projectPackage";
import { validateProjectStateJson } from "./projectStateValidation";
import type { Board, DrcIssue, GridPt, Net, PartCategory, PartDef, PartInst, Rot, ToolMode, Wire } from "./types";
import type { HitCandidate } from "./parts";

const DEFAULT_BOARD: Board = {
  width: 64,
  height: 40,
  gridPitchMm: 2.54
};
const AKIZUKI_BOARD_PRESETS = [
  {
    id: "akizuki-a",
    label: "秋月 Aタイプ (155x114mm)",
    widthMm: 155,
    heightMm: 114,
    gridWidth: 61,
    gridHeight: 45
  },
  {
    id: "akizuki-b",
    label: "秋月 Bタイプ (95x72mm)",
    widthMm: 95,
    heightMm: 72,
    gridWidth: 36,
    gridHeight: 27
  },
  {
    id: "akizuki-c",
    label: "秋月 Cタイプ (72x47.5mm)",
    widthMm: 72,
    heightMm: 47.5,
    gridWidth: 25,
    gridHeight: 15
  }
] as const;
type BoardPresetId = "custom" | (typeof AKIZUKI_BOARD_PRESETS)[number]["id"];

const defPrefixById: Record<string, string> = {
  "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1": "R",
  "f222f718-6ff6-42a6-b2ba-4c62090d8ca5": "C",
  "01d260e9-ea3a-488f-9e8a-031ca0d679ce": "L",
  "a9bf042c-20cf-429a-97e3-14aaac011571": "D",
  "25da8655-cbdc-4221-b7c3-6c13bde21d75": "D",
  "8acc092b-3960-46cb-b0f2-0995cc01a107": "Q",
  "ac18d4fc-a392-4a23-9783-787704df3e09": "U",
  "53000741-8a21-48a3-92c3-22fdb3769ff5": "J",
  "fb6a0559-572f-4f65-a3e9-3f6f8029aa26": "SW",
  "77750a90-4823-4cdf-bfea-a3b36e7872a8": "C",
  "5ed6e5ed-ba33-45d5-aa04-4fe27f9f9ff1": "U",
  "9429852c-4b26-483b-b302-844d11d3b6e8": "U",
  "4bb91cd4-5cee-4cc1-97b4-e75305b5f101": "SW",
  "cf3f301b-1aef-407a-8335-dbd07b0a833c": "J",
  "28adb8b0-79cf-4e9f-8ad5-6b71855fefc1": "RV",
  "799559c3-a49b-4905-9b85-777aa4a982c8": "C",
  "3ef2adda-02f1-4d21-b0ad-f817993c004e": "F",
  "97c4076e-3a81-4a7a-8db7-f187e0157358": "R",
  "008e51b2-6271-4c03-9dac-dc235fe15175": "D",
  "6a69eb4c-d4a1-4121-b5fd-44a0a34ea986": "U",
  "3b359d03-cea0-4e3c-a187-fe737dd8d800": "J",
  "78bdfa3c-df5d-4247-bbc9-9feeb9f0a96b": "BZ",
  "1b69aec3-cc03-4b3a-9b78-d6f72fdb3adb": "J",
  "fabe901c-a809-5a44-b19f-4d99248069ab": "K",
  "3d15c257-b749-5ab3-bbc4-771033fb5027": "D",
  "492d4cca-de3f-5ec1-bb1d-35d73d5089c3": "A",
  ...Object.fromEntries(pinHeaderPartDefs.map((def) => [def.id, "J"])),
  ...Object.fromEntries(xhConnectorPartDefs.map((def) => [def.id, "J"]))
};

const builtInPartIds = {
  resistor: "ad7ecaa0-4c74-4a0f-a7ba-a0f1fa0f12a1",
  capacitor: "f222f718-6ff6-42a6-b2ba-4c62090d8ca5",
  inductor: "01d260e9-ea3a-488f-9e8a-031ca0d679ce"
};
const NET_COLORS = ["#2563eb", "#a16207", "#be185d", "#15803d", "#c2410c", "#7c3aed"];
const NET_COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

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

function partLabel(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "PT";
  const first = tokens[0].slice(0, 1);
  const second = tokens.length > 1 ? tokens[1].slice(0, 1) : tokens[0].slice(1, 2);
  return `${first}${second}`.toUpperCase();
}

function fallbackNetColor(netId: string): string {
  let hash = 0;
  for (let i = 0; i < netId.length; i += 1) {
    hash = (hash * 31 + netId.charCodeAt(i)) >>> 0;
  }
  return NET_COLORS[hash % NET_COLORS.length];
}

type HistoryEntry = {
  stateJson: string;
  partDefs: PartDef[];
  selectedPartId: string | null;
  selectedWireId: string | null;
};

type CorePartDefShape = {
  id: string;
  name: string;
  pins: Array<{ name: string; pos: GridPt }>;
  occupied: GridPt[];
};

function partDefsFromCoreStateJson(stateJson: string): PartDef[] {
  const parsed = JSON.parse(stateJson) as { part_defs?: unknown };
  const defs = Array.isArray(parsed.part_defs) ? parsed.part_defs : [];
  return defs
    .map((raw) => {
      const def = raw as Partial<CorePartDefShape>;
      if (typeof def.id !== "string" || typeof def.name !== "string") return null;
      if (!Array.isArray(def.pins) || !Array.isArray(def.occupied)) return null;
      const pins = def.pins
        .filter((pin): pin is { name: string; pos: GridPt } => {
          const p = pin as { name?: unknown; pos?: { x?: unknown; y?: unknown } };
          return (
            typeof p.name === "string" &&
            typeof p.pos?.x === "number" &&
            typeof p.pos?.y === "number"
          );
        })
        .map((pin) => ({ name: pin.name, pos: { x: pin.pos.x, y: pin.pos.y } }));
      const occupied = def.occupied
        .filter((pt): pt is GridPt => {
          const p = pt as { x?: unknown; y?: unknown };
          return typeof p.x === "number" && typeof p.y === "number";
        })
        .map((pt) => ({ x: pt.x, y: pt.y }));
      if (pins.length === 0 || occupied.length === 0) return null;
      return {
        id: def.id,
        name: def.name,
        pins,
        occupied,
        category: partCategory({ id: def.id }),
        imageDataUrl: null,
        imageScale: 1,
        imageOffsetX: 0,
        imageOffsetY: 0
      } as PartDef;
    })
    .filter((def): def is PartDef => Boolean(def));
}

export function App(): JSX.Element {
  const [board, setBoard] = useState<Board>(DEFAULT_BOARD);
  const [boardWidthDraft, setBoardWidthDraft] = useState<string>(String(DEFAULT_BOARD.width));
  const [boardHeightDraft, setBoardHeightDraft] = useState<string>(String(DEFAULT_BOARD.height));
  const [boardPresetId, setBoardPresetId] = useState<BoardPresetId>("custom");
  const [tool, setTool] = useState<ToolMode>("select");
  const [showSettings, setShowSettings] = useState(false);
  const [activeRot, setActiveRot] = useState<Rot>("Deg0");
  const [partDefs, setPartDefs] = useState<PartDef[]>(defaultPartDefs);
  const [libraryCategory, setLibraryCategory] = useState<PartCategory | "all">("all");
  const [parts, setParts] = useState<PartInst[]>([]);
  const [wires, setWires] = useState<Wire[]>([]);
  const [nets, setNets] = useState<Net[]>(() => [{ id: newUuid(), name: "N-1" }]);
  const [selectedNetId, setSelectedNetId] = useState<string>(() => nets[0]?.id ?? "");
  const [netNameDraft, setNetNameDraft] = useState<string>("");
  const [netColorDraft, setNetColorDraft] = useState<string>("#2563eb");
  const [pinNameDraft, setPinNameDraft] = useState<string>("");
  const [editorDefId, setEditorDefId] = useState<string>(defaultPartDefs[0].id);
  const [editorDefName, setEditorDefName] = useState<string>(defaultPartDefs[0].name);
  const [editorPinName, setEditorPinName] = useState<string>("");
  const [editorPinX, setEditorPinX] = useState<string>("0");
  const [editorPinY, setEditorPinY] = useState<string>("0");
  const [editorOccX, setEditorOccX] = useState<string>("0");
  const [editorOccY, setEditorOccY] = useState<string>("0");
  const [placeDefId, setPlaceDefId] = useState<string>(defaultPartDefs[0].id);
  const [editorPreviewZoom, setEditorPreviewZoom] = useState<number>(1);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  const [editorImageScale, setEditorImageScale] = useState<string>("1");
  const [editorImageOffsetX, setEditorImageOffsetX] = useState<string>("0");
  const [editorImageOffsetY, setEditorImageOffsetY] = useState<string>("0");
  const [wireDraftPath, setWireDraftPath] = useState<GridPt[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [moveArmedPartId, setMoveArmedPartId] = useState<string | null>(null);
  const [moveArmedRot, setMoveArmedRot] = useState<Rot | null>(null);
  const [placeArmedDefId, setPlaceArmedDefId] = useState<string | null>(null);
  const [placeArmedRot, setPlaceArmedRot] = useState<Rot>("Deg0");
  const [selectionAnchorGrid, setSelectionAnchorGrid] = useState<GridPt | null>(null);
  const [hoverGrid, setHoverGrid] = useState<GridPt | null>(null);
  const [coreStateJson, setCoreStateJson] = useState<string | null>(null);
  const [coreBridgeMode, setCoreBridgeMode] = useState<"wasm" | "fallback" | "unknown">("unknown");
  const [drcIssues, setDrcIssues] = useState<DrcIssue[]>([]);
  const [coreError, setCoreError] = useState<string | null>(null);
  const [historyPast, setHistoryPast] = useState<HistoryEntry[]>([]);
  const [historyFuture, setHistoryFuture] = useState<HistoryEntry[]>([]);
  const coreStateJsonRef = useRef<string | null>(null);
  const partDefsRef = useRef<PartDef[]>(defaultPartDefs);
  const partDefsUpdateQueueRef = useRef<Promise<void>>(Promise.resolve());
  const selectedPartIdRef = useRef<string | null>(null);
  const selectedWireIdRef = useRef<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const partImageInputRef = useRef<HTMLInputElement | null>(null);
  const partLibraryInputRef = useRef<HTMLInputElement | null>(null);

  const defsById = useMemo(() => new Map(partDefs.map((def) => [def.id, def])), [partDefs]);
  const partGroups = useMemo(() => PART_CATEGORIES
    .map((category) => ({ ...category, parts: partDefs.filter((def) => partCategory(def) === category.id) }))
    .filter((category) => category.parts.length > 0), [partDefs]);
  const libraryGroups = partGroups.filter((category) => libraryCategory === "all" || libraryCategory === category.id);

  useEffect(() => {
    if (libraryCategory !== "all" && !partDefs.some((def) => partCategory(def) === libraryCategory)) {
      setLibraryCategory("all");
    }
  }, [libraryCategory, partDefs]);
  const editorDef = partDefs.find((def) => def.id === editorDefId) ?? null;
  const imageScaleSlider = Math.min(4, Math.max(0.1, Number(editorImageScale) || 1));
  const imageOffsetXSlider = Math.min(10, Math.max(-10, Number(editorImageOffsetX) || 0));
  const imageOffsetYSlider = Math.min(10, Math.max(-10, Number(editorImageOffsetY) || 0));
  const selectedPart = parts.find((part) => part.id === selectedPartId) ?? null;
  const selectedPartDef = selectedPart ? defsById.get(selectedPart.defId) ?? null : null;
  const selectedNet = nets.find((net) => net.id === selectedNetId) ?? null;
  const moveArmedPart = parts.find((part) => part.id === moveArmedPartId) ?? null;
  const hoveredPartId = useMemo(() => {
    if (!hoverGrid) return null;
    return findPartAtGrid(hoverGrid, parts, defsById);
  }, [defsById, hoverGrid, parts]);

  useEffect(() => {
    if (selectedPart) setEditorDefId(selectedPart.defId);
  }, [selectedPart?.id, selectedPart?.defId]);

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
      setNetColorDraft("#2563eb");
      return;
    }
    const selected = nets.find((net) => net.id === selectedNetId);
    setNetNameDraft(selected?.name ?? "");
    setNetColorDraft(selected?.color ?? fallbackNetColor(selectedNetId));
  }, [nets, selectedNetId]);

  useEffect(() => {
    setBoardWidthDraft(String(board.width));
    setBoardHeightDraft(String(board.height));
    const matched = AKIZUKI_BOARD_PRESETS.find((preset) => {
      return preset.gridWidth === board.width && preset.gridHeight === board.height;
    });
    setBoardPresetId(matched?.id ?? "custom");
  }, [board.height, board.width]);

  useEffect(() => {
    if (!editorDefId || !partDefs.some((def) => def.id === editorDefId)) {
      const first = partDefs[0];
      if (first) {
        setEditorDefId(first.id);
        setEditorDefName(first.name);
      }
      return;
    }
    const current = partDefs.find((def) => def.id === editorDefId);
    if (current) {
      setEditorDefName(current.name);
    }
  }, [editorDefId, partDefs]);

  useEffect(() => {
    if (!partDefs.some((def) => def.id === placeDefId)) {
      const first = partDefs[0];
      if (first) setPlaceDefId(first.id);
    }
  }, [partDefs, placeDefId]);

  useEffect(() => {
    if (!editorDef) return;
    setEditorImageScale(String(editorDef.imageScale ?? 1));
    setEditorImageOffsetX(String(editorDef.imageOffsetX ?? 0));
    setEditorImageOffsetY(String(editorDef.imageOffsetY ?? 0));
  }, [editorDef]);

  useEffect(() => {
    if (!selectedPartDef || selectedPartDef.pins.length === 0) {
      setPinNameDraft("");
      return;
    }
    if (!selectedPartDef.pins.some((pin) => pin.name === pinNameDraft)) {
      setPinNameDraft(selectedPartDef.pins[0].name);
    }
  }, [pinNameDraft, selectedPartDef]);

  const syncFromCoreState = (nextState: string): { board: Board; parts: PartInst[]; wires: Wire[]; nets: Net[] } => {
    const view = extractViewStateFromCoreJson(nextState);
    coreStateJsonRef.current = nextState;
    setCoreStateJson(nextState);
    setBoard(view.board);
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

  const commitStateTransition = (prevState: string, nextState: string): { board: Board; parts: PartInst[]; wires: Wire[]; nets: Net[] } => {
    const view = syncFromCoreState(nextState);
    if (prevState !== nextState) {
      setHistoryPast((prev) => [
        ...prev.slice(-99),
        {
          stateJson: prevState,
          partDefs: partDefsRef.current,
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

  const applyPartDefsChange = (change: (defs: PartDef[]) => PartDef[], notice?: string): Promise<boolean> => {
    const operation = partDefsUpdateQueueRef.current.then(async () => {
      const currentState = coreStateJsonRef.current;
      if (!currentState) throw new Error("core is not ready");
      const nextDefs = change(partDefsRef.current);
      const nextState = await replacePartDefsInStateJson(currentState, nextDefs);
      commitStateTransition(currentState, nextState);
      partDefsRef.current = nextDefs;
      setPartDefs(nextDefs);
      await refreshDrcForState(nextState);
      setCoreError(null);
      if (notice) setEditorNotice(notice);
      try {
        await savePartLibrary(nextDefs);
      } catch (err) {
        setCoreError(`部品ライブラリの保存に失敗: ${String(err)}`);
      }
    });
    partDefsUpdateQueueRef.current = operation.catch(() => undefined);
    return operation.then(() => true).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      setEditorNotice(message);
      setCoreError(message);
      return false;
    });
  };

  const canUndo = historyPast.length > 0;
  const canRedo = historyFuture.length > 0;

  useEffect(() => {
    let cancelled = false;
    const init = async (): Promise<void> => {
      const warnings: string[] = [];
      const asMessage = (err: unknown): string =>
        err instanceof Error && err.message ? err.message : String(err);

      let effectivePartDefs: PartDef[] = defaultPartDefs;
      let saveUpdatedCatalog = false;
      let bridgeMode: "wasm" | "fallback" = "fallback";

      try {
        try {
          bridgeMode = await detectCoreBridgeMode();
        } catch (err) {
          warnings.push(`Core 接続判定に失敗: ${asMessage(err)}`);
        }
        if (!cancelled) {
          setCoreBridgeMode(bridgeMode);
        }

        try {
          const library = await loadPartLibraryWithVersion();
          if (library && library.partDefs.length > 0) {
            const catalogVersion = library.builtInCatalogVersion;
            saveUpdatedCatalog = catalogVersion < BUILT_IN_CATALOG_VERSION;
            effectivePartDefs = library.partDefs;
            if (catalogVersion < 1) effectivePartDefs = addMissingPinHeaders(effectivePartDefs);
            if (catalogVersion < 2) effectivePartDefs = addBuiltInArtwork(effectivePartDefs);
            if (catalogVersion < 3) effectivePartDefs = addMissingAdditionalParts(effectivePartDefs);
            if (catalogVersion < 4) {
              effectivePartDefs = correctBuiltInArtwork(effectivePartDefs);
              effectivePartDefs = addMissingNextParts(effectivePartDefs);
            }
            if (catalogVersion < 5) {
              effectivePartDefs = addMissingNewestParts(effectivePartDefs);
              effectivePartDefs = categorizeParts(effectivePartDefs);
            }
            if (catalogVersion < 7) effectivePartDefs = addMissingXhConnectors(effectivePartDefs);
            if (catalogVersion < 8) effectivePartDefs = addMissingDatasheetParts(effectivePartDefs);
          }
        } catch (err) {
          warnings.push(`部品ライブラリ読込に失敗（既定にフォールバック）: ${asMessage(err)}`);
        }

        const createFreshState = async (): Promise<string> => {
          let fresh = await createInitialCoreStateJson(board, effectivePartDefs);
          for (const net of nets) {
            fresh = await applyCoreCommandJson(fresh, commandAssignNetNameJson(net.id, net.name));
            if (typeof net.color === "string" && NET_COLOR_HEX.test(net.color)) {
              fresh = await applyCoreCommandJson(fresh, commandAssignNetColorJson(net.id, net.color));
            }
          }
          return fresh;
        };

        let snapshot: Awaited<ReturnType<typeof loadSnapshot>> = null;
        try {
          snapshot = await loadSnapshot();
        } catch (err) {
          warnings.push(`保存スナップショット読込に失敗: ${asMessage(err)}`);
        }

        const topViewUpdate = updateBuiltInTopViews(effectivePartDefs, snapshot?.coreStateJson ?? null);
        if (topViewUpdate.partDefs !== effectivePartDefs) {
          effectivePartDefs = topViewUpdate.partDefs;
          saveUpdatedCatalog = true;
        }
        if (snapshot && topViewUpdate.coreStateJson && topViewUpdate.coreStateJson !== snapshot.coreStateJson) {
          snapshot = { ...snapshot, coreStateJson: topViewUpdate.coreStateJson };
        }
        if (topViewUpdate.blockedNames.length > 0) {
          warnings.push(`旧部品の図を更新できません: ${topViewUpdate.blockedNames.join("、")}。保存済みの配置と新しい外形が整合しません。`);
        }

        let nextState: string;
        let nextSelectedNetId = selectedNetId;
        if (snapshot?.coreStateJson) {
          try {
            if (snapshot.schemaVersion !== 1) throw new Error("unsupported snapshot schemaVersion");
            validateProjectStateJson(snapshot.coreStateJson);
            nextState = snapshot.coreStateJson;
            nextSelectedNetId = snapshot.selectedNetId ?? "";
            nextState = await replacePartDefsInStateJson(nextState, effectivePartDefs);
          } catch (err) {
            warnings.push(`保存スナップショット復元に失敗（新規開始）: ${asMessage(err)}`);
            nextState = await createFreshState();
            nextSelectedNetId = nets[0]?.id ?? "";
          }
        } else {
          nextState = await createFreshState();
        }
        if (cancelled) return;
        if (saveUpdatedCatalog) {
          try {
            await savePartLibrary(effectivePartDefs);
          } catch (err) {
            warnings.push(`追加部品の保存に失敗: ${asMessage(err)}`);
          }
        }
        if (cancelled) return;
        partDefsRef.current = effectivePartDefs;
        setPartDefs(effectivePartDefs);
        const view = syncFromCoreState(nextState);
        if (nextSelectedNetId && view.nets.some((net) => net.id === nextSelectedNetId)) {
          setSelectedNetId(nextSelectedNetId);
        } else if (view.nets.length > 0) {
          setSelectedNetId(view.nets[0].id);
        }
        setHistoryPast([]);
        setHistoryFuture([]);
        const drcJson = await runCoreDrcJson(nextState);
        if (!cancelled) {
          setDrcIssues(JSON.parse(drcJson) as DrcIssue[]);
          if (warnings.length > 0) {
            setCoreError(warnings.join(" | "));
          } else {
            setCoreError(null);
          }
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
    if (!defId) return;
    setPlaceDefId(defId);
    setEditorDefId(defId);
    setPlaceArmedDefId(defId);
    setPlaceArmedRot(activeRot);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setSelectedPartId(null);
    setSelectedWireId(null);
    setSelectionAnchorGrid(null);
    setWireDraftPath([]);
    setTool("place");
    setCoreError(null);
  };

  const applyHitCandidate = (candidate: HitCandidate | null): void => {
    if (!candidate) {
      setSelectedPartId(null);
      setSelectedWireId(null);
      return;
    }
    if (candidate.kind === "part") {
      setSelectedPartId(candidate.partId);
      const part = parts.find((item) => item.id === candidate.partId);
      if (part) setEditorDefId(part.defId);
      setSelectedWireId(null);
      return;
    }
    setSelectedWireId(candidate.wireId);
    setSelectedPartId(null);
  };

  const selectTopHitAtGrid = (grid: GridPt): void => {
    const candidates = buildHitCandidates(grid, parts, wires, defsById);
    if (candidates.length === 0) {
      applyHitCandidate(null);
      setSelectionAnchorGrid(null);
      return;
    }
    applyHitCandidate(candidates[0]);
    setSelectionAnchorGrid(grid);
  };

  const cycleHitSelectionAtGrid = (grid: GridPt, reverse = false): void => {
    const candidates = buildHitCandidates(grid, parts, wires, defsById);
    if (candidates.length === 0) {
      applyHitCandidate(null);
      setSelectionAnchorGrid(null);
      return;
    }

    const currentKey =
      selectedPartId !== null
        ? `part:${selectedPartId}`
        : selectedWireId !== null
          ? `wire:${selectedWireId}`
          : null;
    const nextIndex = nextHitCandidateIndex(candidates, currentKey, reverse);
    if (nextIndex >= 0) {
      applyHitCandidate(candidates[nextIndex]);
      setSelectionAnchorGrid(grid);
    }
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
    setSelectionAnchorGrid(null);
    setTool("select");
  };

  const commitWireDraft = async (): Promise<void> => {
    if (wireDraftPath.length < 2) return;
    const state = coreStateJsonRef.current;
    if (!state) return;

    try {
      const cmd = commandCommitWireAutoJson(wireDraftPath);
      const nextState = await applyCoreCommandJson(state, cmd);
      const view = commitStateTransition(state, nextState);
      const committedWire = view.wires[view.wires.length - 1];
      if (committedWire) setSelectedNetId(committedWire.netId);
      setWireDraftPath([]);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "commit wire failed";
      setCoreError(message === "wire connects different nets"
        ? "異なるネットが接続されるため、配線を確定できません。"
        : message);
    }
  };

  const applyBoardSize = async (width: number, height: number): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state) return;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      setCoreError("board size must be positive integers");
      return;
    }
    try {
      const nextState = await applyCoreCommandJson(state, commandResizeBoardJson(width, height));
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "resize board failed");
    }
  };

  const applyBoardDraftSize = async (): Promise<void> => {
    const width = Number(boardWidthDraft);
    const height = Number(boardHeightDraft);
    await applyBoardSize(width, height);
  };

  const applyBoardPreset = async (): Promise<void> => {
    if (boardPresetId === "custom") return;
    const preset = AKIZUKI_BOARD_PRESETS.find((item) => item.id === boardPresetId);
    if (!preset) return;
    await applyBoardSize(preset.gridWidth, preset.gridHeight);
  };

  const addNet = async (): Promise<void> => {
    const newNet: Net = {
      id: newUuid(),
      name: `N-${nets.length + 1}`,
      color: null
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
    if (!name || name === selectedNet?.name) return;
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

  const applySelectedNetColor = async (): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state || !selectedNetId) return;
    if (!NET_COLOR_HEX.test(netColorDraft)) {
      setCoreError("net color must be #RRGGBB");
      return;
    }
    try {
      const nextState = await applyCoreCommandJson(
        state,
        commandAssignNetColorJson(selectedNetId, netColorDraft)
      );
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "assign net color failed");
    }
  };

  const resetSelectedNetColor = async (): Promise<void> => {
    const state = coreStateJsonRef.current;
    if (!state || !selectedNetId) return;
    try {
      const nextState = await applyCoreCommandJson(
        state,
        commandAssignNetColorJson(selectedNetId, null)
      );
      commitStateTransition(state, nextState);
      await refreshDrcForState(nextState);
      setCoreError(null);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "reset net color failed");
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

  const renameEditorPartDef = (): void => {
    const name = editorDefName.trim();
    if (!editorDefId) return;
    if (!name) {
      setEditorNotice("部品名を入力してください。");
      return;
    }
    if (partDefs.some((def) => def.id !== editorDefId && def.name === name)) {
      setEditorNotice("同名の部品が既に存在します。");
      return;
    }
    void applyPartDefsChange(
      (prev) => prev.map((def) => (def.id === editorDefId ? { ...def, name } : def)),
      "部品名を更新しました。"
    );
  };

  const addEditorPin = (): void => {
    if (!editorDefId) return;
    const name = editorPinName.trim();
    const x = Number(editorPinX);
    const y = Number(editorPinY);
    if (!name) {
      setEditorNotice("Pin名を入力してください。");
      return;
    }
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      setEditorNotice("Pin座標は整数で入力してください。");
      return;
    }
    if (Math.abs(x) > 999 || Math.abs(y) > 999) {
      setEditorNotice("Pin座標は -999〜999 の範囲で入力してください。");
      return;
    }
    if (editorDef?.pins.some((pin) => pin.name === name)) {
      setEditorNotice("同名のPinが既に存在します。");
      return;
    }
    void applyPartDefsChange((prev) =>
      prev.map((def) => {
        if (def.id !== editorDefId) return def;
        return {
          ...def,
          pins: [...def.pins, { name, pos: { x, y } }]
        };
      }), "Pinを追加しました。"
    ).then((ok) => { if (ok) setEditorPinName(""); });
  };

  const removeEditorPin = (pinName: string): void => {
    if (!editorDefId) return;
    if ((editorDef?.pins.length ?? 0) <= 1) {
      setEditorNotice("Pinは最低1つ必要です。");
      return;
    }
    void applyPartDefsChange(
      (prev) => prev.map((def) =>
        def.id === editorDefId ? { ...def, pins: def.pins.filter((pin) => pin.name !== pinName) } : def
      ),
      `Pin ${pinName} を削除しました。`
    );
  };

  const addEditorOccupied = (): void => {
    if (!editorDefId) return;
    const x = Number(editorOccX);
    const y = Number(editorOccY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      setEditorNotice("Occupied座標は整数で入力してください。");
      return;
    }
    if (Math.abs(x) > 999 || Math.abs(y) > 999) {
      setEditorNotice("Occupied座標は -999〜999 の範囲で入力してください。");
      return;
    }
    const key = `${x}:${y}`;
    if (editorDef?.occupied.some((pt) => `${pt.x}:${pt.y}` === key)) {
      setEditorNotice("同じOccupied座標が既に存在します。");
      return;
    }
    void applyPartDefsChange((prev) =>
      prev.map((def) => {
        if (def.id !== editorDefId) return def;
        return {
          ...def,
          occupied: [...def.occupied, { x, y }]
        };
      }), "Occupied座標を追加しました。"
    );
  };

  const removeEditorOccupied = (x: number, y: number): void => {
    if (!editorDefId) return;
    if ((editorDef?.occupied.length ?? 0) <= 1) {
      setEditorNotice("Occupiedは最低1セル必要です。");
      return;
    }
    void applyPartDefsChange((prev) =>
      prev.map((def) =>
        def.id === editorDefId
          ? {
              ...def,
              occupied: def.occupied.filter((pt) => !(pt.x === x && pt.y === y))
            }
          : def
      ), `Occupied (${x},${y}) を削除しました。`
    );
  };

  const setEditorPartImage = (dataUrl: string): void => {
    if (!editorDefId) return;
    void applyPartDefsChange((prev) =>
      prev.map((def) => (def.id === editorDefId ? { ...def, imageDataUrl: dataUrl, imagePixelated: false } : def))
    );
  };

  const registerEditorPixelArt = (dataUrl: string): Promise<boolean> => {
    const defId = editorDefId;
    if (!defId) return Promise.resolve(false);
    return applyPartDefsChange((prev) =>
      prev.map((def) => def.id === defId
        ? { ...def, imageDataUrl: dataUrl, imagePixelated: true, imageScale: 1, imageOffsetX: 0, imageOffsetY: 0 }
        : def), "ドット絵を部品画像に登録しました。"
    );
  };

  const clearEditorPartImage = (): void => {
    if (!editorDefId) return;
    void applyPartDefsChange((prev) =>
      prev.map((def) => (def.id === editorDefId ? { ...def, imageDataUrl: null, imagePixelated: false } : def))
    );
  };

  const applyEditorImageTransform = (): void => {
    if (!editorDefId) return;
    const scale = Number(editorImageScale);
    const ox = Number(editorImageOffsetX);
    const oy = Number(editorImageOffsetY);
    if (!Number.isFinite(scale) || scale <= 0) {
      setEditorNotice("Image scale は 0 より大きい数値にしてください。");
      return;
    }
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
      setEditorNotice("Image offset は数値で入力してください。");
      return;
    }
    void applyPartDefsChange((prev) =>
      prev.map((def) =>
        def.id === editorDefId
          ? { ...def, imageScale: scale, imageOffsetX: ox, imageOffsetY: oy }
          : def
      ), "画像表示設定を更新しました。"
    );
  };

  const onPartImagePicked = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setEditorPartImage(result);
      } else {
        setCoreError("image load failed");
      }
    };
    reader.onerror = () => setCoreError("image load failed");
    reader.readAsDataURL(file);
  };

  const createEditorPartDef = (): void => {
    const baseName = editorDefName.trim() || "New Part";
    const nextId = newUuid();
    const nextDef: PartDef = {
      id: nextId,
      name: baseName,
      category: "other",
      pins: [{ name: "1", pos: { x: 0, y: 0 } }],
      occupied: [{ x: 0, y: 0 }],
      imageDataUrl: null,
      imageScale: 1,
      imageOffsetX: 0,
      imageOffsetY: 0
    };
    void applyPartDefsChange((prev) => [...prev, nextDef], "新しい部品を作成しました。").then((ok) => {
      if (!ok) return;
      setEditorDefId(nextId);
      setEditorDefName(baseName);
      setEditorPinName("1");
      setEditorPinX("0");
      setEditorPinY("0");
      setEditorOccX("0");
      setEditorOccY("0");
    });
  };

  const exportPartLibraryJson = (): void => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, partDefs }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/:/g, "-");
    a.href = url;
    a.download = `uniuni-part-library-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setEditorNotice("部品ライブラリをエクスポートしました。");
  };

  const importPartLibraryJson = async (file: File): Promise<void> => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as { partDefs?: unknown };
      if (!parsed.partDefs || !Array.isArray(parsed.partDefs)) {
        throw new Error("invalid library json");
      }
      const normalized = parsed.partDefs
        .map((raw) => {
          const def = raw as Partial<PartDef>;
          if (typeof def.id !== "string" || typeof def.name !== "string") return null;
          const pins = Array.isArray(def.pins)
            ? def.pins
                .filter((p): p is { name: string; pos: GridPt } => {
                  const pin = p as { name?: unknown; pos?: { x?: unknown; y?: unknown } };
                  return (
                    typeof pin.name === "string" &&
                    typeof pin.pos?.x === "number" &&
                    typeof pin.pos?.y === "number"
                  );
                })
                .map((pin) => ({ name: pin.name, pos: { x: pin.pos.x, y: pin.pos.y } }))
            : [];
          const occupied = Array.isArray(def.occupied)
            ? def.occupied
                .filter((pt): pt is GridPt => {
                  const cell = pt as { x?: unknown; y?: unknown };
                  return typeof cell.x === "number" && typeof cell.y === "number";
                })
                .map((pt) => ({ x: pt.x, y: pt.y }))
            : [];
          if (pins.length === 0 || occupied.length === 0) return null;
          return {
            id: def.id,
            name: def.name,
            category: isPartCategory(def.category) ? def.category : partCategory({ id: def.id }),
            pins,
            occupied,
            imageDataUrl: typeof def.imageDataUrl === "string" ? def.imageDataUrl : null,
            imagePixelated: def.imagePixelated === true,
            imageScale: typeof def.imageScale === "number" && def.imageScale > 0 ? def.imageScale : 1,
            imageOffsetX: typeof def.imageOffsetX === "number" ? def.imageOffsetX : 0,
            imageOffsetY: typeof def.imageOffsetY === "number" ? def.imageOffsetY : 0
          } as PartDef;
        })
        .filter((def): def is PartDef => Boolean(def));
      if (normalized.length === 0) {
        throw new Error("library has no valid part definitions");
      }
      if (!await applyPartDefsChange(() => normalized)) return;
      setEditorDefId(normalized[0].id);
      setEditorDefName(normalized[0].name);
      setEditorNotice("部品ライブラリをインポートしました。");
      setCoreError(null);
    } catch (err) {
      setEditorNotice(err instanceof Error ? err.message : "library import failed");
    }
  };

  const deleteEditorPartDef = (): void => {
    if (!editorDefId) return;
    if (parts.some((part) => part.defId === editorDefId)) {
      setEditorNotice("配置済み部品で使用中のため削除できません。");
      return;
    }
    if (partDefs.length <= 1) {
      setEditorNotice("部品定義は最低1件必要です。");
      return;
    }
    void applyPartDefsChange((prev) => prev.filter((def) => def.id !== editorDefId), "部品を削除しました。");
    if (placeArmedDefId === editorDefId) {
      setPlaceArmedDefId(null);
      setTool("select");
    }
    if (placeDefId === editorDefId) {
      const next = partDefs.find((def) => def.id !== editorDefId);
      if (next) setPlaceDefId(next.id);
    }
  };

  const exportProjectZip = (): void => {
    void (async () => {
      try {
        await partDefsUpdateQueueRef.current;
        const state = coreStateJsonRef.current;
        if (!state) return;
        const blob = await buildProjectZip(state, partDefsRef.current);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        anchor.href = url;
        anchor.download = `uniuni-project-${timestamp}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setCoreError(null);
      } catch (err) {
        setCoreError(err instanceof Error ? err.message : "export project zip failed");
      }
    })();
  };

  const importProjectZip = async (file: File): Promise<void> => {
    try {
      await partDefsUpdateQueueRef.current;
      const packed = await parseProjectZip(file);
      const importedPartDefs = packed.partDefs ?? partDefsFromCoreStateJson(packed.coreStateJson);
      if (importedPartDefs.length === 0) {
        throw new Error("invalid project zip: part definitions not found");
      }

      const nextState = await replacePartDefsInStateJson(packed.coreStateJson, importedPartDefs);
      partDefsRef.current = importedPartDefs;
      setPartDefs(importedPartDefs);
      const nextView = extractViewStateFromCoreJson(nextState);
      const preferredNetId = nextView.nets[0]?.id ?? "";
      syncFromCoreState(nextState);
      setSelectedNetId(preferredNetId);
      setSelectedPartId(null);
      setSelectedWireId(null);
      setSelectionAnchorGrid(null);
      setMoveArmedPartId(null);
      setMoveArmedRot(null);
      setPlaceArmedDefId(null);
      setWireDraftPath([]);
      setTool("select");
      setHistoryPast([]);
      setHistoryFuture([]);
      await refreshDrcForState(nextState);
      setCoreError(null);
      await savePartLibrary(importedPartDefs);
    } catch (err) {
      setCoreError(err instanceof Error ? err.message : "import project zip failed");
    }
  };

  const undo = async (): Promise<void> => {
    await partDefsUpdateQueueRef.current;
    const current = coreStateJsonRef.current;
    if (!current || historyPast.length === 0) return;
    const previousEntry = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [
      {
        stateJson: current,
        partDefs: partDefsRef.current,
        selectedPartId: selectedPartIdRef.current,
        selectedWireId: selectedWireIdRef.current
      },
      ...prev
    ]);
    const view = syncFromCoreState(previousEntry.stateJson);
    partDefsRef.current = previousEntry.partDefs;
    setPartDefs(previousEntry.partDefs);
    await savePartLibrary(previousEntry.partDefs);
    setSelectedPartId(resolveSelectedPartId(view.parts, previousEntry.selectedPartId));
    setSelectedWireId(resolveSelectedWireId(view.wires, previousEntry.selectedWireId));
    setSelectionAnchorGrid(null);
    setWireDraftPath([]);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    setPlaceArmedDefId(null);
    setTool("select");
    await refreshDrcForState(previousEntry.stateJson);
    setCoreError(null);
  };

  const redo = async (): Promise<void> => {
    await partDefsUpdateQueueRef.current;
    const current = coreStateJsonRef.current;
    if (!current || historyFuture.length === 0) return;
    const [nextEntry, ...rest] = historyFuture;
    setHistoryFuture(rest);
    setHistoryPast((prev) => [
      ...prev.slice(-99),
      {
        stateJson: current,
        partDefs: partDefsRef.current,
        selectedPartId: selectedPartIdRef.current,
        selectedWireId: selectedWireIdRef.current
      }
    ]);
    const view = syncFromCoreState(nextEntry.stateJson);
    partDefsRef.current = nextEntry.partDefs;
    setPartDefs(nextEntry.partDefs);
    await savePartLibrary(nextEntry.partDefs);
    setSelectedPartId(resolveSelectedPartId(view.parts, nextEntry.selectedPartId));
    setSelectedWireId(resolveSelectedWireId(view.wires, nextEntry.selectedWireId));
    setSelectionAnchorGrid(null);
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
        setSelectionAnchorGrid(null);
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
        setSelectionAnchorGrid(null);
        await refreshDrcForState(nextState);
        setCoreError(null);
      } catch (err) {
        setCoreError(err instanceof Error ? err.message : "delete wire failed");
      }
    })();
  };

  const handleGridClick = (grid: GridPt): void => {
    if (tool === "wire") {
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
            commandMoveRotatePartInstJson(moveArmedPart.id, grid, moved.rot)
          );
          commitStateTransition(state, nextState);
          setMoveArmedPartId(null);
          setMoveArmedRot(null);
          setTool("select");
          setSelectedPartId(moved.id);
          setSelectedWireId(null);
          setSelectionAnchorGrid(grid);
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
          setSelectedPartId(addedPartId);
          setSelectedWireId(null);
          setSelectionAnchorGrid(grid);
          setTool("place");
          await refreshDrcForState(nextState);
          setCoreError(null);
        } catch (err) {
          setCoreError(err instanceof Error ? err.message : "add part failed");
        }
      })();
      return;
    }

    selectTopHitAtGrid(grid);
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

  const editorPreview = useMemo(() => {
    if (!editorDef) return null;
    const points: GridPt[] = [{ x: 0, y: 0 }];
    for (const pin of editorDef.pins) {
      points.push(pin.pos);
    }
    for (const occ of editorDef.occupied) {
      points.push(occ);
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const fitSpan = Math.max(width, height) + 2;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return { minX, maxX, minY, maxY, width, height, fitSpan, centerX, centerY };
  }, [editorDef]);

  const editorPreviewFingerprint = useMemo(() => {
    if (!editorDef) return "";
    const pins = editorDef.pins
      .map((p) => `${p.name}:${p.pos.x},${p.pos.y}`)
      .sort()
      .join("|");
    const occupied = editorDef.occupied
      .map((p) => `${p.x},${p.y}`)
      .sort()
      .join("|");
    return `${editorDef.id}:${pins}:${occupied}`;
  }, [editorDef]);

  useEffect(() => {
    if (!editorPreviewFingerprint) return;
    setEditorPreviewZoom(1);
  }, [editorPreviewFingerprint]);

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

      if (key === "tab" && tool === "select") {
        const targetGrid = hoverGrid ?? selectionAnchorGrid;
        if (!targetGrid) return;
        event.preventDefault();
        cycleHitSelectionAtGrid(targetGrid, event.shiftKey);
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

        const resistorDef = partDefs.find((def) => def.id === builtInPartIds.resistor) ?? partDefs[0];
        if (!resistorDef) return;
        if (placeArmedDefId) {
          if (tool !== "place") {
            setTool("place");
          }
          setPlaceArmedRot((prev) => nextRot(prev));
          return;
        }
        armPlacement(resistorDef.id);
        return;
      }

      if (key === "c") {
        event.preventDefault();
        const target =
          partDefs.find((def) => def.id === builtInPartIds.capacitor) ?? partDefs[0];
        if (target) {
          armPlacement(target.id);
        }
        return;
      }

      if (key === "l") {
        event.preventDefault();
        const target =
          partDefs.find((def) => def.id === builtInPartIds.inductor) ?? partDefs[0];
        if (target) {
          armPlacement(target.id);
        }
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
        setSelectionAnchorGrid(null);
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
    selectionAnchorGrid,
    tool,
    undo,
    wires,
    wireDraftPath
  ]);

  const coreBridgeLabel =
    coreBridgeMode === "unknown"
      ? "初期化中"
      : coreBridgeMode === "wasm"
        ? "WASM"
        : "Fallback";
  const coreBridgeBadgeClass =
    coreBridgeMode === "fallback"
      ? "bridge-badge fallback"
      : coreBridgeMode === "wasm"
        ? "bridge-badge wasm"
        : "bridge-badge";
  const isCustomBoardPreset = boardPresetId === "custom";
  const selectedPlaceDef = partDefs.find((def) => def.id === placeDefId);
  const toolHint = tool === "wire"
    ? "基板の穴を順に選んで確定します。接続先のネットとピンは自動で割り当てます。"
    : tool === "place"
      ? `${selectedPlaceDef?.name ?? "部品"}を基板に配置します。回転は R キーでも操作できます。`
      : "部品や配線を選択できます。移動は M キー、回転は R キーです。";

  const activateTool = (nextTool: ToolMode): void => {
    setTool(nextTool);
    setMoveArmedPartId(null);
    setMoveArmedRot(null);
    if (nextTool === "place" && placeDefId) {
      setPlaceArmedDefId(placeDefId);
      setPlaceArmedRot(activeRot);
    } else {
      setPlaceArmedDefId(null);
    }
    if (nextTool !== "wire") setWireDraftPath([]);
  };

  return (
    <main className="app-root">
      <aside className="sidebar" data-expanded={showSettings}>
        <header className="toolbar">
        <div className="app-brand-row">
          <h1>uniuni</h1>
          <button
            type="button"
            className="btn panel-toggle"
            aria-expanded={showSettings}
            aria-controls="settings-panel"
            onClick={() => setShowSettings((value) => !value)}
          >
            {showSettings ? "設定を閉じる" : "設定を開く"}
          </button>
        </div>
        <p>ユニバーサル基板 CAD · 編集内容はこのブラウザーに保存</p>
        <div id="settings-panel" className="toolbar-grid">
          <section className="tool-card">
            <h2 className="card-title">基板設定</h2>
            <div className="toolbar-row">
              <label className="net-label" htmlFor="board-preset-select">
                Preset
              </label>
              <select
                id="board-preset-select"
                className="net-select"
                value={boardPresetId}
                onChange={(event) => setBoardPresetId(event.target.value as BoardPresetId)}
              >
                <option value="custom">Custom</option>
                {AKIZUKI_BOARD_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                onClick={() => void applyBoardPreset()}
                disabled={isCustomBoardPreset}
              >
                Apply Preset
              </button>
              <span className="net-label">
                現在: {board.width}x{board.height} grid (
                {(board.width * board.gridPitchMm).toFixed(1)}x
                {(board.height * board.gridPitchMm).toFixed(1)}mm)
              </span>
            </div>
            <div className="toolbar-row">
              <label className="net-label" htmlFor="board-width-input">
                Width
              </label>
              <input
                id="board-width-input"
                type="number"
                min={1}
                step={1}
                className="coord-input"
                value={boardWidthDraft}
                onChange={(event) => setBoardWidthDraft(event.target.value)}
                disabled={!isCustomBoardPreset}
              />
              <label className="net-label" htmlFor="board-height-input">
                Height
              </label>
              <input
                id="board-height-input"
                type="number"
                min={1}
                step={1}
                className="coord-input"
                value={boardHeightDraft}
                onChange={(event) => setBoardHeightDraft(event.target.value)}
                disabled={!isCustomBoardPreset}
              />
              <button
                type="button"
                className="btn"
                onClick={() => void applyBoardDraftSize()}
                disabled={!isCustomBoardPreset}
              >
                Apply Size
              </button>
            </div>
          </section>

          <section className="tool-card">
            <h2 className="card-title">ネット</h2>
            <p className="local-data-note">配線を確定すると、ネットと接触したピンは自動で割り当てられます。</p>
            <div className="toolbar-row net-field-row">
              <label className="net-label" htmlFor="net-select">
                ネット
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
              <button type="button" className="btn btn-with-icon" onClick={() => void addNet()}>
                <ActionIcon name="add" />追加
              </button>
            </div>
            <div className="toolbar-row net-field-row">
              <label className="net-label" htmlFor="net-name-input">
                名前
              </label>
              <input
                id="net-name-input"
                type="text"
                className="net-input"
                value={netNameDraft}
                placeholder="Net name"
                onChange={(event) => setNetNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void renameSelectedNet();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-with-icon"
                onClick={() => void renameSelectedNet()}
                disabled={!selectedNetId || !netNameDraft.trim() || netNameDraft.trim() === selectedNet?.name}
              >
                <ActionIcon name="save" />保存
              </button>
            </div>
            {selectedPart ? (
              <details className="net-details">
                <summary>ピンを手動で割り当てる（任意）</summary>
                <div className="toolbar-row net-field-row">
                  <label className="net-label" htmlFor="net-pin-select">
                    {selectedPart.refdes} のピン
                  </label>
                  <select
                    id="net-pin-select"
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
                    className="btn btn-with-icon"
                    onClick={() => void assignSelectedPinToNet()}
                    disabled={!selectedNetId || !pinNameDraft}
                  >
                    <ActionIcon name="connect" />割り当て
                  </button>
                </div>
              </details>
            ) : null}
            <details className="net-details">
              <summary><ActionIcon name="palette" />ネットの色</summary>
              <div className="toolbar-row net-field-row">
                <label className="net-label" htmlFor="net-color-input">変更色</label>
                <input
                  id="net-color-input"
                  type="color"
                  className="net-color-input"
                  value={netColorDraft}
                  onChange={(event) => setNetColorDraft(event.target.value)}
                  disabled={!selectedNetId}
                />
                <span className="net-label">現在</span>
                <span
                  className="net-color-chip"
                  title="現在の色"
                  role="img"
                  aria-label="現在のネット色"
                  style={{ backgroundColor: selectedNet?.color ?? fallbackNetColor(selectedNetId) }}
                />
                <button
                  type="button"
                  className="btn btn-with-icon"
                  onClick={() => void applySelectedNetColor()}
                  disabled={!selectedNetId || netColorDraft === (selectedNet?.color ?? fallbackNetColor(selectedNetId))}
                >
                  <ActionIcon name="save" />色を適用
                </button>
                {selectedNet?.color ? (
                  <button
                    type="button"
                    className="btn btn-with-icon"
                    onClick={() => void resetSelectedNetColor()}
                  >
                    <ActionIcon name="reset" />既定色に戻す
                  </button>
                ) : null}
              </div>
            </details>
          </section>

          <section className="tool-card">
            <h2 className="card-title">プロジェクト</h2>
            <div className="toolbar-row">
              <button type="button" className="btn btn-with-icon" onClick={exportProjectZip} disabled={!coreStateJson}>
                <ActionIcon name="export" />
                Export ZIP
              </button>
              <button
                type="button"
                className="btn btn-with-icon"
                onClick={() => {
                  importInputRef.current?.click();
                }}
              >
                <ActionIcon name="import" />
                Import ZIP
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/zip,.zip"
                className="hidden-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void importProjectZip(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>
            <p className="local-data-note">
              設計データはこのブラウザー内に保存されます。別のPCへ移す場合は Export ZIP を使ってください。
            </p>
          </section>
        </div>
        <div className="toolbar-row sidebar-status">
          <span className={coreBridgeBadgeClass}>Core: {coreBridgeLabel}</span>
          <span>DRC Issues: {drcIssues.length}</span>
          {coreError ? <span className="error-text">Error: {coreError}</span> : null}
        </div>
        {drcIssues.length > 0 ? (
          <div className="toolbar-row sidebar-status">
            {drcIssues.slice(0, 3).map((issue, idx) => (
              <span key={`${issue.code}-${idx}`}>
                [{issue.level}] {issue.code}
                {issue.at ? ` @ (${issue.at.x},${issue.at.y})` : ""}: {issue.message}
              </span>
            ))}
          </div>
        ) : null}
        </header>
      </aside>
      <section className="main-pane">
        <section className="workspace-pane">
          <div className="workspace-toolbar">
            <div className="workspace-tool-group" role="group" aria-label="編集ツール">
              <button
                type="button"
                className={tool === "select" ? "btn active" : "btn"}
                aria-pressed={tool === "select"}
                onClick={() => activateTool("select")}
              >
                選択
              </button>
              <button
                type="button"
                className={tool === "place" ? "btn active" : "btn"}
                aria-pressed={tool === "place"}
                onClick={() => activateTool("place")}
              >
                配置
              </button>
              <button
                type="button"
                className={tool === "wire" ? "btn active" : "btn"}
                aria-pressed={tool === "wire"}
                onClick={() => activateTool("wire")}
              >
                配線
              </button>
            </div>
            <label className="workspace-part-picker">
              <span>部品</span>
              <select
                className="net-select"
                value={placeDefId}
                onChange={(event) => {
                  const id = event.target.value;
                  setPlaceDefId(id);
                  if (tool === "place") setPlaceArmedDefId(id);
                }}
              >
                {partGroups.map((category) => <optgroup key={category.id} label={category.label}>
                  {category.parts.map((def) => <option key={def.id} value={def.id}>{def.name}</option>)}
                </optgroup>)}
              </select>
            </label>
            <button
              type="button"
              className="btn"
              onClick={() => {
                const next = nextRot(activeRot);
                setActiveRot(next);
                if (placeArmedDefId) setPlaceArmedRot(next);
              }}
            >
              配置を回転 · {(placeArmedDefId ? placeArmedRot : activeRot).replace("Deg", "")}°
            </button>
            <div className="workspace-actions">
              {tool === "wire" ? (
                <>
                  <button type="button" className="btn" disabled={wireDraftPath.length < 2} onClick={() => void commitWireDraft()}>
                    配線を確定
                  </button>
                  <button type="button" className="btn" disabled={wireDraftPath.length === 0} onClick={() => setWireDraftPath([])}>
                    取消
                  </button>
                </>
              ) : null}
              <button type="button" className="btn" onClick={() => void undo()} disabled={!canUndo}>
                元に戻す
              </button>
              <button type="button" className="btn" onClick={() => void redo()} disabled={!canRedo}>
                やり直す
              </button>
              <button type="button" className="btn danger" onClick={handleDeleteSelected} disabled={!selectedPartId && !selectedWireId}>
                削除
              </button>
            </div>
            <div className="workspace-hint" role="status">
              <span>{toolHint}</span>
              <span>{selectedPart ? `選択: ${selectedPart.refdes}` : selectedWireId ? "配線を選択中" : ""}</span>
            </div>
          </div>
          <BoardCanvas
            board={board}
            parts={parts}
            partDefs={partDefs}
            nets={nets}
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
        </section>
        <section className="library-pane">
          <header className="library-header">
            <h2>部品ライブラリ</h2>
            <span>{partDefs.length} items</span>
          </header>
          <div className="library-filters" role="group" aria-label="部品カテゴリ">
            <button type="button" className="library-filter" aria-pressed={libraryCategory === "all"}
              onClick={() => setLibraryCategory("all")}>すべて</button>
            {partGroups.map((category) => {
              return (
                <button key={category.id} type="button" className="library-filter"
                  aria-pressed={libraryCategory === category.id}
                  onClick={() => setLibraryCategory(category.id)}>
                  {category.label} <span>{category.parts.length}</span>
                </button>
              );
            })}
          </div>
          <div className="library-list">
            {libraryGroups.map((category) => <section className="library-category" key={category.id} aria-label={category.label}>
              <h3>{category.label} <span>{category.parts.length}</span></h3>
              <div className="library-category-items">{category.parts.map((def) => {
              const armed = placeArmedDefId === def.id && tool === "place";
              return (
                <button
                  key={def.id}
                  type="button"
                  className={armed ? "part-card armed" : "part-card"}
                  onClick={() => armPlacement(def.id)}
                >
                  <div className={def.imageDataUrl ? "part-thumb with-image" : "part-thumb"}>
                    {def.imageDataUrl ? (
                      <img src={def.imageDataUrl} alt={def.name} className="part-thumb-image" style={def.imagePixelated ? { imageRendering: "pixelated" } : undefined} />
                    ) : (
                      partLabel(def.name)
                    )}
                  </div>
                  <div className="part-meta">
                    <strong>{def.name}</strong>
                    <span>Pins: {def.pins.length}</span>
                    <span>Occupied: {def.occupied.length}</span>
                  </div>
                </button>
              );
              })}</div>
            </section>)}
          </div>
        </section>
      </section>
      <aside className="editor-sidebar" aria-label="Part Editor">
        <section className="tool-card part-editor-card">
          <h2 className="card-title">Part Editor</h2>
          {editorDef && editorPreview ? (
            <div className="editor-preview-wrap">
              <div className="editor-preview-header">
                <div className="editor-preview-title">Preview</div>
                <div className="preview-zoom-tools">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setEditorPreviewZoom(1)}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setEditorPreviewZoom((prev) => Math.max(0.5, Number((prev / 1.25).toFixed(2))))
                    }
                  >
                    -
                  </button>
                  <span className="zoom-label">{editorPreviewZoom.toFixed(2)}x</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      setEditorPreviewZoom((prev) => Math.min(8, Number((prev * 1.25).toFixed(2))))
                    }
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="editor-preview-canvas">
                {(() => {
                  const span = editorPreview.fitSpan / editorPreviewZoom;
                  const viewMinX = editorPreview.centerX - span / 2;
                  const viewMinY = editorPreview.centerY - span / 2;
                  const gridStartX = Math.floor(viewMinX) - 1;
                  const gridEndX = Math.ceil(viewMinX + span) + 1;
                  const gridStartY = Math.floor(viewMinY) - 1;
                  const gridEndY = Math.ceil(viewMinY + span) + 1;
                  const gridXs = Array.from({ length: gridEndX - gridStartX + 1 }, (_, i) => gridStartX + i);
                  const gridYs = Array.from({ length: gridEndY - gridStartY + 1 }, (_, i) => gridStartY + i);
                  return (
                    <svg
                      viewBox={`${viewMinX - 0.5} ${viewMinY - 0.5} ${span} ${span}`}
                      className="editor-preview-svg"
                    >
                      {gridXs.map((x) => (
                        <line
                          key={`gx-${x}`}
                          x1={x}
                          y1={gridStartY}
                          x2={x}
                          y2={gridEndY}
                          className="preview-grid-line"
                        />
                      ))}
                      {gridYs.map((y) => (
                        <line
                          key={`gy-${y}`}
                          x1={gridStartX}
                          y1={y}
                          x2={gridEndX}
                          y2={y}
                          className="preview-grid-line"
                        />
                      ))}
                      {editorDef.imageDataUrl ? (
                        (() => {
                          const scale = editorDef.imageScale ?? 1;
                          const ox = editorDef.imageOffsetX ?? 0;
                          const oy = editorDef.imageOffsetY ?? 0;
                          const minX = editorPreview.minX - 0.5 + ox;
                          const maxX = editorPreview.maxX + 0.5 + ox;
                          const minY = editorPreview.minY - 0.5 + oy;
                          const maxY = editorPreview.maxY + 0.5 + oy;
                          const baseW = maxX - minX;
                          const baseH = maxY - minY;
                          const drawW = baseW * scale;
                          const drawH = baseH * scale;
                          const cx = minX + baseW / 2;
                          const cy = minY + baseH / 2;
                          return (
                            <image
                              href={editorDef.imageDataUrl}
                              imageRendering={editorDef.imagePixelated ? "pixelated" : undefined}
                              x={cx - drawW / 2}
                              y={cy - drawH / 2}
                              width={drawW}
                              height={drawH}
                              preserveAspectRatio="none"
                              className="preview-part-image"
                            />
                          );
                        })()
                      ) : null}
                      {editorDef.occupied.map((pt) => (
                        <rect
                          key={`occ-${pt.x}-${pt.y}`}
                          x={pt.x - 0.5}
                          y={pt.y - 0.5}
                          width={1}
                          height={1}
                          className="preview-occ-cell"
                        />
                      ))}
                      <rect
                        x={-0.5}
                        y={-0.5}
                        width={1}
                        height={1}
                        className="preview-origin-cell"
                      />
                      {editorDef.pins.map((pin) => (
                        <circle
                          key={`pin-${pin.name}`}
                          cx={pin.pos.x}
                          cy={pin.pos.y}
                          r={0.22}
                          className="preview-pin-dot"
                        >
                          <title>{`Pin ${pin.name} (${pin.pos.x}, ${pin.pos.y})`}</title>
                        </circle>
                      ))}
                    </svg>
                  );
                })()}
              </div>
              <div className="editor-preview-legend">
                <span><i className="legend-box origin" /> Origin</span>
                <span><i className="legend-box occupied" /> Occupied</span>
                <span><i className="legend-pin" /> Pin</span>
              </div>
            </div>
          ) : null}
          <div className="toolbar-row">
            <select
              className="net-select"
              value={editorDefId}
              onChange={(event) => setEditorDefId(event.target.value)}
            >
              {partGroups.map((category) => <optgroup key={category.id} label={category.label}>
                {category.parts.map((def) => <option key={def.id} value={def.id}>{def.name}</option>)}
              </optgroup>)}
            </select>
            <input
              type="text"
              className="net-input"
              value={editorDefName}
              placeholder="PartDef name"
              onChange={(event) => setEditorDefName(event.target.value)}
            />
            <button type="button" className="btn" onClick={renameEditorPartDef}>
              Rename Part
            </button>
            <button type="button" className="btn" onClick={createEditorPartDef}>
              New Part
            </button>
            <button type="button" className="btn danger" onClick={deleteEditorPartDef}>
              Delete Part
            </button>
          </div>
          {editorDef ? (
            <label className="part-category-editor">カテゴリ
              <select className="net-select" value={partCategory(editorDef)}
                onChange={(event) => {
                  const category = event.target.value;
                  if (!isPartCategory(category)) return;
                  void applyPartDefsChange(
                    (prev) => prev.map((def) => def.id === editorDefId ? { ...def, category } : def),
                    "部品カテゴリを更新しました。"
                  );
                }}>
                {PART_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
          ) : null}
          {editorNotice ? <div className="editor-notice">{editorNotice}</div> : null}
          <div className="editor-grid">
            <div className="editor-block">
              <h3 className="editor-title">Pin設定</h3>
              <div className="toolbar-row">
                <input
                  type="text"
                  className="coord-input"
                  value={editorPinName}
                  placeholder="Pin name"
                  onChange={(event) => setEditorPinName(event.target.value)}
                />
                <input
                  type="number"
                  className="coord-input"
                  value={editorPinX}
                  onChange={(event) => setEditorPinX(event.target.value)}
                />
                <input
                  type="number"
                  className="coord-input"
                  value={editorPinY}
                  onChange={(event) => setEditorPinY(event.target.value)}
                />
                <button type="button" className="btn" onClick={addEditorPin}>
                  Add Pin
                </button>
              </div>
              <table className="editor-table">
                <thead>
                  <tr>
                    <th>Pin名</th>
                    <th>X座標</th>
                    <th>Y座標</th>
                    <th className="action-col" />
                  </tr>
                </thead>
                <tbody>
                  {(editorDef?.pins ?? []).map((pin) => (
                    <tr key={pin.name}>
                      <td>{pin.name}</td>
                      <td>{pin.pos.x}</td>
                      <td>{pin.pos.y}</td>
                      <td className="action-col">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => removeEditorPin(pin.name)}
                          aria-label={`remove pin ${pin.name}`}
                          title="Delete"
                        >
                          <svg viewBox="0 0 24 24" className="trash-icon" aria-hidden="true">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="editor-block">
              <h3 className="editor-title">Occupied設定</h3>
              <div className="toolbar-row">
                <input
                  type="number"
                  className="coord-input"
                  value={editorOccX}
                  onChange={(event) => setEditorOccX(event.target.value)}
                />
                <input
                  type="number"
                  className="coord-input"
                  value={editorOccY}
                  onChange={(event) => setEditorOccY(event.target.value)}
                />
                <button type="button" className="btn" onClick={addEditorOccupied}>
                  Add Occ
                </button>
              </div>
              <table className="editor-table">
                <thead>
                  <tr>
                    <th>X座標</th>
                    <th>Y座標</th>
                    <th className="action-col" />
                  </tr>
                </thead>
                <tbody>
                  {(editorDef?.occupied ?? []).map((pt) => (
                    <tr key={`${pt.x}:${pt.y}`}>
                      <td>{pt.x}</td>
                      <td>{pt.y}</td>
                      <td className="action-col">
                        <button
                          type="button"
                          className="icon-btn"
                          onClick={() => removeEditorOccupied(pt.x, pt.y)}
                          aria-label={`remove occupied ${pt.x},${pt.y}`}
                          title="Delete"
                        >
                          <svg viewBox="0 0 24 24" className="trash-icon" aria-hidden="true">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="editor-block">
              <h3 className="editor-title">画像設定</h3>
              <div className="toolbar-row">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    partImageInputRef.current?.click();
                  }}
                >
                  Set Image
                </button>
                <button type="button" className="btn" onClick={clearEditorPartImage}>
                  Clear Image
                </button>
                <span className="net-label">
                  {editorDef?.imageDataUrl ? "画像: 設定済み" : "画像: 未設定"}
                </span>
              </div>
              <div className="image-control-row">
                <label className="net-label" htmlFor="editor-image-scale">
                  Scale
                </label>
                <input
                  id="editor-image-scale"
                  type="range"
                  min="0.1"
                  max="4"
                  step="0.05"
                  className="image-range"
                  value={imageScaleSlider}
                  onChange={(event) => setEditorImageScale(event.target.value)}
                  title="Image scale"
                />
                <input
                  type="number"
                  step="0.1"
                  className="coord-input"
                  value={editorImageScale}
                  onChange={(event) => setEditorImageScale(event.target.value)}
                  title="Image scale"
                />
              </div>
              <div className="image-control-row">
                <label className="net-label" htmlFor="editor-image-offset-x">
                  Offset X
                </label>
                <input
                  id="editor-image-offset-x"
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  className="image-range"
                  value={imageOffsetXSlider}
                  onChange={(event) => setEditorImageOffsetX(event.target.value)}
                  title="Image offset X"
                />
                <input
                  type="number"
                  step="0.1"
                  className="coord-input"
                  value={editorImageOffsetX}
                  onChange={(event) => setEditorImageOffsetX(event.target.value)}
                  title="Image offset X"
                />
              </div>
              <div className="image-control-row">
                <label className="net-label" htmlFor="editor-image-offset-y">
                  Offset Y
                </label>
                <input
                  id="editor-image-offset-y"
                  type="range"
                  min="-10"
                  max="10"
                  step="0.1"
                  className="image-range"
                  value={imageOffsetYSlider}
                  onChange={(event) => setEditorImageOffsetY(event.target.value)}
                  title="Image offset Y"
                />
                <input
                  type="number"
                  step="0.1"
                  className="coord-input"
                  value={editorImageOffsetY}
                  onChange={(event) => setEditorImageOffsetY(event.target.value)}
                  title="Image offset Y"
                />
              </div>
              <div className="toolbar-row">
                <button type="button" className="btn" onClick={applyEditorImageTransform}>
                  Apply
                </button>
              </div>
              <input
                ref={partImageInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    onPartImagePicked(file);
                  }
                  event.currentTarget.value = "";
                }}
              />
            </div>
            {editorDef && <PixelArtEditor key={editorDef.id} partDef={editorDef} onRegister={registerEditorPixelArt} />}
          </div>
          <div className="toolbar-row">
            <button type="button" className="btn" onClick={exportPartLibraryJson}>
              Export Library
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                partLibraryInputRef.current?.click();
              }}
            >
              Import Library
            </button>
          </div>
          <input
            ref={partLibraryInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void importPartLibraryJson(file);
              }
              event.currentTarget.value = "";
            }}
          />
        </section>
      </aside>
    </main>
  );
}
