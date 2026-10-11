/*
 * FILE    : apps/web/app/hub/site/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-07_0320 UTC
 * PURPOSE : Handled Hub → Website: the default website look (one link per look for market-by-market campaigns).
 * UPDATED : 2026-10-07_0345 UTC — grand opening promotion removed (owner decision).
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { getViewer } from "@/lib/auth";
import { siteUrl } from "@/lib/notify";
import { THEMES, defaultTheme } from "@/lib/theme";
import { adminClient } from "@/lib/supabase/server";
import { ThemePicker } from "@/components/SiteSettingsUI";
import { CopyButton } from "@/components/PartnerUI";
import { adminOnly } from "@/components/AdminOnly";

export const dynamic = "force-dynamic";


export default async function SiteSettings() {
  const gate = await adminOnly(); if (gate) return gate;
  const v = await getViewer();
  const admin = v?.role === "admin";
  const { error } = await adminClient().from("site_settings").select("key").limit(1);
  const theme = await defaultTheme();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Website</h1>
      {error && <div className="card border-rose-300 bg-rose-50 text-sm">Run <code>supabase/setup/ADD_SITE_SETTINGS_GRAND_OPENING_2026-10-07_0230.sql</code> once in Supabase → SQL Editor to save these settings (it also fixes bookings that use promo codes).</div>}

      <section className="card space-y-3">
        <h2 className="font-bold">Website look</h2>
        <p className="text-sm text-ink-soft">The default look every visitor sees. To try a different look in one market, use that look&apos;s link in that market&apos;s ads, flyers, QR codes and emails. Visitors who arrive through it keep that look for 90 days.</p>
        <ThemePicker admin={admin} current={theme} themes={Object.entries(THEMES).map(([id, t]) => ({ id, ...t }))} />
        <div className="space-y-1 text-sm">{Object.keys(THEMES).map((id) => { const link = `${siteUrl()}/home?theme=${id}`; return (
          <div key={id} className="flex flex-wrap items-center gap-2"><span className="w-40 font-medium">{THEMES[id as keyof typeof THEMES].name}</span><span className="select-all font-mono text-xs">{link}</span><CopyButton text={link} label="Copy" /></div>
        ); })}
          <p className="text-xs text-ink-soft">Add <code>?theme=default</code> to any page to go back to the default look.</p>
        </div>
      </section>

    </div>
  );
}
