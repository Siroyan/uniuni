import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { PartDef } from "./types";

type Props = {
  partDef: PartDef;
  onRegister: (dataUrl: string) => Promise<boolean>;
};

const PIXELS_PER_CELL = 8;
const DISPLAY_PIXEL_SIZE = 10;
const MAX_PIXELS = 512 * 512;
const PALETTE = ["#26364a", "#ffffff", "#94a3b8", "#b45309", "#eab308", "#dc2626", "#2563eb", "#16a34a"];

function footprintSize(def: PartDef): { width: number; height: number } {
  const xs = def.occupied.map((point) => point.x);
  const ys = def.occupied.map((point) => point.y);
  return {
    width: (Math.max(...xs) - Math.min(...xs) + 1) * PIXELS_PER_CELL,
    height: (Math.max(...ys) - Math.min(...ys) + 1) * PIXELS_PER_CELL
  };
}

export function PixelArtEditor({ partDef, onRegister }: Props): JSX.Element {
  const { width, height } = useMemo(() => footprintSize(partDef), [partDef.occupied]);
  const validSize = width > 0 && height > 0 && width * height <= MAX_PIXELS;
  const [pixels, setPixels] = useState<string[]>([]);
  const [color, setColor] = useState(PALETTE[0]);
  const [eraser, setEraser] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    setPixels(validSize ? Array(width * height).fill("") : []);
    setDirty(false);
    setLoadError(false);
    if (!validSize || !partDef.imageDataUrl) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const image = new Image();
    setLoading(true);
    image.onload = () => {
      if (cancelled) return;
      try {
        const source = document.createElement("canvas");
        source.width = width;
        source.height = height;
        const context = source.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas 2D is unavailable");
        context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const next = Array.from({ length: width * height }, (_, index) => {
          const offset = index * 4;
          if (data[offset + 3] < 128) return "";
          return `#${Array.from(data.slice(offset, offset + 3), (value) => value.toString(16).padStart(2, "0")).join("")}`;
        });
        setPixels(next);
      } catch {
        setLoadError(true);
      }
      setLoading(false);
    };
    image.onerror = () => {
      if (cancelled) return;
      setLoadError(true);
      setLoading(false);
    };
    image.src = partDef.imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [partDef.id, partDef.imageDataUrl, width, height, validSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !validSize) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, width, height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        context.fillStyle = pixels[y * width + x] || ((x + y) % 2 === 0 ? "#ffffff" : "#edf2f7");
        context.fillRect(x, y, 1, 1);
      }
    }
  }, [pixels, width, height, validSize]);

  const pointAt = (event: PointerEvent<HTMLCanvasElement>): { x: number; y: number } | null => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * height);
    return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
  };

  const paintLine = (from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const ink = eraser ? "" : color;
    setPixels((previous) => {
      const next = [...previous];
      let x = from.x;
      let y = from.y;
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      const sx = from.x < to.x ? 1 : -1;
      const sy = from.y < to.y ? 1 : -1;
      let error = dx - dy;
      while (true) {
        next[y * width + x] = ink;
        if (x === to.x && y === to.y) break;
        const twiceError = 2 * error;
        if (twiceError > -dy) {
          error -= dy;
          x += sx;
        }
        if (twiceError < dx) {
          error += dx;
          y += sy;
        }
      }
      return next;
    });
    setDirty(true);
  };

  const onPointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (loading || saving || (event.pointerType === "mouse" && event.button !== 0)) return;
    const point = pointAt(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeRef.current = { pointerId: event.pointerId, ...point };
    paintLine(point, point);
  };

  const onPointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    const stroke = strokeRef.current;
    if (!stroke || stroke.pointerId !== event.pointerId) return;
    const point = pointAt(event);
    if (!point) return;
    paintLine(stroke, point);
    strokeRef.current = { pointerId: event.pointerId, ...point };
  };

  const register = async (): Promise<void> => {
    const image = document.createElement("canvas");
    image.width = width;
    image.height = height;
    const context = image.getContext("2d");
    if (!context) return;
    pixels.forEach((pixel, index) => {
      if (!pixel) return;
      context.fillStyle = pixel;
      context.fillRect(index % width, Math.floor(index / width), 1, 1);
    });
    setSaving(true);
    try {
      if (await onRegister(image.toDataURL("image/png"))) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-block pixel-art-editor">
      <h3 className="editor-title">ドット絵</h3>
      {validSize ? (
        <>
          <p className="pixel-art-help">{width} × {height} ドット（1穴 = 8 × 8 ドット）。ドラッグして描けます。</p>
          <div className="pixel-art-tools" aria-label="描画ツール">
            {PALETTE.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`pixel-art-swatch${!eraser && color === swatch ? " selected" : ""}`}
                style={{ backgroundColor: swatch }}
                aria-label={`色 ${swatch}`}
                aria-pressed={!eraser && color === swatch}
                onClick={() => { setColor(swatch); setEraser(false); }}
              />
            ))}
            <input
              type="color"
              value={color}
              aria-label="描画色"
              title="描画色"
              onChange={(event) => { setColor(event.target.value); setEraser(false); }}
            />
            <button type="button" className={`btn${eraser ? " active" : ""}`} aria-pressed={eraser} onClick={() => setEraser(true)}>
              消しゴム
            </button>
          </div>
          <div className="pixel-art-viewport">
            <div className="pixel-art-surface" style={{ width: width * DISPLAY_PIXEL_SIZE, height: height * DISPLAY_PIXEL_SIZE }}>
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="pixel-art-canvas"
                role="img"
                aria-label={`${partDef.name} のドット絵キャンバス ${width}×${height}`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => { strokeRef.current = null; }}
                onPointerCancel={() => { strokeRef.current = null; }}
                onLostPointerCapture={() => { strokeRef.current = null; }}
              />
              <div className="pixel-art-grid" aria-hidden="true" />
            </div>
          </div>
          {loadError && <p className="pixel-art-help" role="alert">既存画像を読み込めませんでした。空のキャンバスから描けます。</p>}
          <div className="toolbar-row">
            <button type="button" className="btn" disabled={loading || saving || !pixels.some(Boolean)} onClick={() => { void register(); }}>
              部品画像に登録
            </button>
            <button type="button" className="btn" disabled={loading || saving || !pixels.some(Boolean)} onClick={() => { setPixels(Array(width * height).fill("")); setDirty(true); }}>
              描画を消去
            </button>
            {dirty && <span className="net-label">未登録の変更あり</span>}
          </div>
        </>
      ) : (
        <p className="pixel-art-help">部品が大きすぎるため、ドット絵を編集できません。</p>
      )}
    </div>
  );
}
