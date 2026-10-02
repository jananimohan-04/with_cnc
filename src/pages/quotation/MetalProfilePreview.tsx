import { PROFILE_BY_ID, LENGTH_KEY, UNIT_TO_MM, type DimMap, type ProfileId, type ProfileSpec } from '@/lib/metalCalc';
import { buildShape } from '@/lib/metalShapes';

function toMm(dims: DimMap, key: string, fallback: number): number {
  const v = dims[key];
  if (!v) return fallback;
  const n = Number(v.value.trim().replace(/,/g, ''));
  return v.value.trim() !== '' && Number.isFinite(n) && n > 0 ? n * UNIT_TO_MM[v.unit] : fallback;
}

/** Numeric dimensions in mm for drawing; blanks / invalid entries fall back to the profile defaults. */
function drawingDims(profile: ProfileSpec, dims: DimMap): Record<string, number> {
  const d: Record<string, number> = {};
  for (const f of profile.fields) d[f.key] = toMm(dims, f.key, Number(f.default));
  return d;
}

const label = (dims: DimMap, key: string, fallbackMm: string) => {
  const v = dims[key];
  const n = v ? Number(v.value.trim().replace(/,/g, '')) : NaN;
  return v && v.value.trim() !== '' && Number.isFinite(n) && n > 0 ? `${v.value.trim()} ${v.unit}` : `${fallbackMm} mm`;
};

const ORANGE = '#ea580c';

/** Large cross-section drawing with dimension lines, redrawn live from the entered values. */
export function ProfilePreview({ profile, dims }: { profile: ProfileSpec; dims: DimMap }) {
  const shape = buildShape(profile.id, drawingDims(profile, dims));
  const W = 320, H = 190;
  const scale = Math.min(170 / shape.w, 96 / shape.h);
  const sw = shape.w * scale, sh = shape.h * scale;
  const x0 = 150 - sw / 2, y0 = 74 - sh / 2;
  const x1 = x0 + sw, y1 = y0 + sh;

  const hKey = profile.dimLines.horizontal;
  const vKey = profile.dimLines.vertical;
  const fieldOf = (k: string) => profile.fields.find(f => f.key === k);
  const others = profile.fields.filter(f => f.key !== hKey && f.key !== vKey);
  const lengthShort = /\((.+)\)/.exec(profile.lengthLabel)?.[1] ?? 'L';

  const tick = (x: number, y: number, vertical: boolean) =>
    vertical ? <line x1={x - 4} y1={y} x2={x + 4} y2={y} stroke={ORANGE} strokeWidth={1} /> : <line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke={ORANGE} strokeWidth={1} />;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full max-h-[230px]" role="img" aria-label={`${profile.name} cross-section`}>
      <g transform={`translate(${x0} ${y0}) scale(${scale})`}>
        <path d={shape.d} fillRule="evenodd" fill="#e2e8f0" stroke="#475569" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>

      {hKey && fieldOf(hKey) && (
        <g>
          <line x1={x0} y1={y1 + 16} x2={x1} y2={y1 + 16} stroke={ORANGE} strokeWidth={1} />
          {tick(x0, y1 + 16, false)}{tick(x1, y1 + 16, false)}
          <text x={(x0 + x1) / 2} y={y1 + 30} textAnchor="middle" fontSize={10} fill={ORANGE}>
            {fieldOf(hKey)!.short} {label(dims, hKey, fieldOf(hKey)!.default)}
          </text>
        </g>
      )}
      {vKey && fieldOf(vKey) && (
        <g>
          <line x1={x1 + 16} y1={y0} x2={x1 + 16} y2={y1} stroke={ORANGE} strokeWidth={1} />
          {tick(x1 + 16, y0, true)}{tick(x1 + 16, y1, true)}
          <text x={x1 + 23} y={(y0 + y1) / 2 + 3} fontSize={10} fill={ORANGE}>
            {fieldOf(vKey)!.short} {label(dims, vKey, fieldOf(vKey)!.default)}
          </text>
        </g>
      )}

      {others.map((f, i) => (
        <text key={f.key} x={8} y={16 + i * 13} fontSize={10} fill={ORANGE}>{f.short} {label(dims, f.key, f.default)}</text>
      ))}
      <text x={W - 8} y={H - 8} textAnchor="end" fontSize={10} fill="#64748b">
        {lengthShort} {label(dims, LENGTH_KEY, profile.lengthDefault)}
      </text>
    </svg>
  );
}

/** Small outline icon of a profile's cross-section, for the picker. Inherits the text colour. */
export function ProfileGlyph({ id, size = 22 }: { id: ProfileId; size?: number }) {
  const profile = PROFILE_BY_ID[id];
  const d: Record<string, number> = {};
  for (const f of profile.fields) d[f.key] = Number(f.default);
  const shape = buildShape(id, d);
  const box = size - 4;
  const scale = Math.min(box / shape.w, box / shape.h);
  const tx = (size - shape.w * scale) / 2;
  const ty = (size - shape.h * scale) / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
        <path d={shape.d} fillRule="evenodd" fill="currentColor" fillOpacity={0.14} stroke="currentColor" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      </g>
    </svg>
  );
}
