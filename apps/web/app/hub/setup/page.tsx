/*
 * FILE    : apps/web/app/hub/setup/page.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_1940 UTC
 * UPDATED : 2026-10-02_1346 UTC — business & legal checklist (insurance, legal review, HIPAA, licensing).
 * PURPOSE : Go-live checklist — every integration, migration and account the business needs,
 *           green/amber/red, with the exact fix next to anything not ready.
 * UPDATED : 2026-10-11_1500 UTC — admins only (components/AdminOnly); hidden from dispatchers in the Hub menu.
 */
import { readiness } from "@/lib/readiness";
import { Badge } from "@/components/ui";
import { SyncCatalogButton } from "@/components/HubActions";
import { LaunchChecklist } from "@/components/LaunchChecklist";
import { adminClient } from "@/lib/supabase/server";
import { adminOnly } from "@/components/AdminOnly";

export default async function Setup() {
  const gate = await adminOnly(); if (gate) return gate;
  const checks = await readiness();
  const ticks = process.env.SUPABASE_SERVICE_ROLE_KEY ? ((await adminClient().from("launch_checklist").select("*")).data ?? []) : [];
  const groups = [...new Set(checks.map((c) => c.group))];
  const fails = checks.filter((c) => c.status === "fail").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Go-live setup</h1><p className="text-sm text-ink-soft">Everything the business needs, checked live. Fix red first, then amber.</p></div>
        <Badge tone={fails ? "red" : warns ? "amber" : "green"}>{fails ? `${fails} blocking` : warns ? `${warns} to finish` : "Ready to launch"}</Badge>
      </div>
      {groups.map((g) => (
        <div key={g} className="card">
          <div className="font-semibold">{g}</div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {checks.filter((c) => c.group === g).map((c) => (
              <li key={c.label} className="py-2">
                <div className="flex flex-wrap items-center justify-between gap-2"><span>{c.status === "ok" ? "✅" : c.status === "warn" ? "⚠️" : "❌"} {c.label}</span><span className="text-ink-soft">{c.detail}</span></div>
                {c.fix && <div className="mt-1 text-xs text-brand-dark">→ {c.fix}</div>}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <SyncCatalogButton />
      <LaunchChecklist ticks={ticks} />
    </div>
  );
}
