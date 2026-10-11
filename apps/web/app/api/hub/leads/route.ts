/*
 * FILE    : apps/web/app/api/hub/leads/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_0210 UTC
 * PURPOSE : Hub → Pro leads actions (staff): save settings, import a CSV, run the engine now,
 *           or update a lead after a call (called / not interested / do not contact / replied / email it).
 * UPDATED : 2026-10-11_1500 UTC — engine settings, CSV import and running outreach are admins only; dispatchers can log call outcomes.
 */
import { z } from "zod";
import { TRADE_SEARCH } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { importLeadsCsv, leadEngine, setLeadStatus } from "@/lib/leads";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), enabled: z.boolean(), discover_per_day: z.number().int().min(0).max(100), emails_per_day: z.number().int().min(0).max(500), min_rating: z.number().min(0).max(5), min_reviews: z.number().int().min(0).max(1000), trades: z.array(z.string()).max(40) }),
  z.object({ action: z.literal("import"), csv: z.string().min(10).max(2_000_000), trade: z.string().nullable() }),
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("status"), id: z.string().uuid(), status: z.enum(["call", "not_interested", "do_not_contact", "replied", "queued"]), note: z.string().max(1000).nullable().default(null) }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, b.error.issues[0]?.message ?? "Bad request");
  const d = b.data;
  if (d.action !== "status" && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  if (d.action === "settings") {
    const { action: _a, ...s } = d;
    const { error } = await adminClient().from("lead_engine_settings").upsert({ id: 1, ...s, trades: s.trades.filter((t) => TRADE_SEARCH[t]), updated_at: new Date().toISOString(), updated_by: v!.email });
    return error ? deny(500, error.message) : Response.json({ ok: true });
  }
  if (d.action === "import") return Response.json(await importLeadsCsv(d.csv, d.trade, v!.email));
  if (d.action === "run") return Response.json(await leadEngine());
  await setLeadStatus(d.id, d.status, d.note, v!.email);
  return Response.json({ ok: true });
}
