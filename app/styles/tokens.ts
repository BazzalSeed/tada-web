/* =========================================================================
 * GENERATED FILE — DO NOT EDIT BY HAND.
 * Emitted from src/clawdia/design/tokens.py via tokens_build.py.
 * Edit the Python source, then run `python -m clawdia.design.tokens_build`.
 *
 * `color` / `colorDark` / `font` are literal values — use them where CSS
 * custom properties can't reach (chart libraries, <canvas>, OG-image
 * generation, inline SVG fills). For ordinary styling prefer `cssVar.*`
 * (or the CSS classes), so the runtime stays single-sourced in CSS.
 * ========================================================================= */

// Literal brand colors — light substrate.
export const color = {
  surface: '#f0ece3',
  surfaceSubtle: '#eae5da',
  surfacePanel: '#f8f5ee',
  surfaceRaised: '#fffefb',
  chrome: '#e7e1d6',
  ink: '#1d1b17',
  inkSoft: '#5d574d',
  inkMuted: '#948d80',
  accentSignature: '#c8632e',
  accentDeep: '#9b481e',
  accentBright: '#c8632e',
  onAccent: '#f7f3ec',
  stateSuccess: '#5f7a4a',
  stateWarning: '#c89a3e',
  stateError: '#a14a3e',
  dangerSolid: '#bf3a2b',
  caution: '#d98a55',
  accentText: '#9b481e',
  cautionText: '#8f5222',
  accentTint: 'rgba(200, 99, 46, 0.10)',
  accentDust: 'rgba(200, 99, 46, 0.14)',
  accentScribble: 'rgba(200, 99, 46, 0.22)',
} as const;

// Literal brand colors — dark (warm-graphite) substrate. accent/on-accent invariant.
export const colorDark = {
  surface: '#1b1a18',
  surfaceSubtle: '#2d2c29',
  surfacePanel: '#23221f',
  surfaceRaised: '#282724',
  chrome: '#121210',
  ink: '#f2ede3',
  inkSoft: '#b9b2a4',
  inkMuted: '#807a6e',
  accentBright: '#d97a45',
  stateSuccess: '#93b277',
  stateWarning: '#d3a854',
  stateError: '#cf8779',
  dangerSolid: '#d94b3b',
  caution: '#e0a070',
  accentText: '#d97a45',
  cautionText: '#e0a070',
  accentTint: 'rgba(200, 99, 46, 0.22)',
  accentDust: 'rgba(200, 99, 46, 0.30)',
  accentScribble: 'rgba(216, 113, 56, 0.50)',
} as const;

// Platform identity dot colors (category labels, NOT state — mode-invariant).
export const platform = {
  tiktok: '#5f7a4a',
  youtube: '#c89a3e',
  shopify: '#8a6d52',
  instagram: '#a14a3e',
  impact: '#c8632e',
} as const;

// Data-viz categorical series colors (charts — the sanctioned multi-hue set). Index-keyed.
export const dataviz = ['#c8632e', '#6a9bcc', '#788c5d', '#d4a27f', '#a3718a', '#6f908c', '#7a7295', '#8a6d52'] as const;

// Font-family stacks.
export const font = {
  display: '\'EB Garamond\', Georgia, \'Times New Roman\', serif',
  body: '\'Geist\', -apple-system, BlinkMacSystemFont, system-ui, \'Segoe UI\', sans-serif',
  wordmark: '\'Caveat\', \'Brush Script MT\', cursive',
  mono: '\'JetBrains Mono\', ui-monospace, \'SF Mono\', Menlo, monospace',
} as const;

// Typed CSS custom-property handles for styling (runtime values live in CSS).
export const cssVar = {
  surface: 'var(--color-surface)',
  surfaceSubtle: 'var(--color-surface-subtle)',
  surfacePanel: 'var(--color-surface-panel)',
  surfaceRaised: 'var(--color-surface-raised)',
  chrome: 'var(--color-chrome)',
  ink: 'var(--color-ink)',
  inkSoft: 'var(--color-ink-soft)',
  inkMuted: 'var(--color-ink-muted)',
  accentSignature: 'var(--color-accent)',
  accentDeep: 'var(--color-accent-deep)',
  accentBright: 'var(--color-accent-bright)',
  onAccent: 'var(--color-on-accent)',
  stateSuccess: 'var(--color-success)',
  stateWarning: 'var(--color-warning)',
  stateError: 'var(--color-error)',
  dangerSolid: 'var(--color-danger-solid)',
  caution: 'var(--color-caution)',
  accentText: 'var(--color-accent-text)',
  cautionText: 'var(--color-caution-text)',
  accentTint: 'var(--accent-tint)',
  accentDust: 'var(--accent-dust)',
  accentScribble: 'var(--accent-scribble)',
  platformTiktok: 'var(--platform-tiktok)',
  platformYoutube: 'var(--platform-youtube)',
  platformShopify: 'var(--platform-shopify)',
  platformInstagram: 'var(--platform-instagram)',
  platformImpact: 'var(--platform-impact)',
  dataviz1: 'var(--dataviz-1)',
  dataviz2: 'var(--dataviz-2)',
  dataviz3: 'var(--dataviz-3)',
  dataviz4: 'var(--dataviz-4)',
  dataviz5: 'var(--dataviz-5)',
  dataviz6: 'var(--dataviz-6)',
  dataviz7: 'var(--dataviz-7)',
  dataviz8: 'var(--dataviz-8)',
  display: 'var(--font-display)',
  body: 'var(--font-body)',
  wordmark: 'var(--font-wordmark)',
  mono: 'var(--font-mono)',
} as const;

export type ColorToken = keyof typeof color;
export type FontToken = keyof typeof font;
export type PlatformToken = keyof typeof platform;
