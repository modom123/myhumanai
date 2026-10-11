/*
 * FILE    : apps/web/app/hub/market/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_0152 UTC
 * PURPOSE : Handled Hub → Market pricing. Per service: the suggested price for a typical job, what
 *           pros actually do with offers (accept / decline / counter / nobody), how customers price
 *           (offers vs. suggestion), the learned factor (or a manual override), and what we and the
 *           pro make at the typical price (sliding commission + booking fee).
 * UPDATED : 2026-10-06_0740 UTC — "Pro pay, sliding scale" table: at each job size, what the pro is paid, what we keep and
 *           each as a % of the price (slidingScale, the same math that pays pros); Pro share column per service.
 * UPDATED : 2026-10-09_0310 UTC — sliding-scale note matches the +5-point price change (pro keeps ~75% → ~63% of the price).
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { BOOKING_FEE, COMMISSION, MARKET_BOUNDS, SERVICES, TAKE_MAX, commissionRate, defaultAnswers, estimate, money, slidingScale, splitJob } from "@handled/core";
import { adminClient } from "@/lib/supabase/server";
import { Stat } from "@/components/ui";
import { FactorOverride, RelearnButton } from "@/components/MarketAdmin";
import { adminOnly } from "@/components/AdminOnly";

export const dynamic = "force-dynamic";
const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function MarketPricing() {
  const gate = await adminOnly(); if (gate) return gate;
  const db = adminClient();
  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const [{ data: sig }, { data: factors }, { data: offers }] = await Promise.all([
    db.from("price_signals").select("service_slug, price, suggested, outcome, counter").gte("created_at", since).limit(50000),
    db.from("market_factors").select("service_slug, area, factor, manual_factor, samples, target, updated_at").eq("area", "all"),
    db.from("jobs").select("service_slug, suggested_price, customer_offer").not("customer_offer", "is", null).gte("created_at", since).limit(20000),
  ]);
  type S = { service_slug: string; price: number; suggested: number; outcome: string; counter: number | null };
  const by = new Map<string, S[]>();
  for (const r of (sig ?? []) as S[]) by.set(r.service_slug, [...(by.get(r.service_slug) ?? []), r]);
  const f = new Map(((factors ?? []) as { service_slug: string; factor: number; manual_factor: number | null; samples: number; target: number | null }[]).map((x) => [x.service_slug, x]));
  const named = new Map<string, number[]>();
  for (const j of (offers ?? []) as { service_slug: string; suggested_price: number; customer_offer: number }[]) if (Number(j.suggested_price) > 0) named.set(j.service_slug, [...(named.get(j.service_slug) ?? []), Number(j.customer_offer) / Number(j.suggested_price)]);
  const all = (sig ?? []) as S[];
  const acc = all.filter((s) => s.outcome === "accepted").length;
  const ctr = all.filter((s) => s.outcome === "countered").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Market pricing</h1>
          <p className="text-sm text-ink-soft">Customers can name their price around our suggestion; pros accept, pass or counter. Every outcome teaches the suggestion (daily, damped, kept within {MARKET_BOUNDS.min}–{MARKET_BOUNDS.max}× and only after {MARKET_BOUNDS.minSamples}+ outcomes). Set a factor to override; clear it to let it learn.</p>
        </div>
        <RelearnButton />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Offer outcomes (60d)" value={all.length} hint="accepts, passes, counters, nobody" />
        <Stat label="Accepted" value={all.length ? pct(acc / all.length) : "—"} hint="of outcomes" />
        <Stat label="Countered" value={all.length ? pct(ctr / all.length) : "—"} hint="pros asking for more" />
        <Stat label="Our cut" value={`${pct(COMMISSION.minRate)} → ${pct(COMMISSION.maxRate)}`} hint={`$${COMMISSION.from} → $${COMMISSION.to}+ jobs, plus ${money(BOOKING_FEE)} booking fee`} />
      </div>
      <div className="card overflow-x-auto p-0">
        <div className="p-4 pb-2">
          <h2 className="font-bold">Pro pay, sliding scale</h2>
          <p className="text-sm text-ink-soft">The real split on every job (customer price includes the {money(BOOKING_FEE)} booking fee). Small jobs: the pro keeps ~75% of the price; $600+ jobs: ~63% (customers pay Handled's +5 points; pro pay unchanged). Our share never passes {pct(TAKE_MAX)}. Pro+ / Elite pros earn up to 3–5 points more.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="p-3">Customer pays</th><th className="p-3 text-right">Pro earns</th><th className="p-3 text-right">Pro share</th><th className="p-3 text-right">We keep</th><th className="p-3 text-right">Our share</th><th className="p-3 text-right">Commission</th></tr>
          </thead>
          <tbody>
            {slidingScale().map((r) => (
              <tr key={r.price} className="border-t border-line">
                <td className="p-3">{money(r.price)}</td>
                <td className="p-3 text-right font-semibold">{money(r.payout)}</td>
                <td className="p-3 text-right">{pct(r.proShare)}</td>
                <td className="p-3 text-right">{money(r.take)}</td>
                <td className="p-3 text-right">{pct(r.takeRate)}</td>
                <td className="p-3 text-right text-ink-soft">{pct(r.commission)}{r.fee ? ` + ${money(r.fee)}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft">
            <tr><th className="p-3">Service</th><th className="p-3 text-right">Typical price</th><th className="p-3 text-right">Pro earns</th><th className="p-3 text-right">We keep</th><th className="p-3 text-right">Outcomes</th><th className="p-3 text-right">Accept · counter</th><th className="p-3 text-right">Customers offer</th><th className="p-3">Factor</th><th className="p-3">Override</th></tr>
          </thead>
          <tbody>
            {SERVICES.filter((s) => !s.siteVisit).map((s) => {
              const fx = f.get(s.slug);
              const factor = Number(fx?.manual_factor ?? fx?.factor ?? 1);
              const e = estimate({ slug: s.slug, answers: defaultAnswers(s), market: factor });
              const sp = splitJob(e.point, s.slug);
              const rows = by.get(s.slug) ?? [];
              const a = rows.filter((r) => r.outcome === "accepted").length, c = rows.filter((r) => r.outcome === "countered").length;
              const n = named.get(s.slug) ?? [];
              const avgOffer = n.length ? n.reduce((t, x) => t + x, 0) / n.length : null;
              return (
                <tr key={s.slug} className="border-t border-line">
                  <td className="p-3">{s.icon} {s.name}</td>
                  <td className="p-3 text-right">{money(e.point)}</td>
                  <td className="p-3 text-right">{money(sp.payout)} <span className="text-xs text-ink-soft">({pct(sp.payout / e.point)})</span></td>
                  <td className="p-3 text-right">{money(sp.take)} <span className="text-xs text-ink-soft">({pct(commissionRate(e.point - sp.fee, s.slug))} + fee)</span></td>
                  <td className="p-3 text-right">{rows.length || "—"}</td>
                  <td className="p-3 text-right">{rows.length ? `${pct(a / rows.length)} · ${pct(c / rows.length)}` : "—"}</td>
                  <td className="p-3 text-right">{avgOffer ? `${avgOffer >= 1 ? "+" : "−"}${pct(Math.abs(avgOffer - 1))} (${n.length})` : "—"}</td>
                  <td className="p-3">{factor.toFixed(2)}× {fx?.manual_factor != null ? <b className="text-xs">manual</b> : fx ? <span className="text-xs text-ink-soft">learned · {fx.samples} · target {fx.target ?? "—"}</span> : <span className="text-xs text-ink-soft">no data</span>}</td>
                  <td className="p-3"><FactorOverride slug={s.slug} manual={fx?.manual_factor ?? null} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-soft">Typical price = the default job on the booking page, after the factor, including the booking fee. Site-visit services (quoted on site) aren’t listed. Per-ZIP-area factors are learned too and used automatically where there’s enough data.</p>
    </div>
  );
}
