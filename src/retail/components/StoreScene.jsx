/* The 3D store: a showroom with racks, products on every shelf, walking controls (drag to look, W A S D / arrows to move),
   and a viewer where the product itself turns. Loaded on demand (three.js is large). */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment, Lightformer, ContactShadows, MeshReflectorMaterial, Sparkles, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { computeLayout, placeOf, SLOT_W, ROW_H, RACK_D, EYE, CEILING } from './storeLayout';
export { computeLayout, placeOf };

/* ------------------------------------------------------------------ textures */
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function fitText(g, text, maxW, size, weight = 'bold') {
  let s = size; g.font = `${weight} ${s}px "Segoe UI", Arial, sans-serif`;
  while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = `${weight} ${s}px "Segoe UI", Arial, sans-serif`; }
}
const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

function useImageTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) { setTex(null); return undefined; }
    let alive = true, loaded = null;
    new THREE.TextureLoader().load(url, (t) => { if (!alive) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; loaded = t; setTex(t); }, undefined, () => { if (alive) setTex(null); });
    return () => { alive = false; if (loaded) loaded.dispose(); };
  }, [url]);
  return tex;
}

/* ------------------------------------------------------- a round body built from one photo */
const bodyCache = new Map();
function buildRoundBody(url) {
  if (bodyCache.has(url)) return bodyCache.get(url);
  const p = new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const scale = Math.min(1, 360 / Math.max(img.width, img.height));
        const W = Math.max(8, Math.round(img.width * scale)), H = Math.max(8, Math.round(img.height * scale));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, W, H);
        const d = g.getImageData(0, 0, W, H).data;
        // Find the product: the background colour of each row is read just inside the picture's edges (so frames and crop
        // lines are ignored), pixels that differ from it are "product", and only the connected blob in the middle is kept.
        const m = Math.max(4, Math.round(Math.min(W, H) * 0.03));
        const bg = (y) => {
          let r = 0, gg = 0, b = 0, n = 0;
          for (const x of [m + 1, m + 2, m + 3, m + 4, W - m - 5, W - m - 4, W - m - 3, W - m - 2]) { const i = (y * W + x) * 4; r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
          return [r / n, gg / n, b / n];
        };
        const mask = new Uint8Array(W * H);
        for (let y = m; y < H - m; y++) {
          const B = bg(y);
          for (let x = m; x < W - m; x++) {
            const i = (y * W + x) * 4;
            if (d[i + 3] >= 128 && Math.abs(d[i] - B[0]) + Math.abs(d[i + 1] - B[1]) + Math.abs(d[i + 2] - B[2]) > 66) mask[y * W + x] = 1;
          }
        }
        // the product blob: flood fill from the mask pixel closest to the middle of the picture
        let seed = -1;
        for (let rad = 0; rad < Math.max(W, H) / 2 && seed < 0; rad += 2) {
          for (let dy = -rad; dy <= rad && seed < 0; dy += 2) for (let dx = -rad; dx <= rad; dx += 2) {
            const x = Math.round(W / 2) + dx, y = Math.round(H / 2) + dy;
            if (x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x]) { seed = y * W + x; break; }
          }
        }
        if (seed < 0) throw new Error('no product found in the picture');
        const comp = new Uint8Array(W * H), queue = new Int32Array(W * H);
        let qh = 0, qt = 0, count = 0; queue[qt++] = seed; comp[seed] = 1;
        while (qh < qt) {
          const q = queue[qh++]; count++;
          const x = q % W, y = (q / W) | 0;
          for (const nb of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, y > 0 ? q - W : -1, y < H - 1 ? q + W : -1]) {
            if (nb >= 0 && mask[nb] && !comp[nb]) { comp[nb] = 1; queue[qt++] = nb; }
          }
        }
        const left = new Array(H).fill(-1), right = new Array(H).fill(-1);
        let bx0 = W, bx1 = 0, by0 = H, by1 = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) if (comp[y * W + x]) { left[y] = x; break; }
          for (let x = W - 1; x >= 0; x--) if (comp[y * W + x]) { right[y] = x; break; }
          if (left[y] >= 0) { bx0 = Math.min(bx0, left[y]); bx1 = Math.max(bx1, right[y]); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
        }
        const fill = count / ((bx1 - bx0 + 1) * (by1 - by0 + 1));
        // nothing recognisable (the "product" is the whole picture, or a thin speck): do not build a wrong shape
        if (count < W * H * 0.02 || (bx1 - bx0) > (W - 2 * m) * 0.96 && (by1 - by0) > (H - 2 * m) * 0.96 || fill < 0.35) throw new Error('could not find the product outline');
        const rows = []; for (let y = 0; y < H; y++) if (left[y] >= 0 && right[y] - left[y] > 4) rows.push(y);
        if (rows.length < 12) throw new Error('could not find the product outline');
        const top = rows[0], bottom = rows[rows.length - 1];
        const centres = rows.map((y) => (left[y] + right[y]) / 2).sort((a, b) => a - b);
        const cx = centres[Math.floor(centres.length / 2)];
        // radius per row, then a median filter to remove spikes (shadows, reflections)
        const rad = []; for (let y = top; y <= bottom; y++) rad.push(left[y] >= 0 ? (right[y] - left[y]) / 2 : 0);
        const med0 = rad.map((_, i) => { const w = rad.slice(Math.max(0, i - 5), i + 6).sort((a, b) => a - b); return w[Math.floor(w.length / 2)]; });
        // then average it, so the surface is smooth and not ribbed
        const med = med0.map((_, i) => { const w = med0.slice(Math.max(0, i - 6), i + 7); return w.reduce((a, b) => a + b, 0) / w.length; });
        const N = 40, pts = [new THREE.Vector2(0.001, H - top)];
        for (let i = 0; i <= N; i++) { const idx = Math.round((i / N) * (med.length - 1)); pts.push(new THREE.Vector2(Math.max(0.5, med[idx]), H - (top + idx))); }
        pts.push(new THREE.Vector2(0.001, H - bottom));
        const geo = new THREE.LatheGeometry(pts, 96);
        const pos = geo.attributes.position, uv = geo.attributes.uv;
        for (let i = 0; i < pos.count; i++) uv.setXY(i, (cx + pos.getX(i)) / W, pos.getY(i) / H);   // the photo is projected from the front
        const mid = H - (top + bottom) / 2, hgt = bottom - top;
        geo.translate(0, -mid, 0);
        const s = 1 / hgt; geo.scale(s, s, s);            // height 1
        geo.computeVertexNormals();
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
        resolve({ geo, tex });
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('picture could not be loaded'));
    img.src = url;
  });
  bodyCache.set(url, p);
  p.catch(() => bodyCache.delete(url));
  return p;
}
function useRoundBody(url) {
  const [body, setBody] = useState(null);
  useEffect(() => { let alive = true; setBody(null); if (url) buildRoundBody(url).then((b) => alive && setBody(b)).catch(() => alive && setBody(false)); return () => { alive = false; }; }, [url]);
  return body;   // null = building, false = failed
}

/* ------------------------------------------------------------------ products */
/* a packed product: a box with the picture on the front and back */
function PackBox({ name, imgUrl, size, dim }) {
  const tex = useImageTexture(imgUrl);
  const fallback = useMemo(() => canvasTexture(256, 320, (g, w, h) => {
    g.fillStyle = `hsl(${hue(name || 'p')} 45% 36%)`; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, name || 'Product', w - 28, 44); g.fillText(name || 'Product', w / 2, h / 2);
  }), [name]);
  useEffect(() => () => fallback.dispose(), [fallback]);
  const mats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: dim ? '#4b5563' : '#e5e7eb', roughness: 0.6 });
    const face = new THREE.MeshStandardMaterial({ map: tex || fallback, color: dim ? '#4b5563' : '#ffffff', roughness: 0.5 });
    return [side, side, side, side, face, face];
  }, [tex, fallback, dim]);
  return <mesh material={mats} castShadow><boxGeometry args={size} /></mesh>;
}

/* a round / turned product: a real 3D body made from its photo */
function RoundBody({ name, imgUrl, height, fallbackSize, dim, onFail }) {
  const body = useRoundBody(imgUrl);
  useEffect(() => { if (body === false && onFail) onFail(); }, [body, onFail]);
  if (!body) return <PackBox name={name} imgUrl={imgUrl} size={fallbackSize} dim={dim} />;
  return (
    <mesh geometry={body.geo} scale={[height, height, height]} castShadow>
      <meshStandardMaterial map={body.tex} color={dim ? '#4b5563' : '#ffffff'} metalness={0.3} roughness={0.45} envMapIntensity={1.1} />
    </mesh>
  );
}

class Guard extends Component {
  constructor(p) { super(p); this.state = { bad: false }; }
  static getDerivedStateFromError() { return { bad: true }; }
  render() { return this.state.bad ? this.props.fallback : this.props.children; }
}

function ProductOnShelf({ item, place, imgUrl, state, onPick }) {
  const group = useRef();
  const pulse = state === 'match' || state === 'target';
  const round = (item.shape ?? 'round') === 'round' && imgUrl;
  const h = round ? 0.5 : 0.55;
  const tag = useMemo(() => canvasTexture(256, 64, (g, w, hh) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, hh); g.fillStyle = '#0f172a'; g.textBaseline = 'middle';
    fitText(g, item.name, w - 16, 22); g.textAlign = 'left'; g.fillText(item.name, 8, 18);
    g.fillStyle = '#dc2626'; g.font = 'bold 26px "Segoe UI", Arial, sans-serif';
    const soldOut = item.stock_qty !== undefined && Number(item.stock_qty) <= 0;
    g.fillText(soldOut ? 'SOLD OUT' : item.price != null ? `Rs ${Number(item.price).toLocaleString('en-IN')}` : (item.sku || ''), 8, 46);
  }), [item.name, item.price, item.sku, item.stock_qty]);
  useEffect(() => () => tag.dispose(), [tag]);
  useFrame(({ clock }) => { if (group.current) group.current.scale.setScalar(pulse ? 1 + Math.sin(clock.elapsedTime * 5) * 0.045 : 1); });
  return (
    <group>
      <group ref={group} position={[place.x, place.y + h / 2, place.z + 0.03]}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; onPick(item); }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}>
        {round
          ? <RoundBody name={item.name} imgUrl={imgUrl} height={h} fallbackSize={[0.42, h, 0.32]} dim={state === 'dim'} />
          : <PackBox name={item.name} imgUrl={imgUrl} size={[0.42, h, 0.32]} dim={state === 'dim'} />}
        {pulse && (
          <>
            <pointLight color="#22c55e" intensity={2.2} distance={2.6} position={[0, 0.25, 0.6]} />
            <mesh position={[0, h / 2 + 0.2, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.09, 0.2, 16]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1.4} toneMapped={false} /></mesh>
          </>
        )}
      </group>
      {/* shelf-edge price tag */}
      <mesh position={[place.x, place.y - 0.04, place.z + RACK_D / 2 + 0.004]}><planeGeometry args={[SLOT_W - 0.08, (SLOT_W - 0.08) / 4]} /><meshBasicMaterial map={tag} toneMapped={false} /></mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ racks */
function Rack({ rack, store }) {
  const sign = useMemo(() => canvasTexture(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#1e3a8a'); gr.addColorStop(1, '#2563eb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 72px "Segoe UI", Arial, sans-serif'; g.fillText(`RACK ${rack.index}`, w / 2, h / 2 + 4);
  }), [rack.index]);
  useEffect(() => () => sign.dispose(), [sign]);
  const post = { color: '#1d4ed8', metalness: 0.5, roughness: 0.35 };
  const beam = { color: '#f97316', metalness: 0.4, roughness: 0.4 };
  const board = { color: '#d8dee8', metalness: 0.3, roughness: 0.45 };
  const xs = [-(rack.w / 2 - 0.04), rack.w / 2 - 0.04], zs = [-(rack.d / 2 - 0.04), rack.d / 2 - 0.04];
  return (
    <group position={[rack.x, 0, rack.z]}>
      {xs.flatMap((x) => zs.map((z) => <mesh key={`${x}${z}`} position={[x, rack.h / 2, z]} castShadow receiveShadow><boxGeometry args={[0.07, rack.h, 0.07]} /><meshStandardMaterial {...post} /></mesh>))}
      <mesh position={[0, rack.h / 2, -rack.d / 2 + 0.015]} receiveShadow><boxGeometry args={[rack.w - 0.08, rack.h, 0.02]} /><meshStandardMaterial color="#334155" roughness={0.8} metalness={0.2} /></mesh>
      {Array.from({ length: store.rows_per_rack + 1 }, (_, i) => (
        <group key={i} position={[0, 0.06 + i * ROW_H, 0]}>
          <mesh castShadow receiveShadow><boxGeometry args={[rack.w - 0.1, 0.06, rack.d]} /><meshStandardMaterial {...board} /></mesh>
          <mesh position={[0, -0.02, rack.d / 2 - 0.01]}><boxGeometry args={[rack.w - 0.08, 0.07, 0.03]} /><meshStandardMaterial {...beam} /></mesh>
        </group>
      ))}
      <mesh position={[0, rack.h + 0.22, rack.d / 2 - 0.02]}><boxGeometry args={[rack.w, 0.34, 0.05]} /><meshStandardMaterial color="#0f172a" roughness={0.5} /></mesh>
      <mesh position={[0, rack.h + 0.22, rack.d / 2 + 0.008]}><planeGeometry args={[rack.w - 0.12, 0.26]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ the walker */
function Walker({ layout, goTo, controlRef, onMove }) {
  const { camera, gl } = useThree();
  const keys = useRef({});
  const yaw = useRef(0);
  const pitch = useRef(-0.02);
  const pos = useRef({ x: 0, z: layout.zMax - 1.4 });
  const auto = useRef(null);
  const last = useRef(0);
  const drag = useRef(null);
  const bob = useRef(0);

  useEffect(() => {
    controlRef.current = { press: (k, down) => { keys.current[k] = down; } };
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
    const map = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'tl', d: 'r', arrowright: 'tr', q: 'tl', e: 'tr', shift: 'run' };
    const kd = (e) => { if (typing(e)) return; const k = map[e.key.toLowerCase()]; if (k) { keys.current[k] = true; if (e.key.startsWith('Arrow')) e.preventDefault(); } };
    const ku = (e) => { const k = map[e.key.toLowerCase()]; if (k) keys.current[k] = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    const el = gl.domElement;
    const pd = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const pm = (e) => {
      if (!drag.current) return;
      yaw.current -= (e.clientX - drag.current.x) * 0.0045;
      pitch.current = Math.max(-1.1, Math.min(1.1, pitch.current - (e.clientY - drag.current.y) * 0.0035));
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const pu = () => { drag.current = null; };
    el.addEventListener('pointerdown', pd); window.addEventListener('pointermove', pm); window.addEventListener('pointerup', pu);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); el.removeEventListener('pointerdown', pd); window.removeEventListener('pointermove', pm); window.removeEventListener('pointerup', pu); };
  }, [gl, controlRef]);

  useEffect(() => { if (goTo) auto.current = { x: goTo.x, z: goTo.z, yaw: 0 }; }, [goTo]);

  const blocked = (x, z) => {
    const m = 0.5;
    if (x < -layout.width / 2 + m || x > layout.width / 2 - m || z > layout.zMax - m || z < layout.zMin + m) return true;
    return layout.racks.some((r) => Math.abs(x - r.x) < r.w / 2 + 0.3 && Math.abs(z - r.z) < r.d / 2 + 0.3);
  };

  useFrame((_, dt) => {
    const k = keys.current;
    const d = Math.min(dt, 0.05);
    const turn = (k.tl ? 1 : 0) - (k.tr ? 1 : 0);
    const fwd = (k.f ? 1 : 0) - (k.b ? 1 : 0);
    const side = (k.r ? 1 : 0) - (k.l ? 1 : 0);
    if (turn || fwd || side) auto.current = null;
    yaw.current += turn * 1.8 * d;
    let moving = false;
    if (auto.current) {
      const a = auto.current;
      const f = Math.min(1, d * 2.4);
      const nx = pos.current.x + (a.x - pos.current.x) * f, nz = pos.current.z + (a.z - pos.current.z) * f;
      if (!blocked(nx, nz)) { pos.current.x = nx; pos.current.z = nz; }
      else if (!blocked(nx, pos.current.z)) pos.current.x = nx;
      else if (!blocked(pos.current.x, nz)) pos.current.z = nz;
      let dy = a.yaw - yaw.current; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * f;
      pitch.current += (-0.05 - pitch.current) * f;
      moving = true;
      if (Math.hypot(a.x - pos.current.x, a.z - pos.current.z) < 0.06) auto.current = null;
    } else if (fwd || side) {
      const sp = (k.run ? 5 : 2.8) * d;
      const sy = Math.sin(yaw.current), cy = Math.cos(yaw.current);
      const dx = (-sy * fwd + cy * side) * sp, dz = (-cy * fwd - sy * side) * sp;
      if (!blocked(pos.current.x + dx, pos.current.z)) pos.current.x += dx;
      if (!blocked(pos.current.x, pos.current.z + dz)) pos.current.z += dz;
      moving = true;
    }
    if (moving) bob.current += d * (k.run ? 11 : 7);
    camera.position.set(pos.current.x, EYE + (moving ? Math.sin(bob.current) * 0.018 : 0), pos.current.z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    const now = performance.now();
    if (now - last.current > 120) { last.current = now; onMove({ x: pos.current.x, z: pos.current.z, yaw: yaw.current }); }
  });
  return null;
}

/* ------------------------------------------------------------------ the room */
function Room({ layout, companyName, quality }) {
  const H = CEILING, T = 0.25;
  const signY = H - 0.95;
  const cz = (layout.zMax + layout.zMin) / 2;
  const tiles = useMemo(() => canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#262e3d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#0b0f17'; g.lineWidth = 4; g.strokeRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(4, 4, w - 8, h - 8);
  }), []);
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(layout.width / 1.8, layout.depth / 1.8);
  useEffect(() => () => tiles.dispose(), [tiles]);
  const brand = (companyName || 'Digital Store').toUpperCase();
  const signW = Math.min(layout.width - 1.6, 8.6);
  const sign = useMemo(() => canvasTexture(2048, 420, (g, w, h) => {
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#f97316'); gr.addColorStop(1, '#fb923c'); g.fillStyle = gr; g.fillRect(0, h - 22, w, 22); g.fillRect(0, 0, w, 10);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    fitText(g, brand, w - 220, 190); g.shadowColor = 'rgba(251,146,60,0.9)'; g.shadowBlur = 28; g.fillText(brand, w / 2, h / 2 - 14);
    g.shadowBlur = 0; g.fillStyle = '#93c5fd'; g.font = '600 56px "Segoe UI", Arial, sans-serif'; g.fillText('D I G I T A L   S T O R E', w / 2, h - 70);
  }), [brand]);
  useEffect(() => () => sign.dispose(), [sign]);
  const lights = useMemo(() => {
    const out = [];
    const nx = Math.max(2, Math.round(layout.width / 5.5)), nz = Math.max(2, Math.round(layout.depth / 5.5));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push([-layout.width / 2 + (i + 0.5) * (layout.width / nx), layout.zMax - (j + 0.5) * (layout.depth / nz)]);
    return out;
  }, [layout.width, layout.depth, layout.zMax]);
  const wall = { color: '#d9e0ea', roughness: 0.9 };
  return (
    <group>
      {quality === 'high'
        ? <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]} receiveShadow><planeGeometry args={[layout.width, layout.depth]} />
            <MeshReflectorMaterial map={tiles} blur={[260, 70]} resolution={512} mixBlur={1} mixStrength={1.6} roughness={0.55} depthScale={0} minDepthThreshold={0} maxDepthThreshold={1} color="#9aa3b5" metalness={0.5} mirror={0.6} /></mesh>
        : <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]} receiveShadow><planeGeometry args={[layout.width, layout.depth]} /><meshStandardMaterial map={tiles} roughness={0.32} metalness={0.55} envMapIntensity={1.1} /></mesh>}
      {/* ceiling, walls, skirting */}
      <mesh position={[0, H, cz]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[layout.width, layout.depth]} /><meshStandardMaterial color="#1b2433" roughness={0.95} /></mesh>
      {Array.from({ length: Math.ceil(layout.width / 5) + 1 }, (_, i) => (
        <mesh key={`b${i}`} position={[-layout.width / 2 + i * 5, H - 0.22, cz]}><boxGeometry args={[0.18, 0.34, layout.depth]} /><meshStandardMaterial color="#0f172a" metalness={0.5} roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, H / 2, layout.zMin]} receiveShadow><boxGeometry args={[layout.width, H, T]} /><meshStandardMaterial {...wall} /></mesh>
      <mesh position={[0, H / 2, layout.zMax]}><boxGeometry args={[layout.width, H, T]} /><meshStandardMaterial {...wall} /></mesh>
      <mesh position={[-layout.width / 2, H / 2, cz]} receiveShadow><boxGeometry args={[T, H, layout.depth]} /><meshStandardMaterial {...wall} /></mesh>
      <mesh position={[layout.width / 2, H / 2, cz]} receiveShadow><boxGeometry args={[T, H, layout.depth]} /><meshStandardMaterial {...wall} /></mesh>
      {[[0, layout.zMin + T / 2, layout.width, 0.12, 0.05], [-layout.width / 2 + T / 2, cz, 0.05, 0.12, layout.depth], [layout.width / 2 - T / 2, cz, 0.05, 0.12, layout.depth]].map(([x, z, w, hh, d], i) => (
        <mesh key={i} position={[x, hh / 2, z]}><boxGeometry args={[w, hh, d]} /><meshStandardMaterial color="#1e293b" roughness={0.6} /></mesh>
      ))}
      {/* the company sign on the back wall, with an accent panel behind it */}
      <mesh position={[0, signY, layout.zMin + T / 2 + 0.03]}><boxGeometry args={[signW + 0.3, signW / 4.876 + 0.3, 0.06]} /><meshStandardMaterial color="#0b1220" roughness={0.4} metalness={0.3} /></mesh>
      <mesh position={[0, signY, layout.zMin + T / 2 + 0.07]}><planeGeometry args={[signW, signW / 4.876]} /><meshBasicMaterial map={sign} toneMapped={false} /></mesh>
      <mesh position={[0, 0.8, layout.zMin + T / 2 + 0.02]}><boxGeometry args={[layout.width - 0.5, 1.5, 0.03]} /><meshStandardMaterial color="#dbe3ee" roughness={0.9} /></mesh>
      {/* glowing strips where the walls meet the ceiling */}
      <mesh position={[0, H - 0.12, layout.zMin + T / 2 + 0.02]}><boxGeometry args={[layout.width - 0.4, 0.05, 0.03]} /><meshBasicMaterial color="#fb923c" toneMapped={false} /></mesh>
      <mesh position={[-layout.width / 2 + T / 2 + 0.02, H - 0.12, cz]}><boxGeometry args={[0.03, 0.05, layout.depth - 0.4]} /><meshBasicMaterial color="#fb923c" toneMapped={false} /></mesh>
      <mesh position={[layout.width / 2 - T / 2 - 0.02, H - 0.12, cz]}><boxGeometry args={[0.03, 0.05, layout.depth - 0.4]} /><meshBasicMaterial color="#fb923c" toneMapped={false} /></mesh>
      {/* floor guide lines down the aisles */}
      {Array.from({ length: Math.max(1, Math.round((layout.zMax - layout.zMin) / 5.2)) }, (_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, layout.zMax - 2.4 - i * 5.2]}><planeGeometry args={[layout.width - 1, 0.09]} /><meshBasicMaterial color="#facc15" toneMapped={false} /></mesh>
      ))}
      {/* ceiling light panels and a few real lights */}
      {lights.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, H - 0.04, z]}><boxGeometry args={[2, 0.06, 0.4]} /><meshBasicMaterial color="#fffaf0" toneMapped={false} /></mesh>
          {i % 2 === 0 && <pointLight position={[x, H - 0.6, z]} intensity={22} distance={13} decay={1.6} color="#fff1dc" />}
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ the whole store */
export function StoreScene({ store, items, imageUrls, matchIds, targetId, goTo, controlRef, onMove, onPick, companyName, quality = 'high' }) {
  const layout = useMemo(() => computeLayout(store), [store]);
  const searching = matchIds && matchIds.size > 0;
  const high = quality === 'high';
  const cz = (layout.zMax + layout.zMin) / 2;
  return (
    <Canvas shadows={high} camera={{ fov: 68, near: 0.06, far: 90, position: [0, EYE, layout.zMax - 1.4] }} dpr={[1, high ? 1.8 : 1.25]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#0e1420']} />
      <fog attach="fog" args={['#0e1420', 18, 60]} />
      <ambientLight intensity={0.35} />
      <hemisphereLight args={['#dbe7ff', '#1b2333', 0.5]} />
      <directionalLight position={[layout.width * 0.25, CEILING + 6, cz + 8]} intensity={1.5} castShadow={high}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-camera-left={-layout.width / 2 - 2} shadow-camera-right={layout.width / 2 + 2}
        shadow-camera-top={layout.depth / 2 + 4} shadow-camera-bottom={-layout.depth / 2 - 4} shadow-camera-near={1} shadow-camera-far={60} />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[14, 10, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[-8, 3, 0]} rotation-y={Math.PI / 2} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[8, 3, 0]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} />
      </Environment>
      <Room layout={layout} companyName={companyName} quality={quality} />
      {high && <Sparkles count={70} scale={[layout.width, 3, layout.depth]} position={[0, 2, cz]} size={1.6} speed={0.15} opacity={0.3} color="#ffffff" />}
      {layout.racks.map((r) => <Rack key={r.index} rack={r} store={store} />)}
      {items.map((it) => {
        const place = placeOf(layout, store, it);
        if (!place) return null;
        const state = it.id === targetId ? 'target' : searching ? (matchIds.has(it.id) ? 'match' : 'dim') : 'normal';
        return <ProductOnShelf key={it.id} item={it} place={place} imgUrl={it.image_path ? imageUrls[it.image_path] : ''} state={state} onPick={onPick} />;
      })}
      <Walker layout={layout} goTo={goTo} controlRef={controlRef} onMove={onMove} />
    </Canvas>
  );
}

/* ------------------------------------------------------------------ the product viewer: the product itself turns */
function ModelBody({ url }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const s = 1.5 / Math.max(size.x, size.y, size.z || 1, 0.001);
    c.scale.setScalar(s);
    c.position.set(-centre.x * s, -box.min.y * s, -centre.z * s);
    c.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) o.material.envMapIntensity = 1.2; } });
    return c;
  }, [scene]);
  return <primitive object={obj} />;
}

function Turntable({ children }) {
  const group = useRef();
  const { gl } = useThree();
  const drag = useRef(null);
  const idle = useRef(0);
  useEffect(() => {
    const el = gl.domElement;
    const down = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!drag.current || !group.current) return;
      group.current.rotation.y += (e.clientX - drag.current.x) * 0.012;
      group.current.rotation.x = Math.max(-0.7, Math.min(0.7, group.current.rotation.x + (e.clientY - drag.current.y) * 0.006));
      drag.current = { x: e.clientX, y: e.clientY }; idle.current = 0;
    };
    const up = () => { drag.current = null; };
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [gl]);
  useFrame((_, dt) => {
    const g = group.current; if (!g) return;
    if (!drag.current) { idle.current += dt; if (idle.current > 1.5) { g.rotation.y += dt * 0.7; g.rotation.x += (0 - g.rotation.x) * Math.min(1, dt * 1.5); } }
  });
  return <group ref={group} position={[0, 0, 0]}>{children}</group>;
}

function ViewerBody({ item, imgUrl, modelUrl, onFail }) {
  if (item.shape === 'model' && modelUrl) {
    return <Guard fallback={<PackBox name={item.name} imgUrl={imgUrl} size={[1, 1.3, 0.7]} />}><ModelBody url={modelUrl} /></Guard>;
  }
  if (item.shape === 'round' && imgUrl) {
    return (
      <group position={[0, 0.78, 0]}><RoundBody name={item.name} imgUrl={imgUrl} height={1.5} fallbackSize={[1, 1.4, 0.7]} onFail={onFail} /></group>
    );
  }
  return <group position={[0, 0.72, 0]}><PackBox name={item.name} imgUrl={imgUrl} size={[1.1, 1.4, 0.75]} /></group>;
}

export function ProductViewer3D({ item, imgUrl, modelUrl, onFail }) {
  return (
    <Canvas shadows camera={{ position: [0, 1.25, 3.3], fov: 36 }} dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#0b1220']} />
      <fog attach="fog" args={['#0b1220', 6, 14]} />
      <ambientLight intensity={0.4} />
      <spotLight position={[3, 5, 3]} angle={0.5} penumbra={0.8} intensity={90} castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight position={[-4, 3, -3]} angle={0.7} penumbra={1} intensity={40} color="#93c5fd" />
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={3} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[8, 6, 1]} />
        <Lightformer form="rect" intensity={1.6} position={[-5, 2, 2]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[5, 2, -2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
      </Environment>
      {/* the display stand */}
      <mesh position={[0, -0.04, 0]} receiveShadow><cylinderGeometry args={[1.15, 1.2, 0.08, 64]} /><meshStandardMaterial color="#111827" metalness={0.7} roughness={0.25} /></mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.05, 1.1, 64]} /><meshBasicMaterial color="#f97316" toneMapped={false} /></mesh>
      <Suspense fallback={null}><Turntable><ViewerBody item={item} imgUrl={imgUrl} modelUrl={modelUrl} onFail={onFail} /></Turntable></Suspense>
      <ContactShadows position={[0, 0.005, 0]} opacity={0.55} scale={5} blur={2.4} far={2} />
      <OrbitControls enablePan={false} enableRotate={false} minDistance={1.8} maxDistance={6} target={[0, 0.75, 0]} />
    </Canvas>
  );
}
