/*
 * FILE    : apps/web/app/api/hub/agent-actions/[id]/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_1800 UTC
 * PURPOSE : Staff: approve (execute) or reject an action proposed by an IEBC AI employee.
 * UPDATED : 2026-10-11_1500 UTC — approving a money, pro-approval or customer-remedy/marketing action (scopes finance, recruiting,
 *           retention) is admins only, same as doing it by hand; dispatchers can still reject them.
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { execute } from "@/lib/iebc/gateway";
import { ACTIONS } from "@/lib/iebc/actions";

const ADMIN_SCOPES = new Set(["finance", "recruiting", "retention"]);

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const body = z.object({ decision: z.enum(["approve", "reject"]) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return deny(400, "decision required");
  const { id } = await ctx.params;
  const db = adminClient();
  if (body.data.decision === "approve" && !isAdmin(v)) {
    const { data: pending } = await db.from("agent_actions").select("action").eq("id", id).maybeSingle();
    const def = pending ? ACTIONS[pending.action as string] : undefined;
    if (def?.write && ADMIN_SCOPES.has(def.scope)) return deny(403, ADMINS_ONLY);
  }
  // claim the row first so two staff can't execute the same action twice
  const { data: row } = await db.from("agent_actions")
    .update({ status: body.data.decision === "reject" ? "rejected" : "failed", decided_by: v!.fullName ?? v!.email, decided_at: new Date().toISOString() })
    .eq("id", id).eq("status", "pending_approval").select("*").maybeSingle();
  if (!row) return deny(409, "Already decided");
  if (body.data.decision === "reject") return Response.json({ status: "rejected" });
  const { data: agent } = await db.from("iebc_agents").select("name").eq("id", row.agent_id).maybeSingle();
  const out = await execute(row.action, row.params, async (status, result) => {
    await db.from("agent_actions").update({ status, result }).eq("id", id);
    return id;
  }, { actor: `${agent?.name ?? "IEBC agent"} (IEBC), approved by ${v!.fullName ?? v!.email}` });
  return Response.json(out);
}
