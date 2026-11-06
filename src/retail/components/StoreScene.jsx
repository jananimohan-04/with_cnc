/* The 3D store: a room with racks, a product on every filled place, walking controls (drag to look, W A S D / arrows to move)
   and a rotating 3D view of one product. Loaded on demand (three.js is large). */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';

import { computeLayout, placeOf, SLOT_W, ROW_H, RACK_D, EYE } from './storeLayout';
export { computeLayout, placeOf };

function labelTexture(text, { w = 512, h = 128, bg = '#0f172a', fg = '#f8fafc', size = 64 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  // shrink long names to fit
  let s = size; while (g.measureText(text).width > w - 24 && s > 14) { s -= 2; g.font = `bold ${s}px sans-serif`; }
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function useImageTexture(url) {
  const [tex, setTex] = useState(null);
  useEffect(() => {
    if (!url) { setTex(null); return undefined; }
    let alive = true, loaded = null;
    new THREE.TextureLoader().load(url, (t) => { if (!alive) { t.dispose(); return; } t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; loaded = t; setTex(t); }, undefined, () => { if (alive) setTex(null); });
    return () => { alive = false; if (loaded) loaded.dispose(); };
  }, [url]);
  return tex;
}

const hue = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };

/* a product: a box with its picture on the front */
function Box({ name, imgUrl, size, glow = 0 }) {
  const tex = useImageTexture(imgUrl);
  const fallback = useMemo(() => labelTexture(name || 'Product', { w: 256, h: 320, bg: `hsl(${hue(name || 'p')} 45% 38%)`, size: 44 }), [name]);
  useEffect(() => () => fallback.dispose(), [fallback]);
  const side = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.7 }), []);
  const front = useMemo(() => new THREE.MeshStandardMaterial({ map: tex || fallback, roughness: 0.55, emissive: '#22c55e', emissiveIntensity: 0 }), [tex, fallback]);
  useEffect(() => { front.emissiveIntensity = glow; }, [front, glow]);
  const mats = useMemo(() => [side, side, side, side, front, front], [side, front]);
  return <mesh material={mats}><boxGeometry args={size} /></mesh>;
}

function Product({ item, place, imgUrl, state, onPick }) {
  const group = useRef();
  const pulse = state === 'match' || state === 'target';
  useFrame(({ clock }) => {
    if (!group.current) return;
    const k = pulse ? 1 + Math.sin(clock.elapsedTime * 5) * 0.04 : 1;
    group.current.scale.setScalar(k);
  });
  const dim = state === 'dim';
  return (
    <group ref={group} position={[place.x, place.y + 0.29, place.z + 0.04]}
      onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; onPick(item); }}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { document.body.style.cursor = ''; }}>
      <Box name={item.name} imgUrl={imgUrl} size={[0.42, 0.55, 0.32]} glow={pulse ? 0.55 : 0} />
      {dim && <mesh position={[0, 0, 0.17]}><planeGeometry args={[0.42, 0.55]} /><meshBasicMaterial color="#0f172a" transparent opacity={0.45} /></mesh>}
      {pulse && (
        <>
          <pointLight color="#22c55e" intensity={1.6} distance={2.2} position={[0, 0.2, 0.5]} />
          <mesh position={[0, 0.62, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[0.1, 0.22, 16]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.8} /></mesh>
        </>
      )}
    </group>
  );
}

function Rack({ rack, store }) {
  const sign = useMemo(() => labelTexture(`RACK ${rack.index}`, { w: 384, h: 96, bg: '#1d4ed8', size: 54 }), [rack.index]);
  useEffect(() => () => sign.dispose(), [sign]);
  const metal = '#475569';
  return (
    <group position={[rack.x, 0, rack.z]}>
      {[-1, 1].map((s) => <mesh key={s} position={[s * (rack.w / 2 - 0.04), rack.h / 2, 0]}><boxGeometry args={[0.07, rack.h, rack.d]} /><meshStandardMaterial color={metal} metalness={0.4} roughness={0.5} /></mesh>)}
      <mesh position={[0, rack.h / 2, -rack.d / 2 + 0.02]}><boxGeometry args={[rack.w - 0.1, rack.h, 0.03]} /><meshStandardMaterial color="#94a3b8" roughness={0.8} /></mesh>
      {Array.from({ length: store.rows_per_rack + 1 }, (_, i) => (
        <mesh key={i} position={[0, 0.06 + i * ROW_H, 0]}><boxGeometry args={[rack.w - 0.1, 0.05, rack.d]} /><meshStandardMaterial color="#cbd5e1" metalness={0.2} roughness={0.5} /></mesh>
      ))}
      <mesh position={[0, rack.h + 0.3, 0.05]}><planeGeometry args={[1.5, 0.375]} /><meshBasicMaterial map={sign} /></mesh>
    </group>
  );
}

/* the walker: drag to look, W A S D / arrow keys to move, Shift to run, and an automatic walk to a chosen place */
function Walker({ layout, goTo, controlRef, onMove }) {
  const { camera, gl } = useThree();
  const keys = useRef({});
  const yaw = useRef(0);
  const pitch = useRef(-0.02);
  const pos = useRef({ x: 0, z: layout.zMax - 1.2 });
  const auto = useRef(null);
  const last = useRef(0);
  const drag = useRef(null);

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
    const m = 0.45;
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
    if (auto.current) {
      const a = auto.current;
      const f = Math.min(1, d * 2.4);
      const nx = pos.current.x + (a.x - pos.current.x) * f, nz = pos.current.z + (a.z - pos.current.z) * f;
      // walk around racks if the straight line is blocked: slide on one axis
      if (!blocked(nx, nz)) { pos.current.x = nx; pos.current.z = nz; }
      else if (!blocked(nx, pos.current.z)) pos.current.x = nx;
      else if (!blocked(pos.current.x, nz)) pos.current.z = nz;
      let dy = a.yaw - yaw.current; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      yaw.current += dy * f;
      pitch.current += (-0.05 - pitch.current) * f;
      if (Math.hypot(a.x - pos.current.x, a.z - pos.current.z) < 0.06) auto.current = null;
    } else if (fwd || side) {
      const sp = (k.run ? 5 : 2.8) * d;
      const sy = Math.sin(yaw.current), cy = Math.cos(yaw.current);
      const dx = (-sy * fwd + cy * side) * sp, dz = (-cy * fwd - sy * side) * sp;
      if (!blocked(pos.current.x + dx, pos.current.z)) pos.current.x += dx;
      if (!blocked(pos.current.x, pos.current.z + dz)) pos.current.z += dz;
    }
    camera.position.set(pos.current.x, EYE, pos.current.z);
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');
    const now = performance.now();
    if (now - last.current > 120) { last.current = now; onMove({ x: pos.current.x, z: pos.current.z, yaw: yaw.current }); }
  });
  return null;
}

function Room({ layout }) {
  const floor = useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#cbd5e1'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e2e8f0'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(layout.width / 1.6, layout.depth / 1.6); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [layout.width, layout.depth]);
  useEffect(() => () => floor.dispose(), [floor]);
  const cz = (layout.zMax + layout.zMin) / 2, H = 3.6, T = 0.2;
  const wall = <meshStandardMaterial color="#f1f5f9" roughness={0.9} />;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, cz]}><planeGeometry args={[layout.width, layout.depth]} /><meshStandardMaterial map={floor} roughness={0.85} /></mesh>
      <mesh position={[0, H, cz]} rotation={[Math.PI / 2, 0, 0]}><planeGeometry args={[layout.width, layout.depth]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      <mesh position={[0, H / 2, layout.zMin]}><boxGeometry args={[layout.width, H, T]} />{wall}</mesh>
      <mesh position={[0, H / 2, layout.zMax]}><boxGeometry args={[layout.width, H, T]} />{wall}</mesh>
      <mesh position={[-layout.width / 2, H / 2, cz]}><boxGeometry args={[T, H, layout.depth]} />{wall}</mesh>
      <mesh position={[layout.width / 2, H / 2, cz]}><boxGeometry args={[T, H, layout.depth]} />{wall}</mesh>
      {Array.from({ length: Math.ceil(layout.depth / 5) }, (_, i) => Array.from({ length: Math.ceil(layout.width / 6) }, (_, j) => (
        <pointLight key={`${i}-${j}`} position={[-layout.width / 2 + 3 + j * 6, H - 0.4, layout.zMax - 2.5 - i * 5]} intensity={5} distance={9} decay={1.6} color="#fff7ed" />
      )))}
    </group>
  );
}

/* the whole store. items: [{id, rack, row_no, slot, name, ...}]; matchIds highlights found products; targetId is the one being walked to */
export function StoreScene({ store, items, imageUrls, matchIds, targetId, goTo, controlRef, onMove, onPick }) {
  const layout = useMemo(() => computeLayout(store), [store]);
  const searching = matchIds && matchIds.size > 0;
  return (
    <Canvas camera={{ fov: 70, near: 0.1, far: 80, position: [0, EYE, layout.zMax - 1.2] }} dpr={[1, 1.6]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#cbd5e1']} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#ffffff', '#94a3b8', 0.6]} />
      <Room layout={layout} />
      {layout.racks.map((r) => <Rack key={r.index} rack={r} store={store} />)}
      {items.map((it) => {
        const place = placeOf(layout, store, it);
        if (!place) return null;
        const state = it.id === targetId ? 'target' : searching ? (matchIds.has(it.id) ? 'match' : 'dim') : 'normal';
        return <Product key={it.id} item={it} place={place} imgUrl={it.image_path ? imageUrls[it.image_path] : ''} state={state} onPick={onPick} />;
      })}
      <Walker layout={layout} goTo={goTo} controlRef={controlRef} onMove={onMove} />
    </Canvas>
  );
}

/* a product turning in 3D (drag to rotate, scroll / pinch to zoom) */
export function ProductViewer3D({ name, imgUrl }) {
  return (
    <Canvas camera={{ position: [0, 0.25, 2.6], fov: 38 }} dpr={[1, 2]} style={{ touchAction: 'none' }}>
      <color attach="background" args={['#0f172a']} />
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight position={[-3, -1, -4]} intensity={0.6} />
      <Box name={name} imgUrl={imgUrl} size={[1.2, 1.55, 0.8]} />
      <OrbitControls enablePan={false} autoRotate autoRotateSpeed={3} minDistance={1.6} maxDistance={5} />
    </Canvas>
  );
}
