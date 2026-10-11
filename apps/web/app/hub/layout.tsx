/*
 * FILE    : apps/web/app/hub/layout.tsx
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * UPDATED : 2026-10-02_0255 UTC — Live roster in the nav.
 * UPDATED : 2026-10-02_1329 UTC — Growth page in the nav.
 * UPDATED : 2026-10-02_2250 UTC — Supply gaps in the nav.
 * UPDATED : 2026-10-03_0043 UTC — Contract library in the nav.
 * UPDATED : 2026-10-03_0152 UTC — Market pricing in the nav.
 * UPDATED : 2026-10-03_0210 UTC — Pro leads in the nav.
 * UPDATED : 2026-10-03_1255 UTC — Pricing accuracy in the nav.
 * UPDATED : 2026-10-03_1513 UTC — City scorecard in the nav.
 * UPDATED : 2026-10-04_1934 UTC — Business leads (sales engine) in the nav.
 * UPDATED : 2026-10-05_0148 UTC — Email Center in the nav.
 * UPDATED : 2026-10-05_0221 UTC — Checklists (library) in the nav.
 * UPDATED : 2026-10-05_0418 UTC — Pro Rewards in the nav.
 * UPDATED : 2026-10-05_0434 UTC — Team (who has Hub access) in the nav; clearer "staff only" message.
 * PURPOSE : Handled Hub shell — staff only (role dispatcher or admin).
 * UPDATED : 2026-10-05_1441 UTC — 🏛️ Gov contracts (SAM.gov).
 * UPDATED : 2026-10-05_1954 UTC — 📝 Bids (bid engine).
 * UPDATED : 2026-10-05_2034 UTC — 🤝 Talent (Handled Talent recruiting agency).
 * UPDATED : 2026-10-06_0324 UTC — 🏦 Factoring (invoice factoring partners for net-30+ clients).
 * UPDATED : 2026-10-06_0752 UTC — 🤖 AI agents (mission, daily growth plan, agent health, assign tasks).
 * UPDATED : 2026-10-06_2120 UTC — 🛟 Cancellations & coverage.
 * UPDATED : 2026-10-06_2230 UTC — 📒 Accounting (Xero + Stripe).
 * UPDATED : 2026-10-07_0145 UTC — 💸 Referral partners.
 * UPDATED : 2026-10-07_0200 UTC — menu grouped into dropdown sections (components/HubNav), phones get a ☰ Menu.
 * UPDATED : 2026-10-07_0320 UTC — 🎨 Website & promotions (website look, grand opening promotion).
 * UPDATED : 2026-10-07_0530 UTC — 🏅 Handled Points (customer and business loyalty).
 * UPDATED : 2026-10-07_0600 UTC — "Staff only" page shows the signed-in email, its role and exactly how to become admin.
 * UPDATED : 2026-10-07_1945 UTC — official logo (light version on the dark sidebar).
 * UPDATED : 2026-10-11_1500 UTC — dispatchers don't see the admin-only pages (Money, Market pricing, Website look, Go-live setup);
 *           those pages show "Admins only" (components/AdminOnly) and their APIs refuse dispatchers.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND } from "@handled/core";
import { getViewer, isAdmin, isStaff } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/env";
import { NotConfigured } from "@/components/ui";
import { HubNav, type HubGroup } from "@/components/HubNav";

export const metadata = { title: "Handled Hub" };

const NAV: HubGroup[] = [
  { id: "ops", label: "Operations", links: [
    ["/hub", "📊", "Dashboard"],
    ["/hub/jobs", "🗂️", "Jobs board"],
    ["/hub/roster", "📍", "Live roster"],
    ["/hub/coverage", "🛟", "Cancellations & coverage"],
    ["/hub/checklists", "✅", "Checklists"],
    ["/hub/gaps", "🕳️", "Supply gaps"],
  ] },
  { id: "pros", label: "Pros", links: [
    ["/hub/network", "💎", "Pro Network"],
    ["/hub/pros", "🧰", "Hiring & pros"],
    ["/hub/recruiting", "🧲", "Recruiting"],
    ["/hub/leads", "🎯", "Pro leads"],
    ["/hub/pro-program", "🏅", "Pro Program"],
    ["/hub/rewards", "🎁", "Pro Rewards"],
  ] },
  { id: "sales", label: "Customers & sales", links: [
    ["/hub/customers", "👥", "Customers & B2B"],
    ["/hub/biz-leads", "🤝", "Business leads"],
    ["/hub/partners", "💸", "Referral partners"],
    ["/hub/loyalty", "🏅", "Handled Points"],
    ["/hub/gov", "🏛️", "Gov contracts"],
    ["/hub/bids", "📝", "Bids"],
    ["/hub/talent", "🤝", "Talent (recruiting)"],
    ["/hub/email", "✉️", "Email Center"],
  ] },
  { id: "money", label: "Money", links: [
    ["/hub/finance", "💵", "Finance"],
    ["/hub/accounting", "📒", "Accounting (Xero)"],
    ["/hub/charges", "💳", "Quick Charge"],
    ["/hub/factoring", "🏦", "Factoring"],
  ] },
  { id: "growth", label: "Growth & pricing", links: [
    ["/hub/growth", "📈", "Growth"],
    ["/hub/site", "🎨", "Website look"],
    ["/hub/cities", "🏙️", "City scorecard"],
    ["/hub/market", "⚖️", "Market pricing"],
    ["/hub/pricing-accuracy", "📐", "Pricing accuracy"],
  ] },
  { id: "ai", label: "AI & IEBC", links: [
    ["/hub/agents", "🤖", "AI agents"],
    ["/hub/assistant", "✨", "AI assistant"],
    ["/hub/workforce", "🏢", "IEBC Workforce"],
  ] },
  { id: "settings", label: "Settings", links: [
    ["/hub/team", "👥", "Team"],
    ["/hub/contracts", "📜", "Contract library"],
    ["/hub/setup", "🚀", "Go-live setup"],
  ] },
];

/** Pages only admins can open — hidden from dispatchers' menu (each page and its API check again). */
const ADMIN_PAGES = new Set(["/hub/finance", "/hub/accounting", "/hub/charges", "/hub/factoring", "/hub/market", "/hub/site", "/hub/setup"]);
const navFor = (admin: boolean): HubGroup[] =>
  admin ? NAV : NAV.map((g) => ({ ...g, links: g.links.filter(([href]) => !ADMIN_PAGES.has(href)) })).filter((g) => g.links.length);

export const dynamic = "force-dynamic";

export default async function HubLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) return <NotConfigured />;
  const v = await getViewer();
  if (!v) redirect("/login?next=/hub");
  if (!isStaff(v))
    return (
      <div className="wrap py-20"><div className="card max-w-lg space-y-3 text-sm">
        <h1 className="text-xl font-bold">Staff only</h1>
        <p className="text-ink-soft">You’re signed in as <b className="text-ink">{v.email}</b>, which isn’t on the ops team yet (role: {v.role}).</p>
        <div><b>Owner?</b> In Vercel → Settings → Environment Variables set <code className="rounded bg-paper px-1">OWNER_EMAILS</code> to this email (comma-separate more), redeploy, then reload this page. Or in Supabase → SQL Editor run:
          <pre className="mt-1 overflow-x-auto rounded bg-paper p-2 text-xs">{`update public.profiles set role = 'admin'\nwhere lower(email) = lower('${v.email}');`}</pre></div>
        <p className="text-ink-soft"><b className="text-ink">Staff?</b> Ask an admin to add your email in Hub → Team.</p>
        <p className="text-ink-soft"><form action="/auth/signout" method="post" className="inline">Signed in with the wrong email? <button className="underline">Sign out</button></form> · <a className="underline" href="/account">My account</a> · <a className="underline" href="/pro">Pro portal</a></p>
      </div></div>
    );
  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="bg-brand-deep p-4 text-white md:min-h-screen">
        <Link href="/home" className="flex items-center gap-2 px-2">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/brand/handled-lockup-light.png" alt={BRAND.name} width={891} height={240} className="h-8 w-auto" /> <span className="text-xs font-normal text-white/50">Hub</span></Link>
        <HubNav groups={navFor(isAdmin(v))} />
        <div className="mt-8 hidden px-2 text-xs text-white/40 md:block">{v.fullName ?? v.email}<br />{v.role}<form action="/auth/signout" method="post"><button className="mt-2 underline">Sign out</button></form></div>
      </aside>
      <main className="min-w-0 bg-paper p-4 md:p-8">{children}</main>
    </div>
  );
}
