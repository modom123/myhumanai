/*
 * FILE    : apps/web/app/hub/accounting/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-06_2220 UTC
 * PURPOSE : Handled Hub → Accounting (Xero). Xero is the books of record; this page connects it, maps each kind of
 *           money to a Xero account, previews a day's entries, pushes on demand, and shows every document sent
 *           (with links into Xero) and anything that failed. The daily cron does the pushing on its own.
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { adminClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/auth";
import { getStripe } from "@/lib/stripe";
import { ACCOUNT_KEYS, DEFAULT_ACCOUNTS, XERO_SCOPES, accountCode, getConnection, xeroConfigured, xeroLink, xeroRedirectUri } from "@/lib/xero";
import { Badge, Empty, Stat } from "@/components/ui";
import { AccountingControls, AccountMapping, DayPreview } from "@/components/AccountingUI";
import { adminOnly } from "@/components/AdminOnly";

export const dynamic = "force-dynamic";

const DOCS = "https://github.com/modom123/HandledServices/blob/main/docs";
const LABEL: Record<string, string> = {
  stripe_day: "Stripe day", stripe_receive: "Money in", stripe_spend: "Money out", pro_payout: "Pro payout", bank_payout: "Payout to bank",
  invoice: "Sales invoice", invoice_payment: "Invoice payment", invoice_void: "Invoice voided",
};
const TONE = { done: "green", error: "red", pending: "amber", skipped: "slate" } as const;
const MSG: Record<string, string> = {
  admin_only: "Only admins can connect Xero.",
  not_configured: "Add XERO_CLIENT_ID and XERO_CLIENT_SECRET in Vercel first (see the setup steps below).",
};

type Log = { id: string; kind: string; ref: string; day: string | null; status: keyof typeof TONE; xero_id: string | null; amount: number | null; error: string | null; attempts: number; updated_at: string; detail: Record<string, unknown> | null };

export default async function Accounting({ searchParams }: { searchParams: Promise<{ xero?: string; org?: string; msg?: string; others?: string }> }) {
  const gate = await adminOnly(); if (gate) return gate;
  const q = await searchParams;
  const v = await getViewer();
  const admin = v?.role === "admin";
  const conn = await getConnection();
  if (!conn) return (
    <div className="card max-w-2xl"><h1 className="text-xl font-bold">Accounting isn&apos;t switched on yet</h1>
      <p className="mt-2 text-sm text-ink-soft">Run <code>supabase/setup/ADD_XERO_ACCOUNTING_2026-10-06_2155.sql</code> once in Supabase → SQL Editor, then reload this page.</p></div>
  );
  const { data: logs } = await adminClient().from("xero_sync_log").select("*").order("updated_at", { ascending: false }).limit(80);
  const L = (logs ?? []) as Log[];
  const errors = L.filter((l) => l.status === "error");
  const lastDay = L.find((l) => l.kind === "stripe_day" && (l.status === "done" || l.status === "skipped"));
  const connected = Boolean(conn.tenant_id);
  const mapping = ACCOUNT_KEYS.map((k) => ({ ...DEFAULT_ACCOUNTS[k], key: k, code: accountCode(conn.settings, k) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounting <span className="text-base font-normal text-ink-soft">Xero + Stripe</span></h1>
        <p className="max-w-3xl text-sm text-ink-soft">Xero is the books. Stripe is set up in Xero as its own bank account, and every finished day of Stripe activity is booked there automatically: sales, tips, gift cards, sales tax, fees, refunds, chargebacks, each pro&apos;s payout (as a spend to that pro), and each Stripe payout as a transfer into checking, so it matches your bank feed. Business invoices on terms become Xero sales invoices, so receivables, aging and factoring all run from Xero. Payroll for W-2 staff goes in Gusto, which connects to Xero.</p>
        <p className="mt-2 text-sm"><a className="underline" href={`${DOCS}/XERO_STRIPE_ACCOUNTING_GUIDE_2026-10-06_2230.md`}>Setup guide</a> · <a className="underline" href="https://go.xero.com" target="_blank" rel="noreferrer">Open Xero</a></p>
      </div>

      {q.xero === "connected" && <div className="card border-emerald-300 bg-emerald-50 text-sm">Connected to <b>{q.org}</b>.{q.others ? ` You authorised ${q.others} other organisation(s); only this one is used.` : ""} Next: check the account mapping below, then click “Create missing accounts”.</div>}
      {q.xero && q.xero !== "connected" && <div className="card border-rose-300 bg-rose-50 text-sm">{MSG[q.xero] ?? `Xero: ${q.msg ?? q.xero}`}</div>}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Xero" value={connected ? conn.tenant_name ?? "Connected" : "Not connected"} hint={connected ? `by ${conn.connected_by ?? "—"} · ${conn.connected_at?.slice(0, 10) ?? ""}` : xeroConfigured() ? "ready to connect" : "keys missing"} />
        <Stat label="Stripe" value={getStripe() ? "Connected" : "Not configured"} hint="source of every number" />
        <Stat label="Booked through" value={lastDay?.day ?? "—"} hint={conn.settings.sync_from ? `sync starts ${conn.settings.sync_from}` : "no start date yet"} />
        <Stat label="Needs attention" value={errors.length} hint={errors.length ? "see the log — retried daily" : "all clear"} />
      </div>

      <section className="card space-y-3 text-sm">
        <h2 className="font-bold">Connection</h2>
        {!xeroConfigured() ? (
          <ol className="list-decimal space-y-1 pl-5 text-ink-soft">
            <li>Go to <a className="underline" href="https://developer.xero.com/app/manage" target="_blank" rel="noreferrer">developer.xero.com → My Apps</a> → New app → “Web app”.</li>
            <li>Redirect URI: <code>{xeroRedirectUri()}</code></li>
            <li>Copy the client id and secret into Vercel as <code>XERO_CLIENT_ID</code> and <code>XERO_CLIENT_SECRET</code>, redeploy, and come back here.</li>
          </ol>
        ) : (
          <AccountingControls admin={admin} connected={connected} syncFrom={conn.settings.sync_from ?? ""} reconciled={Boolean(conn.settings.reconciled)} />
        )}
        <p className="text-xs text-ink-soft">Permissions asked: <code>{XERO_SCOPES}</code></p>
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="font-bold">Account mapping</h2>
        <p className="text-ink-soft">Which Xero account each kind of money goes to. The defaults are a ready-made chart; change a code to use an account you already have. Only your checking account must already exist in Xero.</p>
        <AccountMapping admin={admin} connected={connected} rows={mapping} />
      </section>

      <section className="card space-y-3 text-sm">
        <h2 className="font-bold">Preview or push a day</h2>
        <p className="text-ink-soft">Preview shows the exact entries for a finished day (Detroit time) without writing anything. Push books it now; the daily run does this on its own every morning.</p>
        <DayPreview admin={admin} connected={connected} />
      </section>

      <section>
        <h2 className="mb-2 font-bold">Sync log</h2>
        {!L.length ? <Empty>Nothing sent to Xero yet.</Empty> : (
          <div className="card overflow-x-auto p-0"><table className="w-full text-sm">
            <thead className="bg-paper text-left text-xs uppercase tracking-wide text-ink-soft"><tr><th className="p-3">When</th><th className="p-3">Document</th><th className="p-3">Day / ref</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Detail</th></tr></thead>
            <tbody>{L.map((l) => {
              const link = l.status === "done" ? xeroLink(l.kind, l.xero_id) : null;
              return (
                <tr key={l.id} className="border-t border-line align-top">
                  <td className="whitespace-nowrap p-3 text-ink-soft">{l.updated_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="p-3">{link ? <a className="text-brand underline" href={link} target="_blank" rel="noreferrer">{LABEL[l.kind] ?? l.kind}</a> : LABEL[l.kind] ?? l.kind}</td>
                  <td className="p-3">{l.day ?? ""}{l.detail && typeof l.detail.number === "string" ? ` · ${l.detail.number}` : ""}{l.detail && typeof l.detail.pro === "string" ? ` · ${l.detail.pro}` : ""}</td>
                  <td className="p-3">{l.amount == null ? "—" : `$${Number(l.amount).toFixed(2)}`}</td>
                  <td className="p-3"><Badge tone={TONE[l.status]}>{l.status}{l.attempts > 1 ? ` ×${l.attempts}` : ""}</Badge></td>
                  <td className="max-w-md p-3 text-xs text-ink-soft">{l.error ?? (l.kind === "stripe_day" && l.detail ? `${l.detail.count ?? 0} Stripe items · net $${Number(l.detail.stripe_net ?? 0).toFixed(2)}` : "")}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
