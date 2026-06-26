# Landing page — design notes

Standalone preview of the Tada marketing landing. Open `index.html` directly in a browser, or serve it (`python3 -m http.server` in this folder). Built 2026-06-25 as an overnight artifact; **for review, not final**. Trivially ported into the real Next.js app tomorrow — the markup → JSX and the CSS custom properties → the architect's token system.

## Direction
- **Brief:** "Clawdia style, but Tada's own flare," + clear Todoist differentiation + a pricing section. Tagline locked by the user: *"Capture anything. Turn it into action."*
- **The brief pins the warm-serif look** (Clawdia's DNA). That look is also a known AI default (cream + serif + terracotta). The brief wins — so I followed the warm/serif direction but spent the differentiation on the axes the brief left free:
  - **Accent = indigo `#5B5BD6`** (native Tada's real identity — its selection border + default View color), *not* terracotta. This single change pulls the whole page off the default.
  - **Signature = the ✦ spark + the capture→task transformation.** The hero *is* the thesis (messy screenshot resolving into one clean AI-filled task with a "do it for me" offer + a gold tada-spark), not a headline-over-screenshot. The spark recurs as the brand mark (wordmark, list bullets, completed checkmark) — used with restraint.
  - **Gold spark `#D99A2B`** as a second accent for celebratory "tada" moments — indigo+gold is a richer, non-default pairing than cream+terracotta.

## Tokens
- Color: cream `#f0ece3` substrate, `#f8f5ee`/`#fffefb` surfaces, ink `#1d1b17`, ink-soft `#5d574d`; accent indigo `#5b5bd6` (+ deep `#4444ac`, bright `#7c7cf0`); spark gold `#d99a2b`; one graphite band `#1b1a18`.
- Type: **EB Garamond** (display serif) · **Geist** (body) · **Geist Mono** (eyebrows/meta/pricing) · **Caveat** (wordmark only). All via Google Fonts with system fallbacks.
- All values are CSS custom properties in `:root` — mirrors Clawdia's var-based system so they transfer cleanly into the real token pipeline.

## Sections
Nav → Hero (transformation) → Problem (scattered fragments) → How it works (01–04, a real sequence so numbering is justified) → **vs. a normal todo app** (two-column them/us — the Todoist differentiation the user asked for) → Dark "do it for me" band (invites · research · reminders + the confirm-gate note) → Features grid (Todoist-parity reassurance) → **Pricing** (Free/Personal/Pro/Team + monthly·annual toggle + AI-credits note; Pro = "most popular") → Trust (auto-delete captures, confirm every action, exportable) → Final CTA → Footer.

## Quality floor
- Responsive (verified at 1440 + 390). Single-column reflow on mobile; pricing tiers stack with Pro still highlighted.
- Keyboard focus visible (`:focus-visible` on buttons). `prefers-reduced-motion` respected (reveal + the hero spark pulse both gate off).
- Semantic landmarks, aria-labels on icon-only/decorative bits, `aria-pressed` on the pricing toggle.
- Inline SVG spark favicon.

## Known notes for the real port
- Scroll-reveal uses IntersectionObserver; off-screen elements are `opacity:0` until scrolled in. Real visitors are fine; a full-page *screenshot* needs reveals forced (`document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))`). Consider a no-JS reveal fallback when porting.
- Copy is adapted from the user's marketing draft; trimmed to a single tasteful page rather than the full multi-page site (positioning will firm up — don't over-build speculative pages yet).
- Pricing numbers are the user's suggested model (Free / Personal $8–10 / Pro $15–19 / Team $12–15 seat / +AI credits) — placeholders to confirm.

## Things I deliberately did NOT do
- No flow-connector motif (that's Clawdia's signature) — used the spark + transformation instead, so Tada doesn't read as a Clawdia clone.
- No second display font or decorative flourish beyond the spark — boldness spent in one place.
