"use client";

import { useEffect, useRef, useState } from "react";
import { WaitlistForm } from "./WaitlistForm";
import styles from "./Landing.module.css";

// T4.1 — the marketing landing, ported from design/landing-preview (rust palette,
// already on-brand). Static-first: content is visible without JS; a mount effect
// layers the entrance reveal, the frosted-on-scroll nav, and the beats spine.
function Spark({ size = 12 }: { size?: number }) {
  return (
    <svg className={styles.spark} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 0c.6 5.7 3.3 8.4 9 9-5.7.6-8.4 3.3-9 9-.6-5.7-3.3-8.4-9-9 5.7-.6 8.4-3.3 9-9Z"
      />
    </svg>
  );
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12l5 5L19 7" />
  </svg>
);

export function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

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

  return (
    <div className={styles.landing} ref={rootRef} id="top">
      <header className={styles.nav} data-scrolled={scrolled}>
        <div className={`${styles.wrap} ${styles.navIn}`}>
          <a className={styles.word} href="#top" aria-label="Tada home">
            Tada
            <Spark size={13} />
          </a>
          <div className={styles.navCta}>
            <a href="#waitlist" className={`${styles.btn} ${styles.btnPrimary} ${styles.btnSm}`}>
              Join the waitlist
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className={styles.hero}>
          <div className={`${styles.wrap} ${styles.heroGrid}`}>
            <div className={`${styles.heroCopy} ${styles.reveal}`}>
              <span className={styles.eyebrow}>
                <Spark size={11} />
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
              <div className={styles.swbGrid}>
                <div className={styles.swbSources}>
                  <div className={styles.swbSrc} data-on="true">
                    <span className={styles.swbSrcT}>Email</span>
                    <span className={styles.swbSrcM}>Forwarded · your inbox</span>
                  </div>
                  <div className={styles.swbSrc}>
                    <span className={styles.swbSrcT}>Screenshots</span>
                    <span className={styles.swbSrcM}>Pasted · images</span>
                  </div>
                  <div className={styles.swbSrc}>
                    <span className={styles.swbSrcT}>Quick add</span>
                    <span className={styles.swbSrcM}>Typed or spoken</span>
                  </div>
                </div>

                <div className={styles.swbHub}>
                  <div className={styles.swbCard}>
                    <div className={styles.swbCardTop}>
                      <span className={styles.swbCardMark}>
                        Tada
                        <Spark size={13} />
                      </span>
                      <span className={styles.swbCardDot} aria-hidden="true" />
                    </div>
                    <span className={styles.swbCardSub}>your assistant · reads it, then does it</span>
                  </div>
                  <div className={styles.swbTask}>
                    <span className={styles.swbTaskT}>
                      <span className={styles.o} />
                      Meet Dakota — project sync
                    </span>
                    <span className={styles.swbChips}>
                      <span className={`${styles.swbChip} ${styles.date}`}>Tue 2:00 PM</span>
                      <span className={`${styles.swbChip} ${styles.lab}`}>#work</span>
                    </span>
                  </div>
                  <div className={styles.swbDone}>
                    <span className={styles.dc}>
                      <Check />
                    </span>
                    <span>Booked it — invite sent to Dakota</span>
                    <span className={styles.spark}>✦</span>
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
                <Spark size={11} />
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
                <Spark size={11} />
                Todo vs Tada
              </span>
              <h2>
                Every to-do app stops at the list. <em style={{ fontStyle: "italic", color: "var(--accent)" }}>Tada keeps going.</em>
              </h2>
            </div>
            <div className={`${styles.versus} ${styles.reveal}`}>
              <div className={`${styles.vh} ${styles.them}`}>A normal to-do app</div>
              <div className={`${styles.vh} ${styles.us}`}>
                <Spark size={12} /> Tada
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

        {/* CLOSE + WAITLIST */}
        <section className={styles.close} id="waitlist">
          <div className={`${styles.wrap} ${styles.reveal}`}>
            <span className={styles.eyebrow} style={{ justifyContent: "center", display: "flex" }}>
              <Spark size={11} />
              Be first in line
            </span>
            <h2>
              Stop managing your to-dos.
              <br />
              Just say <em>ta-da.</em>
            </h2>
            <p className={styles.lede}>
              Tada is opening up soon. Join the waitlist and we&apos;ll let you in early.
            </p>
            <WaitlistForm />
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={`${styles.wrap} ${styles.foot}`}>
          <a className={styles.word} href="#top">
            Tada
            <Spark size={12} />
          </a>
          <small>Not to-do. Ta-da.</small>
        </div>
      </footer>
    </div>
  );
}
