import { LEGAL } from "@/lib/legal";

export type Section = { h: string; body: React.ReactNode };

/** Shared, readable layout for /privacy and /terms. */
export function LegalPage({ title, intro, sections }: { title: string; intro: React.ReactNode; sections: Section[] }) {
  return (
    <main className="mx-auto min-h-dvh max-w-[680px] px-5 pb-16 pt-[max(env(safe-area-inset-top),28px)] text-[15px] leading-relaxed text-white/85">
      <a href="/" className="text-[14px] font-semibold text-lav">← Back to Tyche</a>
      <h1 className="mb-1 mt-6 font-display text-[34px] font-extrabold tracking-[-0.03em] text-white">{title}</h1>
      <p className="mb-8 text-[13px] text-dim">Last updated {LEGAL.updated}</p>
      <div className="mb-8">{intro}</div>
      {sections.map((s, i) => (
        <section key={s.h} className="mb-8">
          <h2 className="mb-2 font-display text-[20px] font-bold text-white">
            {i + 1}. {s.h}
          </h2>
          <div className="space-y-3 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">{s.body}</div>
        </section>
      ))}
      <p className="mt-10 border-t border-white/10 pt-6 text-[13px] text-dim">
        Questions? Email <a className="text-lav" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
      </p>
    </main>
  );
}
