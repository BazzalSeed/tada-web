"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import { Spark } from "@/app/components/brand/Spark";
import styles from "./Landing.module.css";

// T4.1 — the marketing landing, ported from design/landing-preview (rust palette,
// already on-brand). Static-first: content is visible without JS; a mount effect
// layers the entrance reveal, the frosted-on-scroll nav, the beats spine, and the
// hero switchboard animation (sources wire into Tada; the active flow plays).

// Hero switchboard icons — capture sources (left column + flow header) and the
// action Tada finishes with (the Done step). Inherit color via currentColor.
const IconEmail = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 7l9 6 9-6" />
  </svg>
);
const IconShot = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="14" rx="2" />
    <path d="M3 16l5-4 4 3 4-4 5 4" />
  </svg>
);
const IconQuick = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 7h16M4 12h10M4 17h7" />
  </svg>
);
const IconCal = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4M9 15l2 2 4-4" />
  </svg>
);
const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
    <path d="M10 21h4" />
  </svg>
);
const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </svg>
);

// The three capture sources (left column). Order drives the auto-play cycle.
const SOURCES: { id: string; icon: ReactNode; t: string; m: string }[] = [
  { id: "email", icon: <IconEmail />, t: "Email", m: "Forwarded · your inbox" },
  { id: "shot", icon: <IconShot />, t: "Screenshots", m: "Pasted · images" },
  { id: "quick", icon: <IconQuick />, t: "Quick add", m: "Typed or spoken" },
];

// One end-to-end story per source: the raw input (shape of the source) → the
// structured task Tada wrote → the action Tada finished for you.
type Flow = {
  kind: string;
  kIcon: ReactNode;
  text: ReactNode;
  task: string;
  chips: [string, string][];
  dIcon: ReactNode;
  done: string;
};
const FLOWS: Record<string, Flow> = {
  email: {
    kind: "Forwarded email",
    kIcon: <IconEmail />,
    text: (
      <>
        “…can we <b>sync Tuesday afternoon</b>? I&apos;ll send over the brief.” — Dakota
      </>
    ),
    task: "Meet Dakota — project sync",
    chips: [
      ["date", "Tue 2:00 PM"],
      ["lab", "#work"],
    ],
    dIcon: <IconCal />,
    done: "Booked it — invite sent to Dakota",
  },
  shot: {
    kind: "Screenshot, read by Tada",
    kIcon: <IconShot />,
    text: (
      <>
        “can you <b>find the best CRMs</b> for a small team and summarize the trade-offs?”
      </>
    ),
    task: "Research CRMs for the team",
    chips: [["lab", "#research"]],
    dIcon: <IconSearch />,
    done: "Deep research done — findings written in",
  },
  quick: {
    kind: "Typed or spoken",
    kIcon: <IconQuick />,
    text: (
      <>
        “remind me to <b>call mom tonight</b> at 6”
      </>
    ),
    task: "Call mom",
    chips: [
      ["date", "Today 6:00 PM"],
      ["lab", "#family"],
    ],
    dIcon: <IconBell />,
    done: "Reminder set · 6:00 PM",
  },
};

export function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Hero switchboard: which source is "on" (cycled), the per-source wire paths
  // (measured from layout), and refs the wire geometry + traveling dot read.
  const [active, setActive] = useState(0);
  const [wirePaths, setWirePaths] = useState<string[]>([]);
  const [wiresViewBox, setWiresViewBox] = useState("0 0 0 0");
  const gridRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const dotRef = useRef<SVGCircleElement | null>(null);
  const activeRef = useRef(0);
  activeRef.current = active;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Enable the entrance reveal only when JS is present (content is visible by
    // default for no-JS / SSR), then observe each .reveal into view.
    if (!reduce && "IntersectionObserver" in window) {
      root.setAttribute("data-animate", "true");
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.setAttribute("data-in", "true");
              io.unobserve(e.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
      );
      root.querySelectorAll(`.${styles.reveal}`).forEach((el) => io.observe(el));
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        setScrolled(window.scrollY > 8);
        // beats spine fill + node lighting
        const beats = beatsRef.current;
        if (beats) {
          const r = beats.getBoundingClientRect();
          const ref = window.innerHeight * 0.6;
          const p = Math.max(0, Math.min(1, (ref - r.top) / Math.max(r.height, 1)));
          beats
            .querySelector<HTMLElement>(`.${styles.spineFill}`)
            ?.style.setProperty("--p", p.toFixed(3));
          beats.querySelectorAll<HTMLElement>(`.${styles.beat}`).forEach((b) => {
            const dot = b.querySelector(`.${styles.nodeDot}`)?.getBoundingClientRect();
            if (dot) b.setAttribute("data-on", String(dot.top < ref + 10));
          });
        }
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Switchboard wire geometry: a curved Bézier from each source's right edge
  // converging into the "Tada" mark. Recomputed on layout/resize/font-ready so
  // the wires stay registered with the cards as the page reflows.
  useEffect(() => {
    const grid = gridRef.current;
    const card = cardRef.current;
    if (!grid || !card) return;
    const draw = () => {
      const gb = grid.getBoundingClientRect();
      if (!gb.width) return; // pre-layout (e.g. jsdom) — nothing to draw yet
      setWiresViewBox(`0 0 ${gb.width} ${gb.height}`);
      const cb = card.getBoundingClientRect();
      const endX = cb.left - gb.left;
      const endY = cb.top - gb.top + 30; // converge into the Tada mark
      setWirePaths(
        sourceRefs.current.map((el) => {
          if (!el) return "";
          const b = el.getBoundingClientRect();
          const x1 = b.right - gb.left;
          const y1 = b.top - gb.top + b.height / 2;
          const dx = endX - x1;
          const c1 = x1 + dx * 0.5;
          const c2 = endX - dx * 0.5;
          return `M${x1},${y1} C${c1},${y1} ${c2},${endY} ${endX},${endY}`;
        }),
      );
    };
    draw();
    window.addEventListener("resize", draw);
    window.addEventListener("load", draw);
    let ro: ResizeObserver | undefined;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(draw);
      ro.observe(grid);
    }
    const fonts = (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    if (fonts?.ready) fonts.ready.then(draw).catch(() => {});
    return () => {
      window.removeEventListener("resize", draw);
      window.removeEventListener("load", draw);
      ro?.disconnect();
    };
  }, []);

  // Auto-play the sources and ride a dot along the active wire. Both are skipped
  // under prefers-reduced-motion (CSS then shows the flow statically).
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const interval = setInterval(() => {
      setActive((a) => (a + 1) % SOURCES.length);
    }, 4600);

    let raf = 0;
    let phase = 0;
    const tick = () => {
      phase += 0.0065;
      if (phase > 1) phase -= 1;
      const dot = dotRef.current;
      const path = pathRefs.current[activeRef.current];
      if (dot && path && typeof path.getTotalLength === "function") {
        const len = path.getTotalLength();
        if (len) {
          const pt = path.getPointAtLength(len * phase);
          dot.setAttribute("cx", String(pt.x));
          dot.setAttribute("cy", String(pt.y));
          dot.setAttribute("opacity", phase < 0.04 || phase > 0.96 ? "0" : "1");
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, []);

  const flow = FLOWS[SOURCES[active].id];

  return (
    <div className={styles.landing} ref={rootRef} id="top">
      <header className={styles.nav} data-scrolled={scrolled}>
        <div className={`${styles.wrap} ${styles.navIn}`}>
          <a className={styles.word} href="#top" aria-label="Tada home">
            Tada
            <Spark size={13} className={styles.spark} />
          </a>
          <div className={styles.navCta}>
            {/* Top-right = Log in for existing (invited) users → Google OAuth,
                landing back on /app. The close section repeats it as Get started. */}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}
              onClick={() => signIn("google", { redirectTo: "/app" })}
            >
              Log in
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={`${styles.heroCopy} ${styles.reveal}`}>
              <span className={styles.eyebrow}>
                <Spark size={11} className={styles.spark} />
                The to-do app that does it for you
              </span>
              <h1>
                Not to-do. <em>Ta-da.</em>
              </h1>
              <p className={styles.lede}>
                Forward an email, snap a screenshot, or jot a quick line. Tada turns it into real
                tasks — then does them for you, on your command.
              </p>
            </div>

            <div className={styles.reveal}>
              <div
                className={styles.swb}
                aria-label="Email, screenshots and quick add flow into Tada. It turns each into a task and finishes it for you — booking a meeting, doing deep research, or setting a reminder."
              >
                <div className={styles.swbGrid} ref={gridRef}>
                  <svg className={styles.swbWires} viewBox={wiresViewBox} aria-hidden="true">
                    {SOURCES.map((s, i) => (
                      <path
                        key={s.id}
                        ref={(el) => {
                          pathRefs.current[i] = el;
                        }}
                        className={`${styles.swbWire} ${i === active ? styles.swbWireOn : ""}`}
                        d={wirePaths[i] ?? ""}
                      />
                    ))}
                    <circle ref={dotRef} className={styles.swbDot} r="3.4" opacity="0" />
                  </svg>

                  <div className={styles.swbSources}>
                    {SOURCES.map((s, i) => (
                      <div
                        key={s.id}
                        ref={(el) => {
                          sourceRefs.current[i] = el;
                        }}
                        className={styles.swbSrc}
                        data-on={i === active}
                      >
                        <span className={styles.swbSrcT}>
                          {s.icon}
                          {s.t}
                        </span>
                        <span className={styles.swbSrcM}>{s.m}</span>
                      </div>
                    ))}
                  </div>

                  <div className={styles.swbHub}>
                    <div className={styles.swbCard} ref={cardRef}>
                      <div className={styles.swbCardTop}>
                        <span className={styles.swbCardMark}>
                          Tada
                          <Spark size={13} className={styles.spark} />
                        </span>
                        <span className={styles.swbCardDot} aria-hidden="true" />
                      </div>
                      <span className={styles.swbCardSub}>your assistant · reads it, then does it</span>
                    </div>

                    {/* keyed on the active source so each switch remounts the steps
                        and replays the staggered In → Task → Done entrance. */}
                    <div className={styles.swbFlow} aria-live="polite" key={active}>
                      <div className={styles.swbStep}>
                        <span className={styles.swbStepK}>
                          {flow.kIcon}
                          {flow.kind}
                        </span>
                        <p className={styles.swbInT}>{flow.text}</p>
                      </div>
                      <div className={`${styles.swbStep} ${styles.swbTask}`}>
                        <span className={styles.swbTaskT}>
                          <span className={styles.o} />
                          {flow.task}
                        </span>
                        <span className={styles.swbChips}>
                          {flow.chips.map(([k, v]) => (
                            <span
                              key={v}
                              className={`${styles.swbChip} ${k === "date" ? styles.date : styles.lab}`}
                            >
                              {v}
                            </span>
                          ))}
                        </span>
                      </div>
                      <div className={`${styles.swbStep} ${styles.swbDone}`}>
                        <span className={styles.dc}>{flow.dIcon}</span>
                        <span>{flow.done}</span>
                        <span className={styles.spark}>✦</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className={styles.band} id="how">
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.reveal}`}>
              <span className={styles.eyebrow}>
                <Spark size={11} className={styles.spark} />
                How it works
              </span>
              <h2>Three ways in. One that finishes the job.</h2>
            </div>
            <div className={styles.beats} ref={beatsRef}>
              <div className={styles.spine}>
                <div className={styles.spineFill} />
              </div>

              <div className={`${styles.beat} ${styles.reveal}`}>
                <div className={styles.nodeDot}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <path d="M3 7l9 6 9-6" />
                  </svg>
                </div>
                <div className={styles.beatBody}>
                  <div>
                    <span className={styles.beatNum}>01 — Capture</span>
                    <h3>Throw it whatever you&apos;ve got.</h3>
                    <p>
                      Forward an email, drop a screenshot, or jot one messy line. No formatting, no
                      fields — Tada takes it raw, from anywhere.
                    </p>
                  </div>
                  <div className={styles.beatArt}>
                    <div className={styles.mini}>
                      <div className={styles.miniH}>Forwarded · email</div>
                      <div className={styles.miniLine}>
                        <span className={styles.mi}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M4 7h16M4 12h10M4 17h7" />
                          </svg>
                        </span>
                        <span>“…can we sync <b>Tue afternoon</b>? I&apos;ll send the brief. — Dakota”</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${styles.beat} ${styles.reveal}`}>
                <div className={styles.nodeDot}>
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2c.5 4.6 2.7 6.8 7 7-4.3.5-6.5 2.7-7 7-.5-4.3-2.7-6.5-7-7 4.3-.5 6.5-2.7 7-7Z" />
                  </svg>
                </div>
                <div className={styles.beatBody}>
                  <div>
                    <span className={styles.beatNum}>02 — Tada reads it</span>
                    <h3>It writes the real task for you.</h3>
                    <p>
                      Tada pulls out what matters — a clear title, the due date, who&apos;s involved,
                      the right labels and priority. One capture can become several tasks.
                    </p>
                  </div>
                  <div className={styles.beatArt}>
                    <div className={styles.mini}>
                      <div className={styles.miniH}>Structured task</div>
                      <div className={styles.miniLine}>
                        <span className={styles.mi}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L19 7" />
                          </svg>
                        </span>
                        <span>
                          <b>Send Dakota the project brief</b>
                        </span>
                      </div>
                      <div style={{ paddingTop: 4 }}>
                        <span className={styles.miniField}>Tue 2:00 PM</span>
                        <span className={styles.miniField}>#work</span>
                        <span className={styles.miniField}>P1</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${styles.beat} ${styles.reveal}`}>
                <div className={styles.nodeDot}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9Z" />
                  </svg>
                </div>
                <div className={styles.beatBody}>
                  <div>
                    <span className={styles.beatNum}>03 — Ta-da</span>
                    <h3>Then it does the task for you.</h3>
                    <p>
                      Send the calendar invite, set the reminder, run the research — Tada does the
                      busywork and hands back the result. Anything that leaves the app asks first.
                    </p>
                  </div>
                  <div className={styles.beatArt}>
                    <div className={styles.mini}>
                      <div className={styles.miniH}>Done for you</div>
                      <div className={styles.miniLine}>
                        <span className={styles.mi}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="5" width="18" height="16" rx="2" />
                            <path d="M3 9h18M8 3v4M16 3v4" />
                          </svg>
                        </span>
                        <span>
                          <b>Invite sent</b> to Dakota · Tue 2:00 PM
                        </span>
                      </div>
                      <div className={styles.miniLine}>
                        <span className={styles.mi}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 8v5l3 2" />
                            <circle cx="12" cy="13" r="8" />
                          </svg>
                        </span>
                        <span>
                          <b>Reminder set</b> · 1 hour before
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TODO VS TADA */}
        <section className={styles.band} id="vs" style={{ paddingTop: 20 }}>
          <div className={styles.wrap}>
            <div className={`${styles.secHead} ${styles.reveal}`}>
              <span className={styles.eyebrow}>
                <Spark size={11} className={styles.spark} />
                Todo vs Tada
              </span>
              <h2>
                Every to-do app stops at the list. <em style={{ fontStyle: "italic", color: "var(--accent)" }}>Tada keeps going.</em>
              </h2>
            </div>
            <div className={`${styles.versus} ${styles.reveal}`}>
              <div className={`${styles.vh} ${styles.them}`}>A normal to-do app</div>
              <div className={`${styles.vh} ${styles.us}`}>
                <Spark size={12} className={styles.spark} /> Tada
              </div>
              <div className={`${styles.vcell} ${styles.them}`}>You type every task out by hand.</div>
              <div className={`${styles.vcell} ${styles.us}`}>
                You forward, snap, or jot — and it <span className={styles.hl}>writes</span> the task.
              </div>
              <div className={`${styles.vcell} ${styles.them}`}>It stores your work and waits.</div>
              <div className={`${styles.vcell} ${styles.us}`}>
                It <span className={styles.hl}>does</span> your work — invites, reminders, research.
              </div>
              <div className={`${styles.vcell} ${styles.them}`}>You leave to go book the meeting.</div>
              <div className={`${styles.vcell} ${styles.us}`}>
                It <span className={styles.hl}>books</span> the meeting — you just confirm.
              </div>
            </div>
          </div>
        </section>

        {/* CLOSE + CTA */}
        <section className={styles.close} id="get-started">
          <div className={`${styles.wrap} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center", display: "flex" }}>
              <Spark size={11} className={styles.spark} />
              Invite-only, for now
            </span>
            <h2>
              Stop managing your to-dos.
              <br />
              Just say <em>ta-da.</em>
            </h2>
            <p className={styles.lede}>
              Tada is opening up soon. Got an invite? Sign in and you&apos;re in.
            </p>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => signIn("google", { redirectTo: "/app" })}
            >
              Get started
            </button>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.foot}`}>
          <a className={styles.word} href="#top">
            Tada
            <Spark size={12} className={styles.spark} />
          </a>
          <small>Not to-do. Ta-da.</small>
        </div>
      </footer>
    </div>
  );
}
