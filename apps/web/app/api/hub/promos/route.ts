/*
 * FILE    : apps/web/app/api/hub/promos/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-02_1329 UTC
 * PURPOSE : Staff: create a promo code, or turn one on/off.
 * UPDATED : 2026-10-11_1500 UTC — admins only (discounts).
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";

const Create = z.object({
  code: z.string().regex(/^[A-Za-z0-9-]{3,40}$/).transform((s) => s.toUpperCase()),
  kind: z.enum(["percent", "amount"]), value: z.coerce.number().positive().max(10000),
  max_uses: z.coerce.number().int().positive().optional(), expires_at: z.string().optional(),
  first_job_only: z.boolean().default(false), min_order: z.coerce.number().min(0).default(0), note: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny(403, "Staff only");
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const body = await req.json().catch(() => null);
  if (body?.toggle) {
    const { error } = await adminClient().from("promo_codes").update({ active: Boolean(body.active) }).eq("code", String(body.toggle).toUpperCase());
    return error ? deny(400, error.message) : Response.json({ ok: true });
  }
  const b = Create.safeParse(body);
  if (!b.success) return deny(400, "Check the code (3–40 letters/numbers/dashes) and amount");
  if (b.data.kind === "percent" && b.data.value > 50) return deny(400, "Percent codes are capped at 50% (and we always keep 5% after paying the pro)");
  const { error } = await adminClient().from("promo_codes").insert({ ...b.data, expires_at: b.data.expires_at || null, source: "staff", created_by: v!.fullName ?? v!.email });
  return error ? deny(409, error.message.includes("duplicate") ? "That code already exists" : error.message) : Response.json({ ok: true });
}
