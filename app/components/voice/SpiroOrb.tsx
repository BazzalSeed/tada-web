"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as React from "react";

/**
 * SpiroOrb — Clawdia's voice indicator (S35 Phase C), inspired by the Apple
 * Watch PAIRING animation: a cloud of dots that drifts when idle and ORGANIZES
 * into a spirograph (a hypotrochoid "guilloché" rosette) when she's active.
 * Pure 2D canvas, no WebGL. DOTS only (lines were explored and dropped).
 *
 * ── The four states ──────────────────────────────────────────────────────
 *   idle      gray 3D-ish point cloud, slow drift + breath. Alive at rest.
 *   listening the rosette, growing/brightening with the USER's mic volume.
 *   speaking  the rosette, pulsing with the ASSISTANT's TTS volume.
 *   thinking  the rosette in the data-viz multi-hue cast, its gear `r` DANCING
 *             to a new coprime every ~3s (a beautiful "flip") — the AI-working
 *             moment. (Siri-in-iOS energy, on-brand.)
 *
 * ── Two rules that define the feel (do not regress) ──────────────────────
 *  1. EVERY state has a DISTINCT shape (different point count), so EVERY
 *     transition visibly "flips" — listening R48 (48 pts) · speaking R30 (30) ·
 *     thinking R18 (18). Switching morphs dot positions between the two closed
 *     curves (an interruptible snapshot-blend), with flow/spin/colour easing and
 *     a mid-transition swell pulse to punctuate the flip. Never a hard cut.
 *  2. Flow is EVEN: dots are spaced uniformly by ARC LENGTH and advance by an
 *     equal arc step, so they stream along the curve without bunching. (A
 *     density wave — the obvious approach — produces a travelling crest that
 *     reads as cyclic dense/sparse; that was explicitly rejected.)
 *
 * The full recipe lives in agent memory (project_voice_ux_design_lane) so it can
 * be retuned later; the shapes / motion inside DESKTOP_CONFIG below ARE that recipe.
 * Mobile mirrors desktop wholesale now (Hansen 2026-06-20) — one recipe, both profiles.
 *
 * Conventions mirror DotWave: canvas + rAF, CSS tokens resolved to concrete RGB
 * at mount (re-resolved on a theme change), an OS/forced reduced-motion gate, and
 * a synchronous first-frame paint so a hidden tab (Claude Preview pauses rAF)
 * degrades to a still frame instead of going blank. The cloud is SEEDED
 * (deterministic) so a theme toggle never reshuffles it.
 *
 * ── Production wiring (S35 Phase C) ──────────────────────────────────────
 * This is a pure VISUAL primitive over the four `VoiceState`s. The live voice
 * session (`useVoiceSession`) speaks a richer `VoiceStatus`; map it at the
 * boundary (connecting/ended/error → idle) — `@clawdia/ui` deliberately does NOT
 * depend on the voice transport types. Pass `getLevel`, a STABLE getter the orb
 * calls once per frame inside its OWN rAF (mic level while listening, TTS level
 * while speaking) — never feed amplitude through React props (that would
 * re-render 60×/s). Omit `getLevel` and a mock generator drives the reactivity
 * for the design-demo. Mount one instance per voice session.
 */

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";
export type SpiroProfile = "desktop" | "mobile";

/** One hypotrochoid gear per state (integer R,r guarantee a closed, crisp
 *  rosette: points = R / gcd(R, r); r coprime to R → exactly R points). The
 *  distinct point counts are what make each transition flip. */
type Gear = { R: number; r: number; l: number };
/** flow = arc-flow speed; spin = rosette rotation; react = volume→scale gain;
 *  gather = 0 cloud / 1 rosette. */
type Motion = { flow: number; spin: number; react: number; gather: number };
type OrbShapes = Record<"listening" | "speaking" | "thinking", Gear>;
type OrbMotion = Record<VoiceState, Motion>;

interface ProfileConfig {
  size: number;
  count: number;
  dot: number;
  /** Scales flow + spin so the same motion doesn't feel faster on a smaller orb. */
  speed: number;
  shapes: OrbShapes;
  motion: OrbMotion;
  /** thinking re-flips its gear `r` this often (s). */
  thinkSwitch: number;
}

/** idle is never tuned per profile — a still gray cloud (gather 0, no motion). */
const IDLE_MOTION: Motion = { flow: 0, spin: 0, react: 0, gather: 0 };

/** The locked recipe (ONE source, both profiles). Tuned via the show_widget playground
 *  (see agent memory `project_voice_ux_design_lane`); the SHAPES / MOTION numbers below
 *  ARE that recipe and are the retune surface. */
const DESKTOP_CONFIG: ProfileConfig = {
  size: 420,
  count: 1280,
  dot: 1.0,
  speed: 0.5,
  shapes: {
    listening: { R: 48, r: 13, l: 0.7 }, // 48 points — fine, wide ring
    speaking: { R: 30, r: 13, l: 0.45 }, // 30 points — the default rosette
    thinking: { R: 18, r: 7, l: 0.3 }, // 18 points — r dances among coprimes(18)
  },
  motion: {
    idle: IDLE_MOTION,
    listening: { flow: 0.05, spin: 0.1, react: 0.06, gather: 1 },
    speaking: { flow: 0.4, spin: 0.1, react: 0.06, gather: 1 },
    thinking: { flow: 0.5, spin: 0.5, react: 0, gather: 1 },
  },
  thinkSwitch: 3,
};

/** Per-size presets. **Mobile now mirrors desktop WHOLESALE** (Hansen 2026-06-20): the
 *  independently-tuned narrow-orb recipe was retired — one RECIPE (shapes / motion /
 *  density) reads best everywhere. `mobile` is kept as a key (so the `SpiroProfile` API +
 *  the design-demo toggle still resolve) but resolves to the same `DESKTOP_CONFIG`, so the
 *  two can never drift. `size` here is the desktop hero DEFAULT / CAP (420px); the orb is always
 *  RASTERIZED at this size, and `VoiceStage` CSS-scales it DOWN to fill its measured hero band so
 *  the big hero never overflows a phone's width or a short stage's height. */
const PROFILES: Record<SpiroProfile, ProfileConfig> = {
  desktop: DESKTOP_CONFIG,
  mobile: DESKTOP_CONFIG,
};
const FLOW_SCALE = 0.2; // maps the 0..1 flow dial to a sane arc-fraction/sec
const LUT_SAMPLES = 1500; // parameter samples → dense enough for smooth tips
const LUT_RES = 2048; // arc-length lookup resolution (≥ max dot count)

/** Tada is strictly ONE accent (rust) — no multi-hue data-viz wall. The "thinking"
 *  shimmer dances across the RUST family (accent → bright → deep → text) so it
 *  reads as alive without ever introducing a second hue (no green/blue). */
const DATAVIZ_VARS = ["--color-accent", "--color-accent-bright", "--color-accent-deep", "--color-accent-text"];

type RGB = [number, number, number];
interface Palette {
  accent: RGB;
  bright: RGB;
  muted: RGB;
  dataviz: RGB[];
}
interface Particle {
  /** seeded unit-sphere home (fake-3D idle cloud) */
  sx: number;
  sy: number;
  sz: number;
  /** base arc fraction along the rosette (0..1); flow adds a shared phase */
  u: number;
}
interface Lut {
  px: Float64Array;
  py: Float64Array;
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
function lerpRGB(a: RGB, b: RGB, k: number): RGB {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}
function smoothstep(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}
function gcd(a: number, b: number): number {
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}
function coprimes(R: number): number[] {
  const out: number[] = [];
  for (let x = 2; x <= R - 1; x += 1) {
    if (gcd(R, x) === 1) {
      out.push(x);
    }
  }
  return out;
}
function nextCoprime(R: number, cur: number): number {
  const a = coprimes(R);
  if (!a.length) {
    return cur;
  }
  const i = a.indexOf(cur);
  return a[(i + 1) % a.length]!;
}

/** Resolve a CSS value (e.g. `var(--token)`) to [r,g,b] — canvas needs concrete
 *  channels to lerp. Fallback is numeric RGB, never a hex literal (the
 *  adherence eslint bans raw hex). */
function resolveRGB(host: HTMLElement, cssValue: string): RGB {
  const probe = document.createElement("span");
  probe.style.color = cssValue;
  host.appendChild(probe);
  const c = getComputedStyle(probe).color;
  host.removeChild(probe);
  const m = c.match(/[\d.]+/g);
  if (!m || m.length < 3) {
    return [148, 141, 128];
  }
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}
function sampleDataviz(palette: RGB[], frac: number): RGB {
  const n = palette.length;
  if (n === 0) {
    return [148, 141, 128];
  }
  const x = (((frac % 1) + 1) % 1) * n;
  const i = Math.floor(x);
  return lerpRGB(palette[i % n]!, palette[(i + 1) % n]!, x - i);
}

/** A point on the normalised hypotrochoid (extent ≈ unit disc) at parameter t. */
function hypoPoint(R: number, r: number, l: number, t: number): [number, number] {
  const k = r / R;
  const A = 1 - k;
  const B = l * k;
  const f = (R - r) / r;
  const nm = 1 / (A + Math.abs(B));
  return [(A * Math.cos(t) + B * Math.cos(f * t)) * nm, (A * Math.sin(t) - B * Math.sin(f * t)) * nm];
}

/** Build an ARC-LENGTH-uniform lookup of the closed curve: LUT_RES points spaced
 *  equally by distance along the path. Indexing this by an even fraction gives
 *  evenly-spaced dots (uniform density) and even flow when the fraction
 *  advances. Cached by shape key. */
const lutCache = new Map<string, Lut>();
function getLut(R: number, r: number, l: number): Lut {
  const key = `${R}|${r}|${l.toFixed(3)}`;
  const hit = lutCache.get(key);
  if (hit) {
    return hit;
  }
  const revs = r / gcd(R, r);
  const xs = new Float64Array(LUT_SAMPLES + 1);
  const ys = new Float64Array(LUT_SAMPLES + 1);
  const s = new Float64Array(LUT_SAMPLES + 1);
  let px = 0;
  let py = 0;
  for (let i = 0; i <= LUT_SAMPLES; i += 1) {
    const [x, y] = hypoPoint(R, r, l, (i / LUT_SAMPLES) * Math.PI * 2 * revs);
    xs[i] = x;
    ys[i] = y;
    if (i > 0) {
      s[i] = s[i - 1]! + Math.hypot(x - px, y - py);
    }
    px = x;
    py = y;
  }
  const L = s[LUT_SAMPLES]!;
  const outX = new Float64Array(LUT_RES);
  const outY = new Float64Array(LUT_RES);
  let j = 0;
  for (let a = 0; a < LUT_RES; a += 1) {
    const target = (a / LUT_RES) * L;
    while (j < LUT_SAMPLES && s[j + 1]! < target) {
      j += 1;
    }
    const s0 = s[j]!;
    const s1 = s[j + 1] ?? L;
    const fr = s1 > s0 ? (target - s0) / (s1 - s0) : 0;
    const x0 = xs[j]!;
    const y0 = ys[j]!;
    const x1 = xs[j + 1] ?? x0;
    const y1 = ys[j + 1] ?? y0;
    outX[a] = x0 + (x1 - x0) * fr;
    outY[a] = y0 + (y1 - y0) * fr;
  }
  const lut: Lut = { px: outX, py: outY };
  lutCache.set(key, lut);
  return lut;
}

/** Freeze the current blend of two shapes into a new LUT — lets a state change
 *  mid-transition start from where the dots actually are (interruptible morph). */
function snapshotLut(from: Lut, to: Lut, mix: number): Lut {
  if (mix >= 1) {
    return to;
  }
  const e = smoothstep(mix);
  const px = new Float64Array(LUT_RES);
  const py = new Float64Array(LUT_RES);
  for (let a = 0; a < LUT_RES; a += 1) {
    px[a] = from.px[a]! + (to.px[a]! - from.px[a]!) * e;
    py[a] = from.py[a]! + (to.py[a]! - from.py[a]!) * e;
  }
  return { px, py };
}

/** Sample the (optionally blended) curve at arc fraction `frac` → [x, y]. */
function sampleLut(from: Lut, to: Lut, mix: number, frac: number): [number, number] {
  const ff = frac * LUT_RES;
  let i0 = ff | 0;
  const fr = ff - i0;
  i0 %= LUT_RES;
  if (i0 < 0) {
    i0 += LUT_RES;
  }
  const i1 = (i0 + 1) % LUT_RES;
  const ax = to.px[i0]! + (to.px[i1]! - to.px[i0]!) * fr;
  const ay = to.py[i0]! + (to.py[i1]! - to.py[i0]!) * fr;
  if (mix >= 1) {
    return [ax, ay];
  }
  const bx = from.px[i0]! + (from.px[i1]! - from.px[i0]!) * fr;
  const by = from.py[i0]! + (from.py[i1]! - from.py[i0]!) * fr;
  const e = smoothstep(mix);
  return [bx + (ax - bx) * e, by + (ay - by) * e];
}

/** Mock volume 0..1 when no live level is supplied (design-demo only). */
function mockVolume(state: VoiceState, t: number): number {
  if (state === "listening") {
    return clamp01(0.4 + 0.35 * Math.abs(Math.sin(t * 5.5)) + 0.15 * Math.abs(Math.sin(t * 9)));
  }
  if (state === "speaking") {
    return clamp01(0.4 + 0.35 * Math.sin(t * 3) + 0.12 * Math.sin(t * 4.9));
  }
  return 0;
}

function shapeFor(state: VoiceState, thkR: number, shapes: OrbShapes): Gear | null {
  if (state === "listening") {
    return shapes.listening;
  }
  if (state === "speaking") {
    return shapes.speaking;
  }
  if (state === "thinking") {
    return { R: shapes.thinking.R, r: thkR, l: shapes.thinking.l };
  }
  return null; // idle keeps the last shape; the gather-out is the transition
}

export interface SpiroOrbProps {
  state: VoiceState;
  /** Per-size preset (count / dot / motion-speed + default size). */
  profile?: SpiroProfile;
  /**
   * Live amplitude getter, called ONCE PER FRAME inside the orb's own rAF (mic
   * level while listening, TTS level while speaking). Returns 0..1; clamped.
   * This is a stable getter on purpose — passing amplitude as a prop would
   * re-render 60×/s. Omit → a mock generator drives reactivity (design-demo).
   */
  getLevel?: () => number;
  /** Override the preset render size (px). */
  size?: number;
  /** Override the preset dot count / radius / motion-speed multiplier. */
  count?: number;
  dotRadius?: number;
  speed?: number;
  /** Force reduced-motion (static). OS prefers-reduced-motion is ALSO honoured. */
  reducedMotion?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function SpiroOrb({
  state,
  profile = "desktop",
  getLevel,
  size,
  count,
  dotRadius,
  speed,
  reducedMotion = false,
  className,
  style,
}: SpiroOrbProps) {
  const preset = PROFILES[profile];
  const renderSize = size ?? preset.size;
  const dotCount = count ?? preset.count;
  // Dots are SIZE-FAITHFUL: the recipe is tuned at `preset.size` (dot radius `preset.dot`
  // there), and rendering bigger/smaller is that SAME orb uniformly scaled — so a 560px hero
  // gets proportionally bigger dots, not fixed-px dots (which would read as too fine/sparse on a
  // large orb and too chunky on a small one). No-op at the reference size (factor 1). This lets
  // VoiceStage rasterize the hero larger (crisp) without the density drifting.
  const dotRad = (dotRadius ?? preset.dot) * (renderSize / preset.size);
  const motionSpeed = speed ?? preset.speed;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<VoiceState>(state);
  stateRef.current = state;
  const getLevelRef = useRef<(() => number) | undefined>(getLevel);
  getLevelRef.current = getLevel;
  const staticRepaintRef = useRef<(() => void) | null>(null);

  // Seeded unit-sphere cloud + even arc fractions — rebuilt only when count changes.
  const particles = useMemo<Particle[]>(() => {
    let s = 0x5eedc1a >>> 0;
    const rnd = (): number => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out: Particle[] = [];
    for (let i = 0; i < dotCount; i += 1) {
      const th = Math.acos(2 * rnd() - 1);
      const ph = 2 * Math.PI * rnd();
      const rr = Math.cbrt(rnd()) * 0.95;
      out.push({
        sx: rr * Math.sin(th) * Math.cos(ph),
        sy: rr * Math.sin(th) * Math.sin(ph),
        sz: rr * Math.cos(th),
        u: i / dotCount,
      });
    }
    return out;
  }, [dotCount]);

  // Re-resolve canvas palette on a theme change (data-theme flip or OS scheme).
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => {
    const bump = (): void => setThemeVersion((v) => v + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", bump);
    return () => {
      mo.disconnect();
      mq?.removeEventListener?.("change", bump);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    const host = canvas.parentElement ?? canvas;
    if (!ctx) {
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const palette: Palette = {
      accent: resolveRGB(host, "var(--color-accent)"),
      bright: resolveRGB(host, "var(--color-accent-bright)"),
      muted: resolveRGB(host, "var(--color-ink-muted)"),
      dataviz: DATAVIZ_VARS.map((v) => resolveRGB(host, `var(${v})`)),
    };

    // The active profile's recipe — shapes/motion/think-gap diverge by profile, so
    // capture them here (the effect re-runs when `preset` changes, i.e. on a profile flip).
    const { shapes, motion, thinkSwitch } = preset;

    const w = renderSize;
    const h = renderSize;
    const measure = (): void => {
      // The canvas is a FIXED square (its inline CSS is renderSize × renderSize), so size the
      // backing store straight from renderSize. Do NOT read getBoundingClientRect: it returns
      // ancestor-TRANSFORM-scaled dimensions, and the mobile Spotlight sheet animates in with a
      // transform — measuring mid-animation locked a non-square (wide-and-short) buffer that the
      // square CSS box then stretched into a vertical oval (the real-mobile-Safari squish bug).
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    // ── eased, persistent render state (smooth cross-fades) ──
    const initShape = shapeFor(state, shapes.thinking.r, shapes) ?? shapes.speaking;
    let toLut = getLut(initShape.R, initShape.r, initShape.l);
    let fromLut = toLut;
    let shapeMix = 1;
    let shapeDur = 0.5;
    let flowC = motion[state].flow;
    let spinC = motion[state].spin;
    let reactC = motion[state].react;
    let color = state === "idle" ? palette.muted : state === "speaking" ? palette.bright : palette.accent;
    let appliedState: VoiceState = state;
    let thkR = shapes.thinking.r;
    let thkLast = 0;
    let cloudRot = 0;
    let phase = 0; // shared arc-flow phase (→ even flow)
    let spinAng = 0;
    let gather = motion[state].gather;

    const triggerShape = (R: number, r: number, l: number, dur: number): void => {
      fromLut = snapshotLut(fromLut, toLut, shapeMix);
      toLut = getLut(R, r, l);
      shapeMix = 0;
      shapeDur = dur;
    };
    const applyState = (s: VoiceState, t: number): void => {
      if (s === "thinking") {
        thkR = shapes.thinking.r;
        thkLast = t;
      }
      const sh = shapeFor(s, thkR, shapes);
      if (sh) {
        triggerShape(sh.R, sh.r, sh.l, 0.5);
      }
    };

    const readLevel = (live: VoiceState, t: number): number => {
      const gl = getLevelRef.current;
      return gl ? clamp01(gl()) : mockVolume(live, t);
    };

    const draw = (t: number): void => {
      const cx = w / 2;
      const cy = h / 2;
      const R0 = (Math.min(w, h) / 2) * 0.92;
      const live = stateRef.current;
      const reactive = live === "listening" || live === "speaking";

      gather += (motion[live].gather - gather) * 0.05;
      cloudRot += 0.0015;

      const vol = reactive ? readLevel(live, t) : 0;
      const flip = Math.sin(Math.min(1, shapeMix) * Math.PI); // swell pulse at flip peak
      const scl = (1 + reactC * vol) * (1 + 0.05 * flip);
      const ml = (R0 / 2) * scl; // curve extent → screen
      const cloudBreath = 0.96 + 0.04 * Math.sin(t * 1.5);

      let gb = 1;
      if (reactive) {
        gb = 0.72 + 0.5 * vol;
      } else if (live === "thinking") {
        gb = 0.9 + 0.1 * Math.sin(t * 1.4);
      }
      gb *= 1 + 0.1 * flip;

      const [cr, cg, cb] = color.map((c) => Math.round(c)) as RGB;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      const ica = Math.cos(cloudRot);
      const isa = Math.sin(cloudRot);
      const cang = Math.cos(spinAng);
      const sang = Math.sin(spinAng);
      const cloudR = (R0 / 2) * cloudBreath;

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i]!;
        // fake-3D cloud: rotate the sphere around Y, depth → size/alpha
        const rx = p.sx * ica + p.sz * isa;
        const rz = -p.sx * isa + p.sz * ica;
        const clx = cx + rx * cloudR;
        const cly = cy + p.sy * cloudR;
        const depth = (rz + 1) / 2;
        // rosette seat at the (flowed) arc fraction, rotated by spin
        let frac = p.u + phase;
        frac -= Math.floor(frac);
        const [bx, by] = sampleLut(fromLut, toLut, shapeMix, frac);
        const rsx = cx + (bx * cang - by * sang) * ml;
        const rsy = cy + (bx * sang + by * cang) * ml;
        const m = gather;
        const x = clx + (rsx - clx) * m;
        const y = cly + (rsy - cly) * m;
        let rad: number;
        let al: number;
        if (m < 0.997) {
          const cRad = dotRad * (0.55 + 0.7 * depth);
          const cAl = 0.22 + 0.6 * depth;
          rad = cRad + (dotRad - cRad) * m;
          al = cAl + (1 - cAl) * m;
        } else {
          rad = dotRad;
          al = 1;
        }
        ctx.globalAlpha = Math.min(1, al * gb);
        ctx.beginPath();
        ctx.arc(x, y, rad < 0.3 ? 0.3 : rad, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    // advance the eased scalars + thinking dance for one frame of length `dt`
    const step = (t: number, dt: number): void => {
      const live = stateRef.current;
      if (live !== appliedState) {
        applyState(live, t);
        appliedState = live;
      }
      const m = motion[live];
      flowC += (m.flow - flowC) * 0.06;
      spinC += (m.spin - spinC) * 0.06;
      reactC += (m.react - reactC) * 0.06;
      let target: RGB;
      if (live === "idle") {
        target = palette.muted;
      } else if (live === "listening") {
        target = palette.accent;
      } else if (live === "speaking") {
        target = palette.bright;
      } else {
        target = sampleDataviz(palette.dataviz, t * 0.07);
      }
      color = lerpRGB(color, target, live === "thinking" ? 0.2 : 0.08);
      if (live === "thinking" && shapeMix >= 1 && t - thkLast > thinkSwitch) {
        thkR = nextCoprime(shapes.thinking.R, thkR);
        triggerShape(shapes.thinking.R, thkR, shapes.thinking.l, 0.45);
        thkLast = t;
      }
      shapeMix = Math.min(1, shapeMix + dt / shapeDur);
      phase += dt * flowC * FLOW_SCALE * motionSpeed;
      spinAng += dt * spinC * motionSpeed;
    };

    // ── reduced-motion (OS or forced): one static, calm frame ──
    const osReduce =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion || osReduce) {
      const repaint = (): void => {
        measure();
        const s = stateRef.current;
        const sh = shapeFor(s, shapes.thinking.r, shapes);
        if (sh) {
          toLut = getLut(sh.R, sh.r, sh.l);
          fromLut = toLut;
        }
        shapeMix = 1;
        gather = motion[s].gather;
        flowC = 0;
        spinC = 0;
        reactC = 0;
        color = s === "idle" ? palette.muted : s === "speaking" ? palette.bright : palette.accent;
        draw(0);
      };
      staticRepaintRef.current = repaint;
      repaint();
      return () => {
        staticRepaintRef.current = null;
      };
    }
    staticRepaintRef.current = null;

    // ── animated loop (sync first frame so a hidden tab shows a still) ──
    measure();
    draw(0);
    let raf = 0;
    let startedAt = 0;
    let lastT = 0;
    const frame = (now: number): void => {
      if (!startedAt) {
        startedAt = now;
      }
      const t = (now - startedAt) / 1000;
      const dt = Math.min(0.05, t - lastT);
      lastT = t;
      step(t, dt);
      draw(t);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }
    };
    // `preset` is a stable module-constant reference per profile, so it only
    // changes identity on a profile flip (which must rebuild the shapes/motion LUTs).
  }, [reducedMotion, renderSize, dotRad, motionSpeed, themeVersion, particles, preset]);

  // Reduced-motion only: repaint the static frame when the state changes.
  useEffect(() => {
    staticRepaintRef.current?.();
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Tada voice — ${state}`}
      className={className}
      style={{ display: "block", width: renderSize, height: renderSize, ...style }}
    />
  );
}
