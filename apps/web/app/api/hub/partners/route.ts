/*
 * FILE    : apps/web/app/api/hub/partners/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-07_0120 UTC
 * PURPOSE : Hub → Partners controls (staff). POST JSON:
 *             { action: "status", id, status: "active" | "suspended" }
 *             { action: "assign", partner_id, email }   — credit a customer to a partner by hand (12 months from today)
 *             { action: "unassign", email }             — remove a customer's partner (future jobs stop paying)
 *             { action: "void", commission_id, note }   — cancel an unpaid commission
 * UPDATED : 2026-10-11_1500 UTC — voiding a commission is admins only.
 */
import { z } from "zod";
import { partnerExpiry } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("status"), id: z.string().uuid(), status: z.enum(["active", "suspended"]) }),
  z.object({ action: z.literal("assign"), partner_id: z.string().uuid(), email: z.string().trim().email() }),
  z.object({ action: z.literal("unassign"), email: z.string().trim().email() }),
  z.object({ action: z.literal("void"), commission_id: z.string().uuid(), note: z.string().trim().max(300) }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Check the request");
  const d = b.data;
  if (d.action === "void" && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  const db = adminClient();
  let error: { message: string } | null = null;
  if (d.action === "status") ({ error } = await db.from("referral_partners").update({ status: d.status }).eq("id", d.id));
  if (d.action === "assign") ({ error } = await db.from("referral_customers").upsert({ partner_id: d.partner_id, customer_email: d.email.toLowerCase(), source: "staff", note: `assigned by ${v!.email}`, expires_at: partnerExpiry(new Date()).toISOString() }, { onConflict: "customer_email" }));
  if (d.action === "unassign") ({ error } = await db.from("referral_customers").delete().eq("customer_email", d.email.toLowerCase()));
  if (d.action === "void") ({ error } = await db.from("partner_commissions").update({ status: "void", amount: 0, note: `${d.note} (${v!.email})` }).eq("id", d.commission_id).eq("status", "pending"));
  return error ? deny(500, error.message) : Response.json({ ok: true });
}
