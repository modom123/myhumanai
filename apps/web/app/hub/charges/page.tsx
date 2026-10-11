/*
 * FILE    : apps/web/app/hub/charges/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_2053 UTC
 * PURPOSE : Quick Charge — get paid for anything with a Stripe payment link (no products to
 *           set up in Stripe), and see every link and whether it's been paid.
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { money } from "@handled/core";
import { getViewer } from "@/lib/auth";
import { Badge, Empty } from "@/components/ui";
import { QuickChargeForm } from "@/components/HubActions";
import { adminOnly } from "@/components/AdminOnly";

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export default async function Charges({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
  const gate = await adminOnly(); if (gate) return gate;
  const v = await getViewer();
  if (!v) return null;
  const { job } = await searchParams;
  const { data } = await v.db.from("payments").select("id, kind, amount, status, description, customer_name, customer_email, link_url, created_by, created_at, paid_at, jobs(ref)").not("link_url", "is", null).order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as Rec[];
  const open = rows.filter((r) => r.status === "pending").reduce((t, r) => t + Number(r.amount), 0);
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Quick Charge</h1><p className="text-sm text-ink-soft">Get paid for anything — a custom quote, a change order, a deposit or an extra. Stripe builds the checkout for the exact amount; nothing to set up per service.</p></div>
      <QuickChargeForm initialJobRef={job ?? ""} />
      <div>
        <h2 className="mb-2 font-bold">Payment links <span className="text-sm font-normal text-ink-soft">· {money(open)} waiting to be paid</span></h2>
        {!rows.length && <Empty>No payment links yet.</Empty>}
        <div className="card overflow-x-auto p-0"><table className="w-full text-sm"><tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line first:border-0">
              <td className="p-3 text-xs text-ink-soft">{new Date(r.created_at).toLocaleString()}</td>
              <td className="p-3"><div className="font-medium">{r.description}</div><div className="text-xs text-ink-soft">{r.customer_name ?? ""} {r.customer_email} {r.jobs?.ref ? `· ${r.jobs.ref}` : ""} · by {r.created_by ?? "system"}</div></td>
              <td className="p-3">{r.kind.replace("_", " ")}</td>
              <td className="p-3 font-semibold">{money(Number(r.amount))}</td>
              <td className="p-3"><Badge tone={r.status === "paid" ? "green" : r.status === "pending" ? "amber" : "red"}>{r.status}</Badge></td>
              <td className="p-3">{r.status === "pending" && r.link_url ? <a className="text-xs text-brand underline" href={r.link_url} target="_blank">link ↗</a> : r.paid_at ? <span className="text-xs text-ink-soft">{new Date(r.paid_at).toLocaleDateString()}</span> : null}</td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    </div>
  );
}
