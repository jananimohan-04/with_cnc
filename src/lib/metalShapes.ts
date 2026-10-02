// Cross-section outlines for the Metal Calculator preview. Pure geometry: every shape is returned
// in the same unit as the input (mm), with its top-left corner at (0, 0), as one SVG path.
// Holes (tubes, rings) are separate sub-paths; draw with fill-rule="evenodd".
import type { ProfileId } from './metalCalc';

export interface Shape { w: number; h: number; d: string }

const r = (n: number) => Math.round(n * 1000) / 1000;
const poly = (pts: [number, number][]) => 'M ' + pts.map(([x, y]) => `${r(x)} ${r(y)}`).join(' L ') + ' Z';
const circle = (cx: number, cy: number, rad: number) =>
  `M ${r(cx - rad)} ${r(cy)} a ${r(rad)} ${r(rad)} 0 1 0 ${r(2 * rad)} 0 a ${r(rad)} ${r(rad)} 0 1 0 ${r(-2 * rad)} 0 Z`;
const rect = (x: number, y: number, w: number, h: number) => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

/** Keep a wall / flange thickness drawable even if the user typed something impossible. */
const clamp = (v: number, max: number) => Math.max(0, Math.min(v, max));

export function buildShape(id: ProfileId, d: Record<string, number>): Shape {
  switch (id) {
    case 'round-bar':
      return { w: d.d, h: d.d, d: circle(d.d / 2, d.d / 2, d.d / 2) };
    case 'square-bar':
      return { w: d.a, h: d.a, d: rect(0, 0, d.a, d.a) };
    case 'flat-bar':
      return { w: d.w, h: d.t, d: rect(0, 0, d.w, d.t) };
    case 'hex-bar': {
      // Flats top and bottom; "across flats" is the vertical size.
      const R = d.s / Math.sqrt(3);
      const pts: [number, number][] = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return [R + R * Math.cos(a), d.s / 2 + R * Math.sin(a)];
      });
      return { w: 2 * R, h: d.s, d: poly(pts) };
    }
    case 'octagonal-bar': {
      const R = d.s / (2 * Math.cos(Math.PI / 8));
      const pts: [number, number][] = Array.from({ length: 8 }, (_, i) => {
        const a = Math.PI / 8 + (Math.PI / 4) * i;
        return [d.s / 2 + R * Math.cos(a), d.s / 2 + R * Math.sin(a)];
      });
      return { w: d.s, h: d.s, d: poly(pts) };
    }
    case 'round-tube': {
      const t = clamp(d.t, d.d / 2 - 0.01);
      return { w: d.d, h: d.d, d: circle(d.d / 2, d.d / 2, d.d / 2) + ' ' + circle(d.d / 2, d.d / 2, d.d / 2 - t) };
    }
    case 'square-tube': {
      const t = clamp(d.t, d.a / 2 - 0.01);
      return { w: d.a, h: d.a, d: rect(0, 0, d.a, d.a) + ' ' + rect(t, t, d.a - 2 * t, d.a - 2 * t) };
    }
    case 'rect-tube': {
      const t = clamp(d.t, Math.min(d.h, d.b) / 2 - 0.01);
      return { w: d.b, h: d.h, d: rect(0, 0, d.b, d.h) + ' ' + rect(t, t, d.b - 2 * t, d.h - 2 * t) };
    }
    case 'angle': {
      const t = clamp(d.t, Math.min(d.a, d.b) - 0.01);
      return { w: d.a, h: d.b, d: poly([[0, 0], [t, 0], [t, d.b - t], [d.a, d.b - t], [d.a, d.b], [0, d.b]]) };
    }
    case 'channel': {
      const tf = clamp(d.tf, d.h / 2 - 0.01);
      const tw = clamp(d.tw, d.b - 0.01);
      return { w: d.b, h: d.h, d: poly([[0, 0], [d.b, 0], [d.b, tf], [tw, tf], [tw, d.h - tf], [d.b, d.h - tf], [d.b, d.h], [0, d.h]]) };
    }
    case 't-profile': {
      const tf = clamp(d.tf, d.h - 0.01);
      const tw = clamp(d.tw, d.b - 0.01);
      const x1 = (d.b - tw) / 2;
      const x2 = (d.b + tw) / 2;
      return { w: d.b, h: d.h, d: poly([[0, 0], [d.b, 0], [d.b, tf], [x2, tf], [x2, d.h], [x1, d.h], [x1, tf], [0, tf]]) };
    }
    case 'i-beam': {
      const tf = clamp(d.tf, d.h / 2 - 0.01);
      const tw = clamp(d.tw, d.w - 0.01);
      const x1 = (d.w - tw) / 2;
      const x2 = (d.w + tw) / 2;
      return {
        w: d.w, h: d.h,
        d: poly([[0, 0], [d.w, 0], [d.w, tf], [x2, tf], [x2, d.h - tf], [d.w, d.h - tf], [d.w, d.h], [0, d.h], [0, d.h - tf], [x1, d.h - tf], [x1, tf], [0, tf]]),
      };
    }
    case 'ring': {
      const inner = clamp(d.id, d.od - 0.01);
      return { w: d.od, h: d.od, d: circle(d.od / 2, d.od / 2, d.od / 2) + ' ' + circle(d.od / 2, d.od / 2, inner / 2) };
    }
  }
}

/** Polygon area via the shoelace formula - used by tests to prove the drawing matches the maths. */
export function polygonArea(path: string): number {
  const nums = path.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
  let s = 0;
  const n = nums.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    s += nums[2 * i] * nums[2 * j + 1] - nums[2 * j] * nums[2 * i + 1];
  }
  return Math.abs(s) / 2;
}
