/* 360 degree view from photos taken around the product: drag to turn it, it also turns by itself. */
import { useEffect, useRef, useState } from 'react';

export default function SpinViewer({ frames, name }) {
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(0);
  const drag = useRef(null);
  const idle = useRef(0);
  const n = frames.length;

  useEffect(() => { setReady(0); frames.forEach((u) => { const i = new Image(); i.onload = i.onerror = () => setReady((c) => c + 1); i.src = u; }); }, [frames]);

  useEffect(() => {
    const t = setInterval(() => { idle.current += 1; if (!drag.current && idle.current > 12) setIdx((i) => (i + 1) % n); }, 120);
    return () => clearInterval(t);
  }, [n]);

  const down = (e) => { drag.current = { x: e.clientX, start: idx }; idle.current = 0; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = (e) => {
    if (!drag.current) return;
    const steps = Math.round((e.clientX - drag.current.x) / 10);
    setIdx((((drag.current.start - steps) % n) + n) % n);
    idle.current = 0;
  };
  const up = () => { drag.current = null; };

  return (
    <div className="relative w-full h-full bg-gradient-to-b from-slate-900 to-slate-950 flex items-center justify-center select-none touch-none cursor-grab active:cursor-grabbing"
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={frames[idx]} alt={name} draggable={false} className="max-h-full max-w-full object-contain" />
      {ready < n && <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">Loading photos {ready}/{n}</div>}
      <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 bg-slate-800/70 px-2 py-0.5 rounded">360° · {idx + 1}/{n}</div>
    </div>
  );
}
