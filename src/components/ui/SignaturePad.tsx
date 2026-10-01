import { useRef, useEffect } from 'react';

/** Minimal signature capture: draw with mouse/touch, clear, returns a PNG data URL. */
export function SignaturePad({ value, onChange, height = 72 }: {
  value: string | null;
  onChange: (v: string | null) => void;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth || 300;
    const h = c.clientHeight || height;
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#1e293b';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  useEffect(() => {
    if (!value) {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    }
  }, [value]);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const commit = () => {
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL('image/png'));
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full rounded border border-dashed border-slate-300 bg-white cursor-crosshair touch-none"
        style={{ height }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const c = canvasRef.current;
          const ctx = c?.getContext('2d');
          if (!c || !ctx) return;
          drawing.current = true;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + 0.1, p.y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current?.getContext('2d');
          if (!ctx) return;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          commit();
        }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div className="mt-1 flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Sign above</span>
        <button type="button" onClick={() => onChange(null)} className="text-[11px] font-semibold text-slate-500 hover:text-rose-600">
          Clear
        </button>
      </div>
    </div>
  );
}
