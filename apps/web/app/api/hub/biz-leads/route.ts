/*
 * FILE    : apps/web/app/api/hub/biz-leads/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-04_1934 UTC
 * PURPOSE : Staff controls for the business sales engine. POST JSON:
 *             { action: "settings", enabled, discover_per_day, emails_per_day, segments[], pilot_pct, pilot_jobs }
 *             { action: "status", id, status, note? }   — call list outcomes, not interested, do not contact
 *             { action: "run" }                         — run the engine now
 * UPDATED : 2026-10-05_0130 UTC — { action: "add_job_post", business_name, job_title, segment, email?, … , send_now? } — a business
 *           that posted a job for work we do (job-posting letter).
 * UPDATED : 2026-10-07_2030 UTC — { action: "job_posts" } finds job-posting leads now (Adzuna, Michigan + Washington); settings take job_posts_per_day.
 * UPDATED : 2026-10-11_1500 UTC — engine settings, runs and send-now outreach are admins only; dispatchers can log outcomes and add job posts without sending.
 */
import { z } from "zod";
import { BIZ_SEGMENTS, BUSINESS_TERMS } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { addJobPostLead, bizLeadEngine, setBizLeadStatus } from "@/lib/biz-leads";
import type { BizSegment } from "@handled/core";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), enabled: z.boolean(), discover_per_day: z.number().int().min(0).max(25), emails_per_day: z.number().int().min(0).max(100),
    segments: z.array(z.string()).refine((a) => a.every((x) => x in BIZ_SEGMENTS)), pilot_pct: z.number().int().min(0).max(BUSINESS_TERMS.maxPilotPct), pilot_jobs: z.number().int().min(0).max(BUSINESS_TERMS.maxPilotJobs), job_posts_per_day: z.number().int().min(0).max(40).optional() }),
  z.object({ action: z.literal("status"), id: z.string().uuid(), status: z.enum(["call", "not_interested", "do_not_contact", "replied", "queued"]), note: z.string().max(1000).nullable().optional() }),
  z.object({ action: z.literal("run") }),
  z.object({ action: z.literal("job_posts") }),
  z.object({ action: z.literal("add_job_post"), business_name: z.string().trim().min(2).max(160), job_title: z.string().trim().min(2).max(120), segment: z.string().refine((x) => x in BIZ_SEGMENTS),
    contact_name: z.string().trim().max(120).nullable().optional(), email: z.string().trim().email().nullable().optional().or(z.literal("")), phone: z.string().trim().max(30).nullable().optional(),
    website: z.string().trim().max(300).nullable().optional(), city: z.string().trim().max(80).nullable().optional(), posting_source: z.string().trim().max(60).nullable().optional(),
    posting_url: z.string().trim().url().nullable().optional().or(z.literal("")), send_now: z.boolean().optional() }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, "Check the request");
  const d = b.data;
  if (d.action !== "status" && !(d.action === "add_job_post" && !d.send_now) && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  if (d.action === "settings") {
    const { action: _a, ...row } = d;
    const { error } = await adminClient().from("biz_lead_settings").upsert({ id: 1, ...row, updated_at: new Date().toISOString(), updated_by: v!.email });
    return error ? deny(500, error.message) : Response.json({ ok: true });
  }
  if (d.action === "add_job_post") {
    const { action: _a, ...l } = d;
    const r = await addJobPostLead({ ...l, segment: l.segment as BizSegment, email: l.email || null, posting_url: l.posting_url || null }, v!.email);
    return Response.json(r, { status: r.ok ? 200 : 409 });
  }
  if (d.action === "job_posts") {
    const { discoverJobPostings, enrichBizLeads, getBizLeadSettings, jobBoardReady } = await import("@/lib/biz-leads");
    if (!jobBoardReady()) return deny(409, "Add ADZUNA_APP_ID and ADZUNA_APP_KEY in Vercel first (free at developer.adzuna.com)");
    const found = await discoverJobPostings(await getBizLeadSettings());
    const emails = await enrichBizLeads().catch(() => 0);
    return Response.json({ ok: true, result: { ...found, emailsFound: emails } });
  }
  if (d.action === "status") { await setBizLeadStatus(d.id, d.status, d.note ?? null, v!.email); return Response.json({ ok: true }); }
  return Response.json({ ok: true, result: await bizLeadEngine() });
}
