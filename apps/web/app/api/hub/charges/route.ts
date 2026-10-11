/*
 * FILE    : apps/web/app/api/hub/charges/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_2053 UTC
 * UPDATED : 2026-10-02_1412 UTC — Spanish versions of person-facing texts, emails and push.
 * PURPOSE : Staff: Quick Charge — create a Stripe payment link for any amount (with or
 *           without a job), email it to the customer, and list recent links.
 * UPDATED : 2026-10-11_1500 UTC — Quick Charge is admins only.
 */
import { z } from "zod";
import { BRAND, money, t, type Job } from "@handled/core";
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/server";
import { createCheckout } from "@/lib/stripe";
import { sendEmail } from "@/lib/notify";
import { addEvent } from "@/lib/jobs";
import { localeOf } from "@/lib/push";

const Body = z.object({
  amount: z.number().positive().max(250000),
  description: z.string().min(3).max(300),
  kind: z.enum(["custom", "change_order", "deposit", "balance"]).default("custom"),
  job_ref: z.string().regex(/^H-\d+$/i).optional(),
  customer_name: z.string().max(120).optional(),
  customer_email: z.string().email().optional(),
  send_email: z.boolean().default(true),
});

export async function GET(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const { data } = await adminClient().from("payments").select("id, kind, amount, status, description, customer_name, customer_email, link_url, created_by, created_at, paid_at, jobs(ref)").not("link_url", "is", null).order("created_at", { ascending: false }).limit(100);
  return Response.json({ charges: data ?? [] });
}

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return deny(400, parsed.error.issues[0]?.message ?? "Check the form");
  const b = parsed.data;
  const db = adminClient();
  let job: Job | null = null;
  if (b.job_ref) {
    const { data } = await db.from("jobs").select("*").eq("ref", b.job_ref.toUpperCase()).maybeSingle();
    if (!data) return deny(404, `No job ${b.job_ref}`);
    job = data as Job;
  } else if (b.kind !== "custom") return deny(400, "Deposits, balances and change orders need a job number");
  const email = b.customer_email ?? job?.contact_email;
  if (!email) return deny(400, "Customer email required");
  const who = v!.fullName ?? v!.email;
  const r = await createCheckout({ amount: b.amount, kind: b.kind, job, name: `${b.description}${job ? ` — ${job.ref}` : ""}`, customerEmail: email, customerName: b.customer_name ?? job?.contact_name ?? null, createdBy: who });
  if (!r) return deny(503, "Stripe isn't configured — add STRIPE_SECRET_KEY");
  if (job) {
    await addEvent(job.id, "charge_link", `${b.kind.replace("_", " ")} link sent: ${money(b.amount)} — ${b.description}`, who, false);
    await addEvent(job.id, "human_touch", `Quick Charge ${money(b.amount)}`, who, false);
  }
  // the customer's language: their account toggle (by job, else by email), else the booking's language
  const prof = job?.customer_id ? null : (await db.from("profiles").select("id").ilike("email", email).maybeSingle()).data;
  const lang = b.send_email ? await localeOf(job?.customer_id ?? prof?.id ?? null, job?.locale) : "en";
  const name = b.customer_name ?? job?.contact_name;
  // staff write the description; the rest of the email follows the customer's language
  if (b.send_email && lang === "es") await sendEmail(email, `${BRAND.name}: ${b.kind === "change_order" ? "orden de cambio" : "pago"} de ${money(b.amount)}${job ? ` para ${job.ref}` : ""}`,
    `Hola${name ? ` ${name.split(" ")[0]}` : ""}:\n\n${b.description}: ${money(b.amount)}.\nPague de forma segura aquí: ${r.url}\n\n${t("es", BRAND.promise)}\n— ${BRAND.name}`);
  else if (b.send_email) await sendEmail(email, `${BRAND.name}: ${b.kind === "change_order" ? "change order" : "payment"} of ${money(b.amount)}${job ? ` for ${job.ref}` : ""}`,
    `Hi${b.customer_name ?? job?.contact_name ? ` ${(b.customer_name ?? job!.contact_name).split(" ")[0]}` : ""},\n\n${b.description}: ${money(b.amount)}.\nPay securely here: ${r.url}\n\n${BRAND.promise}\n— ${BRAND.name}`);
  return Response.json({ ok: true, url: r.url, paymentId: r.paymentId });
}
