/*
 * FILE    : apps/web/app/api/hub/expenses/[id]/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_2124 UTC
 * PURPOSE : Staff: approve or reject a materials receipt, open the receipt, or record that the
 *           customer paid the materials by hand.
 * UPDATED : 2026-10-11_1500 UTC — approving / rejecting a receipt is admins only; anyone on staff can still open it.
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { signedDocUrl } from "@/lib/photos";
import { approveExpense, reimburse, rejectExpense } from "@/lib/pro-benefits";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const { id } = await ctx.params;
  const { data: e } = await adminClient().from("job_expenses").select("receipt_path").eq("id", id).single();
  const url = e?.receipt_path ? await signedDocUrl(e.receipt_path) : null;
  return url ? Response.redirect(url, 302) : deny(404, "No receipt");
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const b = z.object({ decision: z.enum(["approve", "reject", "paid_by_hand"]), reason: z.string().max(300).optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "decision required");
  const { id } = await ctx.params;
  const who = v!.fullName ?? v!.email;
  if (b.data.decision === "approve") return Response.json({ ok: true, ...(await approveExpense(id, who)) });
  if (b.data.decision === "reject") { await rejectExpense(id, who, b.data.reason ?? "Not covered"); return Response.json({ ok: true }); }
  const { data: e } = await adminClient().from("job_expenses").select("status").eq("id", id).single();
  if (!e || !["approved", "billed"].includes(e.status)) return deny(409, "Approve it first");
  await reimburse(id, null);
  return Response.json({ ok: true });
}
