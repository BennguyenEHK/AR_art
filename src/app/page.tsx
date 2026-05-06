import Link from "next/link";

export default function Home() {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col px-6 py-8 sm:px-10 sm:py-12">
      {/* ── top masthead ───────────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <span className="tiny-caps">AR_ART · web ar · v0.1</span>
        <span className="tiny-caps hidden sm:inline">a peace-board · phase 01</span>
      </header>

      {/* ── editorial hero ─────────────────────────────────────────────── */}
      <section className="relative grid flex-1 grid-cols-12 items-center gap-x-6 pt-16 sm:pt-24">
        {/* vertical side-label — pure decoration / wayfinding */}
        <div className="col-span-1 hidden self-stretch md:flex md:flex-col md:items-start md:justify-between">
          <span className="vertical-rl tiny-caps">phase one — board tracking</span>
          <span className="vertical-rl tiny-caps">no agents · no audio · yet</span>
        </div>

        <div className="col-span-12 md:col-span-8 md:col-start-2">
          <p className="tiny-caps mb-6">an unfolding piece — first session</p>

          <h1 className="font-[var(--font-display)] text-[clamp(2.5rem,8vw,6rem)] font-medium leading-[0.96] tracking-[-0.01em] text-[color:var(--ink)]">
            A peace‑board,
            <br />
            made <em className="italic font-[var(--font-display)] text-[color:var(--accent)]">together</em>.
          </h1>

          <p className="mt-8 max-w-xl text-lg leading-relaxed text-[color:var(--ink-soft)] sm:text-xl">
            Print the board. Open this page on any phone with a camera. The
            statue rises out of the wood and{" "}
            <span className="text-[color:var(--ink)]">everyone watching sees the same thing,
            at the same moment.</span>
          </p>

          {/* CTA row */}
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href="/ar"
              className="group inline-flex items-center gap-3 rounded-full bg-[color:var(--ink)] px-7 py-3.5 text-[15px] font-medium tracking-wide text-[color:var(--paper)] transition hover:bg-[color:var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent-soft)] transition group-hover:bg-[color:var(--paper)]" />
              Begin AR
              <span className="font-mono text-[11px] opacity-70 transition group-hover:translate-x-0.5">
                →
              </span>
            </Link>

            <a
              href="https://github.com/BennguyenEHK/AR_art/blob/main/instructions.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--rule)] px-5 py-3 text-[13px] font-medium text-[color:var(--ink-soft)] transition hover:border-[color:var(--ink-soft)] hover:text-[color:var(--ink)]"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] opacity-70">
                docs
              </span>
              setup the board & model
            </a>
          </div>
        </div>

        {/* ornamental signpost — sits in the gutter on wide screens */}
        <aside className="col-span-12 mt-14 md:col-span-3 md:col-start-10 md:mt-0">
          <div className="relative rounded-2xl border border-[color:var(--rule)] bg-[color:var(--paper-deep)]/60 p-5 backdrop-blur-sm">
            <div className="tiny-caps mb-3">how it travels</div>
            <ol className="space-y-3 text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-[color:var(--accent)]">01</span>
                Print the marker board (A4 / Letter).
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-[color:var(--accent)]">02</span>
                Lay it flat. Tap{" "}
                <span className="text-[color:var(--ink)]">Begin AR</span>.
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-[color:var(--accent)]">03</span>
                Allow camera. Aim at the print.
              </li>
              <li className="flex gap-3">
                <span className="font-mono text-[11px] text-[color:var(--accent)]">04</span>
                The statue arrives.
              </li>
            </ol>
          </div>
        </aside>
      </section>

      {/* ── footer — credits / micro-status ───────────────────────────── */}
      <footer className="hairline mt-20 grid grid-cols-12 gap-x-6 pt-6">
        <div className="col-span-6 md:col-span-4">
          <p className="tiny-caps">stack</p>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--ink-soft)]">
            next.js · three.js · mind‑ar · ably (off)
          </p>
        </div>
        <div className="col-span-6 md:col-span-4 md:col-start-5">
          <p className="tiny-caps">requires</p>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--ink-soft)]">
            https · camera · printed marker
          </p>
        </div>
        <div className="hidden md:col-span-3 md:col-start-10 md:block text-right">
          <p className="tiny-caps">deploy</p>
          <p className="mt-2 font-mono text-[12px] leading-relaxed text-[color:var(--ink-soft)]">
            vercel
          </p>
        </div>
      </footer>
    </main>
  );
}
