/*
 * FILE    : apps/web/app/api/hub/payouts/[id]/route.ts
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * PURPOSE : Staff: mark a payout paid or hold it.
 * UPDATED : 2026-10-11_1500 UTC — admins only (dispatchers can't mark payouts paid, held or approved).
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const body = z.object({ status: z.enum(["paid", "held", "approved"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return deny(400, "status required");
  const { id } = await ctx.params;
  await adminClient().from("payouts").update({ status: body.data.status, paid_at: body.data.status === "paid" ? new Date().toISOString() : null }).eq("id", id);
  return Response.json({ ok: true });
}
