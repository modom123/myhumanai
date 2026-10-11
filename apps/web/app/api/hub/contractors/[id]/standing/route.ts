/*
 * FILE    : apps/web/app/api/hub/contractors/[id]/standing/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_0123 UTC
 * PURPOSE : Staff standing decisions on a pro, always with a written reason sent to the pro:
 *           POST { action: warn | suspend | deactivate | reinstate | uphold_appeal, reason }.
 *           Suspend is for safety threats or suspected fraud only (immediate); deactivation follows
 *           a written warning except for the immediate-removal reasons in the policy.
 * UPDATED : 2026-10-11_1500 UTC — admins only (warn, suspend, deactivate, reinstate).
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { setStanding } from "@/lib/standing";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const b = z.object({ action: z.enum(["warn", "suspend", "deactivate", "reinstate", "uphold_appeal"]), reason: z.string().trim().min(10).max(2000) }).safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Pick an action and write the reason (the pro receives it)");
  const r = await setStanding((await ctx.params).id, b.data.action, b.data.reason, v!.email);
  return r.ok ? Response.json(r) : deny(409, r.error);
}
