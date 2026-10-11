/*
 * FILE    : apps/web/app/hub/finance/page.tsx
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * UPDATED : 2026-10-01_1830 UTC — Uber-style reporting: bookings vs our take vs net after
 *           card fees; take-rate band check per service; payouts held until collected.
 * UPDATED : 2026-10-03_0120 UTC — proposed pro deductions: pro's response, uphold / waive with a reason.
 * PURPOSE : Unit economics — revenue, payouts, gross margin by service; payout queue;
 *           AI cost tracking from ai_runs.
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { CARD_FEE, TAKE_MAX, TAKE_MIN, getService, money } from "@handled/core";
import { getViewer } from "@/lib/auth";
import { Empty, Stat } from "@/components/ui";
import { PayoutButton } from "@/components/HubActions";
import { DeductionDecision } from "@/components/Deductions";
import { adminOnly } from "@/components/AdminOnly";

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// Claude Opus 5.5 list price per million tokens (input / output) — update if pricing changes.
const AI_PRICE = { input: 4, output: 20 };

export default async function Finance() {
  const gate = await adminOnly(); if (gate) return gate;
  const v = await getViewer();
  if (!v) return null;
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: done }, { data: payouts }, { data: runs }, { data: priced }, { data: deds }] = await Promise.all([
    v.db.from("jobs").select("service_slug, price_final, contractor_payout").eq("status", "completed").gte("completed_at", since),
    v.db.from("payouts").select("id, amount, status, kind, reason, created_at, contractors(business_name), jobs(ref)").in("status", ["approved", "pending", "held"]).order("created_at"),
    v.db.from("ai_runs").select("kind, input_tokens, output_tokens").gte("created_at", since),
    // pricing accuracy: last 90 days of paid jobs — did the instant price hold up on site?
    v.db.from("jobs").select("service_slug, price_final, scope_extra, ai_quote, status").not("price_final", "is", null).is("remedy", null).gte("created_at", new Date(Date.now() - 90 * 86400000).toISOString()),
    v.db.from("pro_deductions").select("id, amount, reason, source, respond_by, pro_response, responded_at, created_at, contractors(business_name), jobs(ref)").eq("status", "proposed").order("respond_by"),
  ]);
  const acc = new Map<string, { jobs: number; changed: number; extra: number; aiUp: number; aiDown: number; siteVisits: number }>();
  for (const j of (priced ?? []) as Rec[]) {
    const a = acc.get(j.service_slug) ?? { jobs: 0, changed: 0, extra: 0, aiUp: 0, aiDown: 0, siteVisits: 0 };
    a.jobs++;
    if (Number(j.scope_extra) > 0) { a.changed++; a.extra += Number(j.scope_extra); }
    const q = j.ai_quote as Rec | null;
    if (q?.baseline_point) { if (q.final_price > q.baseline_point) a.aiUp++; else if (q.final_price < q.baseline_point) a.aiDown++; }
    if (q?.action === "site_visit") a.siteVisits++;
    acc.set(j.service_slug, a);
  }
  const accuracy = [...acc.entries()].sort((x, y) => y[1].changed / y[1].jobs - x[1].changed / x[1].jobs);
  const rows = new Map<string, { jobs: number; revenue: number; payout: number }>();
  for (const j of (done ?? []) as Rec[]) {
    const r = rows.get(j.service_slug) ?? { jobs: 0, revenue: 0, payout: 0 };
    r.jobs++; r.revenue += Number(j.price_final ?? 0); r.payout += Number(j.contractor_payout ?? 0);
    rows.set(j.service_slug, r);
  }
  const tot = [...rows.values()].reduce((t, r) => ({ jobs: t.jobs + r.jobs, revenue: t.revenue + r.revenue, payout: t.payout + r.payout }), { jobs: 0, revenue: 0, payout: 0 });
  const aiCost = (runs ?? []).reduce((t: number, r: Rec) => t + ((r.input_tokens ?? 0) * AI_PRICE.input + (r.output_tokens ?? 0) * AI_PRICE.output) / 1e6, 0);
  const fees = (done ?? []).reduce((t: number, j: Rec) => t + (Number(j.price_final ?? 0) > 0 ? Number(j.price_final) * CARD_FEE.pct + CARD_FEE.fixed : 0), 0);
  const take = tot.revenue - tot.payout;
  const outOfBand = (done ?? []).filter((j: Rec) => { const p = Number(j.price_final ?? 0); const r = p ? 1 - Number(j.contractor_payout ?? 0) / p : 1; return p > 0 && (r < TAKE_MIN - 0.001 || r > TAKE_MAX + 0.05); }).length;
  const owed = (payouts ?? []).filter((p: Rec) => p.status === "approved").reduce((t: number, p: Rec) => t + Number(p.amount), 0);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Finance <span className="text-base font-normal text-ink-soft">last 30 days</span></h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Bookings (customers paid)" value={money(tot.revenue)} hint={`${tot.jobs} completed jobs`} />
        <Stat label="Our take" value={money(take)} hint={tot.revenue ? `${Math.round((take / tot.revenue) * 100)}% avg take · band ${TAKE_MIN * 100}–${TAKE_MAX * 100}%` : `band ${TAKE_MIN * 100}–${TAKE_MAX * 100}%`} />
        <Stat label="Net after card fees" value={money(take - fees)} hint={`${money(fees)} est. processing · ${outOfBand} jobs outside band`} />
        <Stat label="Payouts owed" value={money(owed)} />
        <Stat label="AI cost" value={`$${aiCost.toFixed(2)}`} hint={`${runs?.length ?? 0} AI calls · ${tot.jobs ? `$${(aiCost / tot.jobs).toFixed(2)}/job` : ""}`} />
      </div>
      <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
        <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft"><tr><th className="p-3">Service</th><th className="p-3">Jobs</th><th className="p-3">Bookings</th><th className="p-3">Paid to pros</th><th className="p-3">Our take</th><th className="p-3">Take %</th><th className="p-3">Avg ticket</th></tr></thead>
        <tbody>{[...rows.entries()].sort((a, b) => b[1].revenue - a[1].revenue).map(([slug, r]) => (
          <tr key={slug} className="border-t border-line"><td className="p-3 font-medium">{getService(slug)?.name}</td><td className="p-3">{r.jobs}</td><td className="p-3">{money(r.revenue)}</td><td className="p-3">{money(r.payout)}</td><td className="p-3">{money(r.revenue - r.payout)}</td><td className="p-3">{r.revenue ? Math.round(((r.revenue - r.payout) / r.revenue) * 100) : 0}%</td><td className="p-3">{money(r.revenue / r.jobs)}</td></tr>
        ))}{!rows.size && <tr><td className="p-3 text-ink-soft">No completed jobs in the last 30 days.</td></tr>}</tbody>
      </table></div>
      <section>
        <h2 className="mb-1 font-bold">Proposed pro deductions</h2>
        <p className="mb-3 text-sm text-ink-soft">Workmanship refunds and lost chargebacks the pro may owe. The customer was already refunded from our share. The pro has 3 business days to respond; you can uphold once they’ve answered or the deadline has passed. Upheld amounts come out of their payouts — never more than half a week’s pay, never tips.</p>
        {!(deds ?? []).length ? <Empty>Nothing waiting.</Empty> : (
          <div className="space-y-2">{((deds ?? []) as unknown as { id: string; amount: number; reason: string; source: string; respond_by: string; pro_response: string | null; contractors: { business_name: string } | null; jobs: { ref: string } | null }[]).map((d) => {
            const canUphold = Boolean(d.pro_response) || new Date(d.respond_by) <= new Date();
            return (
              <div key={d.id} className="card text-sm">
                <div className="flex flex-wrap justify-between gap-2"><b>{d.contractors?.business_name} · {d.jobs?.ref ?? "—"} · {money(Number(d.amount))}</b><span className="text-ink-soft">{d.source} · respond by {d.respond_by.slice(0, 16).replace("T", " ")} UTC</span></div>
                <p className="mt-1 text-ink-soft">{d.reason}</p>
                {d.pro_response ? <p className="mt-2 rounded-lg bg-paper p-2"><b>Pro:</b> {d.pro_response}</p> : <p className="mt-2 text-xs text-ink-soft">No response yet.</p>}
                <DeductionDecision id={d.id} canUphold={canUphold} />
              </div>
            );
          })}</div>
        )}
      </section>
      <section>
        <h2 className="mb-1 font-bold">Payout queue</h2>
        <p className="mb-3 text-sm text-ink-soft">Pros are paid from money already collected: <b>approved</b> = customer charged · <b>pending</b> = confirm payment received first · <b>held</b> = customer charge failed.</p>
        {!(payouts ?? []).length && <Empty>Nothing owed.</Empty>}
        <div className="space-y-2">{(payouts ?? []).map((p: Rec) => (
          <div key={p.id} className="card flex items-center justify-between p-4 text-sm"><div><span className="font-semibold">{p.contractors?.business_name}</span> · {p.jobs?.ref ?? p.reason} · {p.kind && p.kind !== "job" ? `${String(p.kind).replace("_", "-")} · ` : ""}{p.status}</div><div className="flex items-center gap-3"><b>{money(p.amount)}</b><PayoutButton id={p.id} status={p.status} /></div></div>
        ))}</div>
      </section>
      <section>
        <h2 className="mb-1 font-bold">Pricing accuracy <span className="text-sm font-normal text-ink-soft">last 90 days</span></h2>
        <p className="mb-3 text-sm text-ink-soft">Change orders mean the instant price was too low for what the pro found on site. If a service keeps needing them, raise its rates in the pricing engine (packages/core/src/services.ts) or add a booking question that captures what was missed.</p>
        {!accuracy.length ? <Empty>No priced jobs yet.</Empty> : (
          <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-ink-soft"><th className="p-3">Service</th><th className="p-3">Jobs</th><th className="p-3">Needed a change order</th><th className="p-3">Avg extra</th><th className="p-3">AI raised / lowered</th><th className="p-3">Sent to site visit</th></tr></thead>
            <tbody>{accuracy.map(([slug, a]) => (
              <tr key={slug} className="border-t border-line"><td className="p-3">{getService(slug)?.name ?? slug}</td><td className="p-3">{a.jobs}</td>
                <td className={`p-3 ${a.changed / a.jobs >= 0.15 ? "font-semibold text-rose-700" : ""}`}>{Math.round((a.changed / a.jobs) * 100)}%{a.changed / a.jobs >= 0.15 ? " — underpriced?" : ""}</td>
                <td className="p-3">{a.changed ? money(a.extra / a.changed) : "—"}</td><td className="p-3">{a.aiUp} / {a.aiDown}</td><td className="p-3">{a.siteVisits}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
