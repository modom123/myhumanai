/*
 * FILE    : apps/web/app/hub/team/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-05_0434 UTC
 * PURPOSE : Hub → Team: who has Hub access (admins and dispatchers), add someone by email (they get a one-click sign-in
 *           link), or remove access. Admins only can change it. How everyone else is recognized is explained here too.
 * UPDATED : 2026-10-11_1500 UTC — "What each role can do": the admin-only list (money, settings, marketing email, pro approvals).
 */
import { getViewer } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { TeamAdd, TeamRemove } from "@/components/Team";

export const dynamic = "force-dynamic";

export default async function Team() {
  const v = await getViewer();
  const { data } = await adminClient().from("profiles").select("id, email, full_name, role, created_at").in("role", ["admin", "dispatcher"]).order("role").order("email");
  const team = (data ?? []) as { id: string; email: string; full_name: string | null; role: string; created_at: string }[];
  const admin = v?.role === "admin";
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team</h1>
        <p className="text-sm text-ink-soft">People with Hub access. <b>Admins</b> can change settings, the team and money decisions; <b>dispatchers</b> run day-to-day operations. Nobody can give themselves access — only an admin, here.</p>
      </div>
      <div className="card divide-y divide-line p-0">
        {team.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div><div className="font-semibold">{m.full_name ?? m.email}</div><div className="text-xs text-ink-soft">{m.email} · {m.role}{m.id === v?.userId ? " · you" : ""}</div></div>
            {admin && m.id !== v?.userId && <TeamRemove email={m.email} />}
          </div>
        ))}
        {!team.length && <p className="p-3 text-sm text-ink-soft">No team members yet.</p>}
      </div>
      {admin ? <div className="card"><h2 className="mb-2 font-bold">Add someone</h2><TeamAdd /></div> : <p className="text-sm text-ink-soft">Only an admin can add or remove team members.</p>}
      <div className="card text-sm">
        <h2 className="mb-1 font-bold">What each role can do</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><div className="font-semibold">Dispatcher</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
              <li>Jobs board, live roster, dispatch, cancellations and coverage, checklists</li>
              <li>Free redos and complimentary services for customers</li>
              <li>Pros: edit areas and capacity, check documents, mark applicants "reviewing", record no-shows</li>
              <li>Customers, bids, gov contracts, talent; log lead call outcomes</li>
              <li>Email Center inbox: reply, one-off emails, opt-outs</li>
            </ul></div>
          <div><div className="font-semibold">Admin — everything, plus</div>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
              <li><b>Money</b>: Finance, payouts, Quick Charge, refunds, expenses, deductions, factoring, Accounting (Xero), partner commissions</li>
              <li><b>Settings</b>: Go-live setup, market pricing, cities and services, promo codes, Website look, Team</li>
              <li><b>Marketing email</b>: Email Center campaigns and settings, pro and business lead outreach</li>
              <li><b>Pros</b>: invite or decline applicants, activate, warn, suspend, deactivate or reinstate</li>
              <li>Approving AI-agent actions that move money, approve pros or contact customers</li>
            </ul></div>
        </div>
      </div>
      <div className="card text-sm">
        <h2 className="mb-1 font-bold">How the system knows who's who</h2>
        <ul className="list-disc space-y-1 pl-5 text-ink-soft">
          <li>Everyone signs in with their email (no passwords). At Sign in they say who they are: booking services, a business account, a pro, or the Handled team. That only chooses where they land — it never grants access.</li>
          <li><b>Customers</b>: anyone. Bookings made earlier with the same email attach to their account automatically.</li>
          <li><b>Business accounts</b>: anyone added as a member of a business account (Hub → Customers & B2B, or the account's own admin).</li>
          <li><b>Pros</b>: only approved applicants — their pro record is created when you invite them and links the first time they sign in with the application email (a step on the onboarding checklist).</li>
          <li><b>Team</b>: only the people on this page.</li>
        </ul>
      </div>
    </div>
  );
}
