import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Temporary design-system smoke page: proves the DESIGN.md ramp and the azure
// signal render. Replaced by the real home screen in ticket 015.
const RAMP = [
  "bg-bg",
  "bg-surface",
  "bg-raised",
  "bg-line",
  "bg-ink-faint",
  "bg-ink-muted",
  "bg-ink",
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[480px] flex-col gap-8 px-4 py-12">
      <div>
        <h1 className="text-[1.375rem] leading-tight font-semibold">Workount</h1>
        <p className="text-ink-muted mt-1 text-sm">
          Design system — azure signal on a neutral chassis.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <span className="text-ink-faint text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
          Neutral ramp
        </span>
        <div className="border-line flex overflow-hidden rounded-md border">
          {RAMP.map((c) => (
            <div key={c} className={`h-12 flex-1 ${c}`} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <span className="text-ink-faint text-[0.6875rem] font-medium tracking-[0.06em] uppercase">
          Signal — live only
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Start workout</Button>
          <span className="text-signal font-mono text-[2.25rem] font-semibold tabular-nums">
            1:30
          </span>
          <Badge className="bg-signal text-[oklch(0.13_0_0)]">NEW PR</Badge>
        </div>
      </section>

      <section className="border-line flex flex-col gap-2 border-t pt-4">
        <span className="text-signal font-mono text-sm tabular-nums">
          SET 3 OF 4 · 80 × 8
        </span>
        <span className="text-ink-faint font-mono text-sm tabular-nums">
          w · 40 × 10 (warmup, does not count)
        </span>
      </section>
    </main>
  );
}
