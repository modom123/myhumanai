/*
 * FILE    : apps/web/app/api/hub/deductions/[id]/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_0120 UTC
 * PURPOSE : Staff decide a proposed deduction: POST { decision: "upheld" | "waived", note }.
 * UPDATED : 2026-10-11_1500 UTC — admins only (money decision).
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { decideDeduction } from "@/lib/deductions";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const b = z.object({ decision: z.enum(["upheld", "waived"]), note: z.string().max(1000).default("") }).safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Pick uphold or waive");
  if (b.data.decision === "upheld" && b.data.note.trim().length < 5) return deny(400, "Say why — the pro gets the reason in writing");
  const r = await decideDeduction((await ctx.params).id, b.data.decision, v!.email, b.data.note);
  return r.ok ? Response.json(r) : deny(409, r.error);
}
