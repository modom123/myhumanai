/*
 * FILE    : apps/web/app/api/hub/jobs/[id]/remedy/route.ts
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1900 UTC
 * PURPOSE : Staff: make it right — refund, free redo, or complimentary service.
 * UPDATED : 2026-10-11_1500 UTC — refunds are admins only; dispatchers can still book a free redo or complimentary service.
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { createComplimentary, createRedo, issueRefund } from "@/lib/remedies";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("refund"), amount: z.number().positive(), pro_at_fault: z.boolean().default(false), reason: z.string().min(3).max(500) }),
  z.object({ type: z.literal("redo"), date, reason: z.string().min(3).max(500) }),
  z.object({ type: z.literal("complimentary"), service_slug: z.string(), date, reason: z.string().min(3).max(500) }),
]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return deny(400, "Invalid remedy");
  if (parsed.data.type === "refund" && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  const { id } = await ctx.params;
  const who = v!.fullName ?? v!.email;
  const b = parsed.data;
  const out =
    b.type === "refund" ? await issueRefund(id, b.amount, b.pro_at_fault, who, b.reason)
    : b.type === "redo" ? await createRedo(id, b.date, who, b.reason)
    : await createComplimentary(id, b.service_slug, undefined, b.date, who, b.reason);
  return Response.json(out, { status: out.ok ? 200 : 409 });
}
