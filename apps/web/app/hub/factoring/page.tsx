/*
 * FILE    : apps/web/app/hub/factoring/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-06_0324 UTC
 * PURPOSE : Handled Hub → Factoring: the invoice factoring partners we're lining up so weekly pro payouts stay on time
 *           while business, city and government clients pay on net 30–60. Outreach status, each quote, and its cost on
 *           the same sample invoice, plus the questions to ask and the government assignment rules.
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { FACTORING_SAMPLE, FACTORING_STATUS_LABEL, factoringCost, money, type FactoringStatus } from "@handled/core";
import { adminClient } from "@/lib/supabase/server";
import { Badge, Stat } from "@/components/ui";
import { AddFactoringPartner, FactoringEditor, type FactoringRow } from "@/components/FactoringUI";
import { adminOnly } from "@/components/AdminOnly";

export const dynamic = "force-dynamic";

const DOCS = "https://github.com/modom123/HandledServices/blob/main/docs";
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const TONE: Record<FactoringStatus, "slate" | "green" | "amber" | "red" | "brand"> = {
  to_contact: "slate", emailed: "amber", call_scheduled: "amber", quote_received: "brand", applied: "brand", active: "green", passed: "red",
};

type Row = FactoringRow & { website: string | null; fit: string | null; updated_at: string };

export default async function FactoringHub() {
  const gate = await adminOnly(); if (gate) return gate;
  const { data, error } = await adminClient().from("factoring_partners").select("*").order("sort").order("name");
  if (error) return (
    <div className="card max-w-2xl"><h1 className="text-xl font-bold">Factoring isn&apos;t switched on yet</h1>
      <p className="mt-2 text-sm text-ink-soft">Run <code>supabase/setup/ADD_FACTORING_PARTNERS_2026-10-06_0324.sql</code> once in Supabase → SQL Editor. It adds the five factoring partners.</p></div>
  );
  const P = (data ?? []) as Row[];
  const costed = P.map((p) => ({ p, c: factoringCost({ advanceRate: p.advance_rate, feePct: p.fee_pct, feePeriodDays: p.fee_period_days }) }));
  const quoted = costed.filter((x) => x.c);
  const best = quoted.length ? quoted.reduce((a, b) => (b.c!.totalCost < a.c!.totalCost ? b : a)) : null;
  const contacted = P.filter((p) => p.status !== "to_contact").length;
  const active = P.filter((p) => p.status === "active");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Invoice factoring</h1>
        <p className="max-w-3xl text-sm text-ink-soft">Larger businesses, cities and government agencies pay on net 30–60, but pros are paid in the weekly payout run. A factoring partner advances 80–90% of an approved invoice in 1–2 days and collects from the client; we get the rest, minus the fee, when the client pays. Government receivables usually cost about 0.69%–1.59% per 30 days. Every quote below is compared on the same sample: a {money(FACTORING_SAMPLE.invoice)} invoice paid in {FACTORING_SAMPLE.daysToPay} days.</p>
        <p className="mt-2 text-sm"><a className="underline" href={`${DOCS}/FACTORING_OUTREACH_EMAIL_2026-10-06_0320.md`}>Outreach emails</a> · <a className="underline" href={`${DOCS}/FACTORING_COMPARISON_2026-10-06_0320.xlsx`}>Comparison workbook</a></p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Partners" value={P.length} hint={`${contacted} contacted`} />
        <Stat label="Quotes in" value={quoted.length} hint={quoted.length < 3 ? "get at least 3" : "ready to compare"} />
        <Stat label="Lowest cost on sample" value={best ? money(best.c!.totalCost) : "—"} hint={best ? `${best.p.name} · ${money(best.c!.upFront)} up front` : "awaiting quotes"} />
        <Stat label="Active partner" value={active.length ? active.map((a) => a.name).join(", ") : "None yet"} />
      </div>
      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft"><tr>
            <th className="p-3">Partner</th><th className="p-3">Status</th><th className="p-3">Advance / fee</th><th className="p-3">Cash up front</th>
            <th className="p-3">Total cost</th><th className="p-3">Annual rate</th><th className="p-3">Terms</th>
          </tr></thead>
          <tbody>{costed.map(({ p, c }) => (
            <tr key={p.id} className="border-t border-line align-top">
              <td className="max-w-md p-3">
                <div className="font-semibold">{p.website ? <a href={p.website} target="_blank" rel="noreferrer" className="text-brand hover:underline">{p.name}</a> : p.name}</div>
                {p.fit && <div className="text-xs text-ink-soft">{p.fit}</div>}
                {(p.contact_name || p.contact_email || p.contact_phone) && <div className="mt-1 text-xs">{[p.contact_name, p.contact_email, p.contact_phone].filter(Boolean).join(" · ")}</div>}
                {p.notes && <div className="mt-1 text-xs italic text-ink-soft">{p.notes}</div>}
                <div className="mt-2"><FactoringEditor row={p} /></div>
              </td>
              <td className="p-3"><Badge tone={TONE[p.status]}>{FACTORING_STATUS_LABEL[p.status]}</Badge>{p.contacted_at && <div className="mt-1 text-xs text-ink-soft">contacted {p.contacted_at}</div>}</td>
              <td className="p-3 text-xs">{p.advance_rate != null ? pct(p.advance_rate) : "—"} / {p.fee_pct != null ? `${pct(p.fee_pct, 2)} per ${p.fee_period_days ?? 30}d` : "—"}</td>
              <td className="p-3 text-xs">{c ? money(c.upFront) : "awaiting quote"}{p.days_to_fund != null && <div className="text-ink-soft">in {p.days_to_fund} day{p.days_to_fund === 1 ? "" : "s"}</div>}</td>
              <td className="p-3 text-xs">{c ? <>{money(c.totalCost)}<div className="text-ink-soft">{pct(c.costPct, 2)} of invoice</div></> : "—"}</td>
              <td className="p-3 text-xs">{c ? pct(c.annualRate) : "—"}</td>
              <td className="p-3 text-xs">
                {p.recourse && <div>{p.recourse === "recourse" ? "Recourse" : "Non-recourse"}</div>}
                {p.monthly_minimum != null && <div>Min {money(Number(p.monthly_minimum))}/mo</div>}
                {p.spot_factoring != null && <div>Spot factoring: {p.spot_factoring ? "yes" : "no"}</div>}
                {p.gov_scope && <div>Funds: {p.gov_scope}</div>}
                {p.term && <div>{p.term}</div>}
                {p.other_fees && <div>Fees: {p.other_fees}</div>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <section className="card"><h2 className="mb-3 text-lg font-bold">Add a factoring company</h2><AddFactoringPartner /></section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-2 text-lg font-bold">Ask every partner</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Advance rate and fee per 30 days (or per 10 or 15), and how it drops with volume</li>
            <li>Recourse or non-recourse, and what non-recourse actually covers</li>
            <li>Monthly minimum, contract length, auto-renewal and early-exit fee</li>
            <li>Can we pick which invoices or clients to factor (spot factoring)?</li>
            <li>Every other fee: setup, due diligence, ACH/wire, credit checks, lockbox</li>
            <li>Do they fund federal, State of Michigan and City of Detroit invoices?</li>
            <li>UCC-1 lien on all receivables, or only the factored invoices?</li>
            <li>Same-day funding once the client approves an invoice, to match the weekly payout run</li>
            <li>How they contact our clients (notice letter, collection calls)</li>
          </ul>
        </div>
        <div className="card">
          <h2 className="mb-2 text-lg font-bold">Government rules</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li><b>Federal:</b> the factor is paid only after an Assignment of Claims (FAR 32.8) is filed with the contracting officer and the disbursing office.</li>
            <li><b>State and city:</b> read the contract&apos;s assignment clause. Some require written consent before payments can be assigned.</li>
            <li><b>Subcontracts:</b> the factor underwrites the prime contractor&apos;s credit and payment terms.</li>
            <li><b>Wages:</b> Service Contract Act and Davis-Bacon rules still apply. Factoring changes when we get paid, not what we owe pros.</li>
            <li>Have the agreement reviewed before signing: lien, recourse, minimums and exit fee.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
