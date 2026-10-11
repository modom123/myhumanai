/*
 * FILE    : apps/web/app/api/hub/email/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-05_0148 UTC
 * PURPOSE : Hub → Email Center (staff only). POST JSON:
 *             { action: "save", id?, name, subject, preheader?, body, subject_es?, body_es?, audience, custom_list?, custom_consent? }
 *             { action: "count", audience, custom_list? }   — how many people it reaches (unsubscribes removed)
 *             { action: "test", id, to? }                    — a test copy (to you by default)
 *             { action: "launch", id, at? }                  — send now (next 10-minute run) or at a time
 *             { action: "pause" | "cancel" | "delete" | "duplicate", id }
 *             { action: "settings", from_name, reply_to?, daily_cap, per_run }
 *             { action: "verify" }                           — log in to SMTP / IMAP, check SPF / DKIM / DMARC
 *             { action: "reply", uid, to, subject, text, in_reply_to?, references? } — answer an inbox email
 *             { action: "compose", to, subject, text }       — a one-off email from the company mailbox
 *             { action: "optout", email }                    — add someone to the do-not-email list
 * UPDATED : 2026-10-11_1500 UTC — campaigns, settings and checks are admins only; dispatchers can reply, compose one-off emails and record opt-outs.
 */
import { z } from "zod";
import { EMAIL_AUDIENCES, EMAIL_LIMITS, lintCampaign, type EmailAudience } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { audienceRecipients, getEmailSettings, launchCampaign, sendTestEmail, type Campaign } from "@/lib/email-center";
import { checkDomainDns, saveToSent, sendMail, verifyMailbox } from "@/lib/mailbox";

const aud = z.string().refine((a) => a in EMAIL_AUDIENCES, "Unknown audience");
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().uuid().optional(), name: z.string().trim().min(2).max(120), subject: z.string().max(200), preheader: z.string().max(200).nullable().optional(),
    body: z.string().max(20000), subject_es: z.string().max(200).nullable().optional(), body_es: z.string().max(20000).nullable().optional(), audience: aud,
    custom_list: z.string().max(200000).nullable().optional(), custom_consent: z.boolean().optional() }),
  z.object({ action: z.literal("count"), audience: aud, custom_list: z.string().max(200000).nullable().optional() }),
  z.object({ action: z.literal("test"), id: z.string().uuid(), to: z.string().email().optional() }),
  z.object({ action: z.literal("launch"), id: z.string().uuid(), at: z.string().datetime({ offset: true }).nullable().optional() }),
  z.object({ action: z.enum(["pause", "cancel", "delete", "duplicate"]), id: z.string().uuid() }),
  z.object({ action: z.literal("settings"), from_name: z.string().trim().min(2).max(60), reply_to: z.string().email().nullable().optional().or(z.literal("")),
    daily_cap: z.number().int().min(1).max(EMAIL_LIMITS.maxDailyCap), per_run: z.number().int().min(1).max(EMAIL_LIMITS.maxPerRun) }),
  z.object({ action: z.literal("verify") }),
  z.object({ action: z.literal("reply"), uid: z.number().int(), to: z.string().email(), subject: z.string().min(1).max(200), text: z.string().min(1).max(50000), in_reply_to: z.string().max(500).nullable().optional(), references: z.string().max(5000).nullable().optional() }),
  z.object({ action: z.literal("compose"), to: z.string().email(), subject: z.string().min(1).max(200), text: z.string().min(1).max(50000) }),
  z.object({ action: z.literal("optout"), email: z.string().email() }),
]);

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return deny(400, b.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const d = b.data;
  if (!["reply", "compose", "optout"].includes(d.action) && !isAdmin(v)) return deny(403, ADMINS_ONLY);
  const db = adminClient();
  const now = new Date().toISOString();
  const load = async (id: string) => (await db.from("email_campaigns").select("*").eq("id", id).maybeSingle()).data as Campaign | null;

  switch (d.action) {
    case "save": {
      const row = { name: d.name, subject: d.subject, preheader: d.preheader || null, body: d.body, subject_es: d.subject_es || null, body_es: d.body_es || null,
        audience: d.audience, custom_list: d.audience === "custom" ? d.custom_list ?? null : null, custom_consent: d.audience === "custom" ? Boolean(d.custom_consent) : false, updated_at: now };
      if (d.id) {
        const c = await load(d.id);
        if (!c) return deny(404, "Not found");
        if (c.status !== "draft") return deny(409, "Only drafts can be edited — duplicate it to make changes.");
        const { error } = await db.from("email_campaigns").update(row).eq("id", d.id);
        return error ? deny(500, error.message) : Response.json({ ok: true, id: d.id, lint: lintCampaign(row) });
      }
      const { data, error } = await db.from("email_campaigns").insert({ ...row, created_by: v!.email }).select("id").single();
      return error ? deny(500, error.message) : Response.json({ ok: true, id: data.id, lint: lintCampaign(row) });
    }
    case "count": {
      const r = await audienceRecipients(d.audience as EmailAudience, d.custom_list);
      return Response.json({ ok: true, count: r.recipients.length, unsubscribed: r.unsubscribed, es: r.recipients.filter((x) => x.locale === "es").length });
    }
    case "test": {
      const c = await load(d.id);
      if (!c) return deny(404, "Not found");
      const r = await sendTestEmail(c, d.to ?? v!.email);
      return Response.json(r, { status: r.ok ? 200 : 409 });
    }
    case "launch": {
      const r = await launchCampaign(d.id, d.at ?? null);
      return Response.json(r, { status: r.ok ? 200 : 409 });
    }
    case "pause": {
      await db.from("email_campaigns").update({ status: "paused", updated_at: now }).eq("id", d.id).in("status", ["scheduled", "sending"]);
      return Response.json({ ok: true });
    }
    case "cancel": {
      await db.from("email_campaigns").update({ status: "cancelled", finished_at: now, updated_at: now }).eq("id", d.id).in("status", ["draft", "scheduled", "sending", "paused"]);
      await db.from("email_campaign_recipients").update({ status: "skipped", error: "campaign cancelled" }).eq("campaign_id", d.id).eq("status", "queued");
      return Response.json({ ok: true });
    }
    case "delete": {
      const { error } = await db.from("email_campaigns").delete().eq("id", d.id).eq("status", "draft");
      return error ? deny(500, error.message) : Response.json({ ok: true });
    }
    case "duplicate": {
      const c = await load(d.id);
      if (!c) return deny(404, "Not found");
      const { data, error } = await db.from("email_campaigns").insert({ name: `${c.name} (copy)`.slice(0, 120), subject: c.subject, preheader: c.preheader, body: c.body, subject_es: c.subject_es, body_es: c.body_es,
        audience: c.audience, custom_list: c.custom_list, custom_consent: false, created_by: v!.email }).select("id").single();
      return error ? deny(500, error.message) : Response.json({ ok: true, id: data.id });
    }
    case "settings": {
      const { error } = await db.from("email_center_settings").upsert({ id: 1, from_name: d.from_name, reply_to: d.reply_to || null, daily_cap: d.daily_cap, per_run: d.per_run, updated_by: v!.email, updated_at: now });
      return error ? deny(500, error.message) : Response.json({ ok: true });
    }
    case "verify": {
      const [login, dns] = await Promise.all([verifyMailbox(), checkDomainDns()]);
      return Response.json({ ok: true, ...login, dns });
    }
    case "reply":
    case "compose": {
      const s = await getEmailSettings();
      const subject = d.action === "reply" && !/^re:/i.test(d.subject) ? `Re: ${d.subject}` : d.subject;
      const signed = `${d.text}\n\n—\n${v!.fullName ?? s.from_name}\n${s.from_name}`;
      try {
        const id = await sendMail({ to: d.to, subject, text: signed, fromName: s.from_name, replyTo: s.reply_to,
          inReplyTo: d.action === "reply" ? d.in_reply_to : null, references: d.action === "reply" ? [d.references, d.in_reply_to].filter(Boolean).join(" ") || null : null });
        await saveToSent({ to: d.to, subject, text: signed, fromName: s.from_name, messageId: id, inReplyTo: d.action === "reply" ? d.in_reply_to : null }).catch((e) => console.error("[mailbox] save to Sent", e));
        return Response.json({ ok: true });
      } catch (e) { return deny(502, e instanceof Error ? e.message : "Send failed"); }
    }
    case "optout": {
      await db.from("email_optouts").upsert({ email: d.email.trim().toLowerCase() });
      return Response.json({ ok: true });
    }
  }
}
