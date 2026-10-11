/*
 * FILE    : apps/web/app/api/hub/factoring/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-06_0324 UTC
 * PURPOSE : Staff controls for Hub → Factoring. POST JSON:
 *             { action: "update", id, status, advance_rate?, fee_pct?, …, notes? }  — outreach status and the quote
 *             { action: "add", name, website?, fit? }                               — another factoring company
 *           Rates are fractions (0.85 = 85%, 0.015 = 1.5%).
 * UPDATED : 2026-10-11_1500 UTC — admins only.
 */
import { z } from "zod";
import { FACTORING_STATUS_LABEL } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";

const txt = (n: number) => z.string().trim().max(n).nullable().optional();
const num = (min: number, max: number) => z.number().min(min).max(max).nullable().optional();

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"), id: z.string().uuid(),
    status: z.string().refine((s) => s in FACTORING_STATUS_LABEL),
    gov_scope: txt(120), advance_rate: num(0.01, 1), fee_pct: num(0, 0.5), fee_period_days: z.number().int().min(1).max(90).nullable().optional(),
    days_to_fund: z.number().int().min(0).max(60).nullable().optional(), recourse: z.enum(["recourse", "non_recourse"]).nullable().optional(),
    monthly_minimum: num(0, 100000000), term: txt(200), spot_factoring: z.boolean().nullable().optional(), other_fees: txt(300),
    contact_name: txt(120), contact_email: z.string().trim().email().nullable().optional().or(z.literal("")), contact_phone: txt(30),
    contacted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")), notes: txt(2000),
  }),
  z.object({ action: z.literal("add"), name: z.string().trim().min(2).max(120), website: txt(300), fit: txt(500) }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Check the request");
  const d = b.data;
  const db = adminClient();
  if (d.action === "add") {
    const slug = `${d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`;
    const { error } = await db.from("factoring_partners").insert({ slug, name: d.name, website: d.website || null, fit: d.fit || null, updated_by: v!.email });
    return error ? deny(500, error.message) : Response.json({ ok: true });
  }
  const { action: _a, id, ...row } = d;
  const { error } = await db.from("factoring_partners").update({
    ...row, contact_email: row.contact_email || null, contacted_at: row.contacted_at || null,
    updated_by: v!.email, updated_at: new Date().toISOString(),
  }).eq("id", id);
  return error ? deny(500, error.message) : Response.json({ ok: true });
}
