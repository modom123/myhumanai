/*
 * FILE    : apps/web/app/api/hub/market/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_0149 UTC
 * PURPOSE : Staff override for a service's market factor (Hub → Market pricing):
 *           POST { service_slug, area?, manual_factor | null }. null hands it back to learning.
 * UPDATED : 2026-10-11_1500 UTC — admins only (pricing setting).
 */
import { z } from "zod";
import { MARKET_BOUNDS, getService } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { refreshMarketFactors } from "@/lib/market";

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const raw = await req.json().catch(() => null);
  if (raw?.action === "relearn") return Response.json(await refreshMarketFactors());
  const b = z.object({ service_slug: z.string(), area: z.string().regex(/^(all|\d{3})$/).default("all"), manual_factor: z.number().min(MARKET_BOUNDS.min).max(MARKET_BOUNDS.max).nullable() }).safeParse(raw);
  if (!b.success || !getService(b.data.service_slug)) return deny(400, `Factor between ${MARKET_BOUNDS.min} and ${MARKET_BOUNDS.max}, or empty to let it learn`);
  const { error } = await adminClient().from("market_factors").upsert({ service_slug: b.data.service_slug, area: b.data.area, manual_factor: b.data.manual_factor, updated_at: new Date().toISOString(), updated_by: v!.email }, { onConflict: "service_slug,area" });
  return error ? deny(500, error.message) : Response.json({ ok: true });
}
