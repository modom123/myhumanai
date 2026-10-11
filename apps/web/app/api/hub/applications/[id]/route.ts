/*
 * FILE    : apps/web/app/api/hub/applications/[id]/route.ts
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * UPDATED : 2026-10-02_0006 UTC — uses lib/recruiting (one-click invite email, pipeline log).
 * PURPOSE : Staff: invite, decline or hold a subcontractor application. Inviting creates the pro
 *           record (status vetting until setup, documents and background check are done).
 * UPDATED : 2026-10-11_1500 UTC — inviting (approve) or declining an applicant is admins only; dispatchers can mark one "reviewing".
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { inviteApplicant, logRecruiting, rejectApplicant } from "@/lib/recruiting";

const Body = z.object({ decision: z.enum(["approve", "reject", "reviewing"]), reason: z.string().max(300).optional() });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return deny(400, "decision required");
  if (parsed.data.decision !== "reviewing" && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  const who = v!.fullName ?? v!.email;
  if (parsed.data.decision === "approve") {
    const r = await inviteApplicant(id, who);
    return r.ok ? Response.json(r) : Response.json({ error: r.error }, { status: 500 });
  }
  if (parsed.data.decision === "reject") { await rejectApplicant(id, who, parsed.data.reason); return Response.json({ ok: true }); }
  await adminClient().from("contractor_applications").update({ status: "reviewing" }).eq("id", id);
  await logRecruiting("reviewing", { applicationId: id }, parsed.data.reason ?? null, who);
  return Response.json({ ok: true });
}
