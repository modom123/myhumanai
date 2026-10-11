/*
 * FILE    : apps/web/app/api/hub/markets/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-03_1513 UTC
 * PURPOSE : Staff: add a market (city) or pause / resume one. POST { name, state, zip_prefixes[] } or { id, active }.
 *           A ZIP prefix can belong to one market only, so jobs are never counted twice.
 * UPDATED : 2026-10-04_1934 UTC — { id, launch_services: [...] | null }: which services a city has open (null = all).
 * UPDATED : 2026-10-11_1500 UTC — admins only (which cities and services are open).
 */
import { z } from "zod";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { clearLaunchCache } from "@/lib/launch";
import { LAUNCH_SET_RECOMMENDED, getService } from "@handled/core";

const Body = z.union([
  z.object({ name: z.string().trim().min(2).max(80), state: z.string().trim().length(2), zip_prefixes: z.array(z.string().regex(/^\d{3}$/)).min(1).max(30) }),
  z.object({ id: z.string().uuid(), active: z.boolean() }),
  z.object({ id: z.string().uuid(), launch_services: z.array(z.string()).max(100).nullable() }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Name, 2-letter state and 3-digit ZIP prefixes");
  const db = adminClient();
  if ("launch_services" in b.data) {
    const list = b.data.launch_services === null ? null : [...new Set(b.data.launch_services.filter((x) => getService(x)))];
    const { error } = await db.from("markets").update({ launch_services: list && list.length ? list : null }).eq("id", b.data.id);
    clearLaunchCache();
    return error ? deny(500, error.message) : Response.json({ ok: true });
  }
  if ("id" in b.data) {
    const { error } = await db.from("markets").update({ active: b.data.active }).eq("id", b.data.id);
    clearLaunchCache();
    return error ? deny(500, error.message) : Response.json({ ok: true });
  }
  const prefixes = [...new Set(b.data.zip_prefixes)];
  const { data: taken } = await db.from("markets").select("name, zip_prefixes").overlaps("zip_prefixes", prefixes);
  if (taken?.length) return deny(409, `Already in ${taken.map((m: { name: string }) => m.name).join(", ")}: ${prefixes.filter((p) => taken.some((m: { zip_prefixes: string[] }) => m.zip_prefixes.includes(p))).join(", ")}`);
  // a new city opens with the recommended launch set (constraint-driven launch); widen it in the scorecard
  const { error } = await db.from("markets").insert({ name: b.data.name, state: b.data.state.toUpperCase(), zip_prefixes: prefixes, launch_services: [...LAUNCH_SET_RECOMMENDED] });
  clearLaunchCache();
  return error ? deny(500, error.message) : Response.json({ ok: true });
}
