/*
 * FILE    : apps/web/app/api/hub/contractors/[id]/route.ts
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * PURPOSE : Staff: update a pro — activate after insurance/background check, suspend, edit capacity/ZIPs.
 * UPDATED : 2026-10-11_1500 UTC — changing a pro's status or offboarding is admins only; dispatchers can still edit capacity, ZIPs, notes and compliance dates.
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { onboardingChecklist } from "@handled/core";

const Patch = z.object({
  status: z.enum(["applied", "vetting", "approved", "suspended"]).optional(),
  insured_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  background_checked: z.boolean().optional(),
  daily_capacity: z.number().int().min(0).max(50).optional(),
  service_zips: z.array(z.string()).optional(),
  notes: z.string().max(4000).optional(),
  offboard_reason: z.string().max(500).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return deny(400, "Invalid update");
  if ((parsed.data.status !== undefined || parsed.data.offboard_reason) && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  const { id } = await ctx.params;
  const db = adminClient();
  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.background_checked) update.background_checked_at = new Date().toISOString();
  if (parsed.data.status === "approved") {
    const { data: c } = await db.from("contractors").select("*").eq("id", id).single();
    const { steps, complete } = onboardingChecklist({ ...c, ...update });
    if (!complete) return deny(400, `Finish onboarding first: ${steps.filter((x) => !x.done).map((x) => x.label).join(", ")}`);
    if (!c.onboarded_at) update.onboarded_at = new Date().toISOString();
  }
  if (parsed.data.offboard_reason) { update.status = "suspended"; update.offboarded_at = new Date().toISOString(); }
  const { error } = await db.from("contractors").update(update).eq("id", id);
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ ok: true });
}
