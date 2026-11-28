import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Eraser, PenLine, RotateCcw, Type } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

type SignatureMode = 'draw' | 'type';

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  color: string;
  width: number;
  points: Point[];
}

const INK_COLORS = [
  { id: 'black', label: 'Black Ink', hex: '#0f172a' },
  { id: 'blue', label: 'Royal Blue', hex: '#1d4ed8' },
  { id: 'navy', label: 'Navy Blue', hex: '#1e3a8a' },
] as const;

const PEN_WIDTHS = [
  { id: 'fine', label: 'Fine', px: 2 },
  { id: 'medium', label: 'Medium', px: 3 },
  { id: 'bold', label: 'Bold', px: 4.5 },
] as const;

const FONT_STYLES = [
  { id: 'script', label: 'Script', family: '"Segoe Script", "Brush Script MT", "Apple Chancery", cursive', italic: false },
  { id: 'classic', label: 'Classic', family: 'Georgia, "Times New Roman", serif', italic: true },
  { id: 'modern', label: 'Modern', family: 'system-ui, -apple-system, "Segoe UI", sans-serif', italic: true },
] as const;

/** Paint vector strokes onto a 2D context with quadratic smoothing. */
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (!s.points.length) continue;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.beginPath();
    const first = s.points[0];
    ctx.moveTo(first.x, first.y);
    if (s.points.length === 1) {
      ctx.lineTo(first.x + 0.1, first.y + 0.1);
    } else {
      for (let i = 1; i < s.points.length - 1; i++) {
        const mx = (s.points[i].x + s.points[i + 1].x) / 2;
        const my = (s.points[i].y + s.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
      }
      const last = s.points[s.points.length - 1];
      ctx.lineTo(last.x, last.y);
    }
    ctx.stroke();
  }
}

/**
 * Crops empty transparent borders from a signature canvas and scales down to maxEdge,
 * preserving transparency so it embeds crisply above signature lines in PDFs.
 */
function trimTransparentCanvas(source: HTMLCanvasElement, maxEdge = 500): string | null {
  const ctx = source.getContext('2d');
  if (!ctx || !source.width || !source.height) return null;
  const { width, height } = source;
  const pixels = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const pad = Math.max(10, Math.round(Math.min(width, height) * 0.04));
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const sw = Math.min(width - sx, maxX - minX + 1 + pad * 2);
  const sh = Math.min(height - sy, maxY - minY + 1 + pad * 2);

  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const outCtx = out.getContext('2d');
  if (!outCtx) return null;
  outCtx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

function renderTypedSignature(text: string, color: string, style: typeof FONT_STYLES[number]): string | null {
  const clean = text.trim();
  if (!clean) return null;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  const fontSize = 72;
  const font = `${style.italic ? 'italic ' : ''}${fontSize}px ${style.family}`;
  ctx.font = font;
  const measured = ctx.measureText(clean).width;
  c.width = Math.max(480, Math.ceil(measured) + 96);
  c.height = 180;

  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(clean, c.width / 2, c.height / 2);
  return trimTransparentCanvas(c);
}

/** Interactive modal to draw or type an authorized digital / e-signature and export as transparent PNG. */
export function SignatureCaptureModal({
  open,
  onClose,
  onSave,
  defaultName = '',
  saveLabel = 'Save & Use Signature',
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dataUrl: string) => void;
  defaultName?: string;
  saveLabel?: string;
}) {
  const [mode, setMode] = useState<SignatureMode>('draw');
  const [color, setColor] = useState<string>(INK_COLORS[0].hex);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1].px);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [typedText, setTypedText] = useState(defaultName);
  const [fontId, setFontId] = useState<typeof FONT_STYLES[number]['id']>('script');
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);

  // Reset pad errors cleanly and seed signatory name if empty each time the modal opens
  useEffect(() => {
    if (!open) return;
    setError(null);
    activeStrokeRef.current = null;
    if (defaultName) setTypedText((prev) => prev || defaultName);
  }, [open, defaultName]);

  const redrawCanvas = useCallback((extraStroke?: Stroke | null) => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth || 520;
    const h = c.clientHeight || 192;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const list = extraStroke ? [...strokes, extraStroke] : strokes;
    drawStrokes(ctx, list);
  }, [strokes]);

  useEffect(() => {
    if (!open || mode !== 'draw') return;
    const id = requestAnimationFrame(() => redrawCanvas());
    return () => cancelAnimationFrame(id);
  }, [open, mode, redrawCanvas]);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setError(null);
    const stroke: Stroke = { color, width: penWidth, points: [getPoint(e)] };
    activeStrokeRef.current = stroke;
    redrawCanvas(stroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const active = activeStrokeRef.current;
    if (!active) return;
    active.points.push(getPoint(e));
    redrawCanvas(active);
  };

  const finishStroke = () => {
    const active = activeStrokeRef.current;
    if (!active) return;
    activeStrokeRef.current = null;
    setStrokes((prev) => [...prev, active]);
  };

  const handleUndo = () => {
    setStrokes((prev) => prev.slice(0, -1));
    setError(null);
  };

  const handleClear = () => {
    activeStrokeRef.current = null;
    setStrokes([]);
    setTypedText('');
    setError(null);
  };

  const handleSave = () => {
    if (mode === 'draw') {
      if (!strokes.length || !canvasRef.current) {
        setError('Please sign in the box above before saving.');
        return;
      }
      redrawCanvas();
      const png = trimTransparentCanvas(canvasRef.current);
      if (!png) {
        setError('Signature appears empty. Please draw a clear signature.');
        return;
      }
      onSave(png);
      return;
    }

    const style = FONT_STYLES.find((f) => f.id === fontId) ?? FONT_STYLES[0];
    const png = renderTypedSignature(typedText, color, style);
    if (!png) {
      setError('Type a signature name above before saving.');
      return;
    }
    onSave(png);
  };

  const selectedStyle = FONT_STYLES.find((f) => f.id === fontId) ?? FONT_STYLES[0];
  const hasSignature = mode === 'draw' ? strokes.length > 0 : typedText.trim().length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Digital / E-Signature"
      subtitle="Draw or type your signature. Saved as a clean transparent PNG for PDFs."
      size="md"
      zIndex={60}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <div className="text-xs text-slate-500">
            {error ? <span role="alert" className="font-semibold text-red-600">{error}</span> : 'Transparent PNG · Auto-cropped'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!hasSignature}
              className={`flex items-center gap-1.5 h-10 px-4 text-sm font-bold text-white rounded-xl shadow-sm transition-colors ${
                hasSignature ? 'bg-orange-500 hover:bg-orange-600' : 'bg-orange-300 cursor-not-allowed'
              }`}
            >
              <Check size={15} /> {saveLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => { setMode('draw'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                mode === 'draw' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PenLine size={14} /> Draw Signature
            </button>
            <button
              type="button"
              onClick={() => { setMode('type'); setError(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${
                mode === 'type' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Type size={14} /> Type E-Signature
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5" role="group" aria-label="Ink color">
              {INK_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => setColor(c.hex)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    color === c.hex ? 'border-orange-500 scale-110 ring-2 ring-orange-200' : 'border-slate-200 hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            {mode === 'draw' && (
              <div className="flex items-center gap-1 border-l border-slate-200 pl-3" role="group" aria-label="Pen thickness">
                {PEN_WIDTHS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setPenWidth(w.px)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md border transition-colors ${
                      penWidth === w.px
                        ? 'bg-orange-50 border-orange-300 text-orange-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {mode === 'draw' ? (
          <div className="space-y-2">
            <div className="relative rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 overflow-hidden">
              {/* Visual guide line only (never painted into the exported transparent canvas) */}
              <div className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-slate-300/70" />
              {!strokes.length && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-slate-400 select-none">
                  Sign here using your mouse, trackpad, stylus, or finger
                </span>
              )}
              <canvas
                ref={canvasRef}
                aria-label="Signature drawing pad"
                className="relative z-10 block w-full h-48 cursor-crosshair touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Works with mouse, touch, and stylus.</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={!strokes.length}
                  className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  <RotateCcw size={13} /> Undo
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={!strokes.length}
                  className="inline-flex items-center gap-1 px-2.5 py-1 font-semibold text-rose-600 rounded-lg border border-slate-200 hover:bg-rose-50 disabled:opacity-40"
                >
                  <Eraser size={13} /> Clear
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label htmlFor="typed-sig-input" className="block text-[11px] font-bold uppercase tracking-wide text-slate-600 mb-1.5">
                Authorized Signatory Name
              </label>
              <input
                id="typed-sig-input"
                type="text"
                autoFocus
                value={typedText}
                onChange={(e) => { setTypedText(e.target.value); setError(null); }}
                placeholder="Type your name or signatory title"
                className="w-full h-11 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:bg-white focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              {FONT_STYLES.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setFontId(st.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                    fontId === st.id
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="h-32 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 flex items-center justify-center px-6 overflow-hidden">
              {typedText.trim() ? (
                <span
                  className="text-4xl truncate select-none"
                  style={{
                    color,
                    fontFamily: selectedStyle.family,
                    fontStyle: selectedStyle.italic ? 'italic' : 'normal',
                  }}
                >
                  {typedText.trim()}
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-400">E-signature preview will appear here</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
