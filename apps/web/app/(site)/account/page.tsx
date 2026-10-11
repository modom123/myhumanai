/*
 * FILE    : apps/web/app/(site)/account/page.tsx
 * PROJECT : Handled — AI-run home & business services
 * CREATED : 2026-10-01_1723 UTC
 * UPDATED : 2026-10-02_0316 UTC — Handled Plus, refer-a-friend code, delete my account.
 * UPDATED : 2026-10-02_1412 UTC — English / Spanish and the language toggle.
 * UPDATED : 2026-10-03_0040 UTC — My contracts link.
 * PURPOSE : Customer portal — all jobs, recurring plans, quick rebook.
 * UPDATED : 2026-10-04_1934 UTC — link to the business account portal for members.
 * UPDATED : 2026-10-04_2204 UTC — My favorite pros: book again with them, or remove.
 * UPDATED : 2026-10-07_0530 UTC — Handled Points: balance, tier, credits, redeem, activity.
 * UPDATED : 2026-10-11_1500 UTC — new customers (no bookings, no business account) get a welcome instead of an empty list:
 *           how it works, popular services, first-booking perks (Points bonus, a friend's code) and "Book your first service".
 *           It switches to the normal bookings view after their first booking.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { HANDLED_PLUS, LAUNCH_SET_RECOMMENDED, REFERRAL, getService, money, moneyRange, serviceText, t as tr, type Job, type Locale } from "@handled/core";
import { getLocale } from "@/lib/locale";
import { activeMembership, ensureReferralCode } from "@/lib/growth";
import { siteUrl } from "@/lib/notify";
import { CopyLink, DeleteAccount, LanguageToggle, PlusButton } from "@/components/AccountExtras";
import { getViewer } from "@/lib/auth";
import { myAccounts } from "@/lib/business";
import { myFavorites } from "@/lib/favorites";
import { LoyaltyCard } from "@/components/LoyaltyCard";
import { getLoyaltySettings } from "@/lib/loyalty";
import { RemoveFavorite } from "@/components/Favorites";
import { supabaseConfigured } from "@/lib/supabase/env";
import { Empty, NotConfigured, StatusBadge, fmtDate } from "@/components/ui";

export const metadata = { title: "My bookings" };
export const dynamic = "force-dynamic";

export default async function Account() {
  if (!supabaseConfigured) return <NotConfigured />;
  const v = await getViewer();
  if (!v) redirect("/login?next=/account");
  const [{ data: jobs }, { data: plans }] = await Promise.all([
    v.db.from("jobs").select("*").order("created_at", { ascending: false }),
    v.db.from("recurring_plans").select("*").eq("active", true),
  ]);
  const list = (jobs ?? []) as Job[];
  const biz = await myAccounts(v).catch(() => []);
  const favs = await myFavorites(v.userId).catch(() => []);
  const l = await getLocale();
  const t = (s: string) => tr(l, s);
  const name = (slug: string) => { const s = getService(slug); return s ? serviceText(l, slug, s).name : slug; };
  const isNew = list.length === 0 && biz.length === 0;
  return (
    <div className="wrap py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-3xl font-extrabold tracking-tight">{t("My bookings")}</h1><p className="text-sm text-ink-soft">{v.email}</p></div>
        <div className="flex gap-2"><Link href="/book" className="btn-primary">{t("Book a service")}</Link>{biz.length > 0 && <Link href="/account/business" className="btn-ghost">🏢 {biz.length === 1 ? biz[0].account.company : l === "es" ? "Cuentas empresariales" : "Business accounts"}</Link>}<Link href="/account/contracts" className="btn-ghost">{t("My contracts")}</Link><form action="/auth/signout" method="post"><button className="btn-ghost">{t("Sign out")}</button></form></div>
      </div>
      {(plans ?? []).length > 0 && (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {(plans ?? []).map((p: { id: string; service_slug: string; frequency: string; price: number; next_date: string }) => (
            <div key={p.id} className="card bg-brand-tint"><div className="text-sm font-semibold">{name(p.service_slug)} · {t(p.frequency)}</div><div className="text-sm text-ink-soft">{t("Next visit")} {fmtDate(p.next_date)} · {money(p.price)}</div></div>
          ))}
        </div>
      )}
      {favs.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-1 font-bold">★ {l === "es" ? "Mis profesionales favoritos" : "My favorite pros"}</h2>
          <p className="mb-3 text-xs text-ink-soft">{l === "es" ? "Ven primero sus próximas reservas por unas horas; si no pueden, otro profesional verificado lo toma. No está garantizado." : "They see your next bookings first for a few hours; if they can't, another vetted pro takes it. Not guaranteed."}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {favs.map((f) => (
              <div key={f.id} className="card flex flex-wrap items-center justify-between gap-2">
                <div><div className="font-semibold">{f.crew_first_name ? `${f.crew_first_name} · ${f.pro_name}` : `${f.contact_first_name || f.pro_name}${f.contact_first_name ? ` · ${f.pro_name}` : ""}`}</div>
                  <div className="text-xs text-ink-soft">{f.rating ? `${Number(f.rating).toFixed(1)}★ · ` : ""}{f.service_slug ? name(f.service_slug) : ""}</div></div>
                <div className="flex items-center gap-3">
                  <Link href={`/book?${f.service_slug ? `service=${f.service_slug}&` : ""}pro=${f.contractor_id}${f.crew_member_id ? `&crew=${f.crew_member_id}` : ""}`} className="btn-primary px-3 text-sm">{l === "es" ? "Reservar de nuevo" : "Book again"}</Link>
                  <RemoveFavorite id={f.id} es={l === "es"} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isNew && <Welcome locale={l} name={name} />}
      <div className="mt-8 space-y-3">
        {list.length === 0 && !isNew && <Empty>{l === "es" ? `Aún no hay reservas. Todo lo que reserve con ${v.email} aparece aquí, con estado, facturas, mensajes y fotos.` : `No bookings yet. Anything you book with ${v.email} shows up here, with status, invoices, messages and photos.`}</Empty>}
        {list.map((j) => {
          const s = getService(j.service_slug);
          return (
            <Link key={j.id} href={`/account/jobs/${j.id}`} className="card flex flex-wrap items-center justify-between gap-3 transition hover:border-brand">
              <div className="flex items-center gap-3"><span className="text-2xl">{s?.icon}</span><div><div className="font-semibold">{name(j.service_slug)} <span className="text-xs text-ink-soft">{j.ref}</span></div><div className="text-sm text-ink-soft">{fmtDate(j.scheduled_date)} · {j.address}</div></div></div>
              <div className="flex items-center gap-3"><span className="text-sm font-semibold">{j.price_final ? money(j.price_final) : moneyRange(j.estimate_low, j.estimate_high)}</span><StatusBadge status={j.status} /></div>
            </Link>
          );
        })}
      </div>
      <AccountExtras userId={v.userId} email={v.email} locale={l} />
    </div>
  );
}

/** First visit, nothing booked yet: what Handled is, how it works and one clear next step. */
async function Welcome({ locale, name }: { locale: Locale; name: (slug: string) => string }) {
  const es = locale === "es";
  const points = await getLoyaltySettings().catch(() => null);
  const popular = LAUNCH_SET_RECOMMENDED.filter((slug) => getService(slug)).slice(0, 6);
  const steps = es
    ? [["1", "Reserve en 2 minutos", "Elija el servicio, la fecha y vea el precio antes de confirmar."], ["2", "Un profesional verificado llega", "Con seguro y verificación de antecedentes. Le avisamos cuando va en camino."], ["3", "Pague cuando esté hecho", "Fotos del trabajo terminado, factura y mensajes, todo aquí."]]
    : [["1", "Book in 2 minutes", "Pick a service and a date, and see the price before you confirm."], ["2", "A vetted pro shows up", "Insured and background-checked. We let you know when they're on the way."], ["3", "Pay when it's done", "Photos of the finished work, your invoice and messages, all right here."]];
  return (
    <div className="mt-8 space-y-4">
      <div className="card border-brand bg-brand-tint">
        <h2 className="text-2xl font-extrabold tracking-tight">{es ? "¡Bienvenido a Handled!" : "Welcome to Handled!"}</h2>
        <p className="mt-1 text-sm text-ink-soft">{es ? "Su cuenta está lista. Esto es lo que pasa cuando reserva:" : "Your account is ready. Here's how it works:"}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {steps.map(([n, title, body]) => (
            <div key={n} className="rounded-xl bg-white/70 p-3"><div className="text-xs font-bold text-brand">{n}</div><div className="font-semibold">{title}</div><div className="text-sm text-ink-soft">{body}</div></div>
          ))}
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          {points?.enabled && <li>🏅 {es ? `+${points.firstJobBonus} Handled Points extra cuando termine su primer trabajo.` : `+${points.firstJobBonus} bonus Handled Points when your first job is done.`}</li>}
          <li>🎁 {es ? `¿Tiene el código de un amigo? ${money(REFERRAL.friendOff)} de descuento en su primer trabajo: escríbalo al reservar.` : `Got a friend's code? ${money(REFERRAL.friendOff)} off your first job — enter it when you book.`}</li>
        </ul>
        <Link href="/book" className="btn-primary mt-5 inline-block">{es ? "Reservar mi primer servicio" : "Book your first service"}</Link>
      </div>
      <div>
        <h2 className="mb-2 font-bold">{es ? "Lo más reservado" : "Popular services"}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {popular.map((slug) => (
            <Link key={slug} href={`/book?service=${slug}`} className="card flex items-center gap-2 transition hover:border-brand"><span className="text-2xl">{getService(slug)?.icon}</span><span className="text-sm font-semibold">{name(slug)}</span></Link>
          ))}
        </div>
      </div>
    </div>
  );
}

async function AccountExtras({ userId, email, locale }: { userId: string; email: string; locale: Locale }) {
  const t = (s: string) => tr(locale, s);
  const es = locale === "es";
  const [member, code] = await Promise.all([activeMembership(email, userId).catch(() => null), ensureReferralCode(userId).catch(() => null)]);
  const link = code ? `${siteUrl()}/book?promo=${code}` : null;
  return (
    <div className="mt-12 grid gap-4 md:grid-cols-2">
      <div className={`card ${member ? "border-brand bg-brand-tint" : ""}`}>
        <div className="font-semibold">⭐ {HANDLED_PLUS.name}{member ? ` — ${t("you're a member")}` : ` — ${money(HANDLED_PLUS.monthly)}/${t("month")}`}</div>
        <ul className="mt-2 space-y-1 text-sm text-ink-soft">{HANDLED_PLUS.perks.map((p) => <li key={p}>✓ {t(p)}</li>)}</ul>
        <div className="mt-3"><PlusButton member={Boolean(member)} locale={locale} /></div>
      </div>
      {link && (
        <div className="card">
          <div className="font-semibold">🎁 {es ? `Regale ${money(REFERRAL.friendOff)}, reciba ${money(REFERRAL.reward)}` : `Give ${money(REFERRAL.friendOff)}, get ${money(REFERRAL.reward)}`}</div>
          <p className="mt-1 text-sm text-ink-soft">{es ? `Sus amigos reciben ${money(REFERRAL.friendOff)} de descuento en su primer trabajo con su código ` : `Friends get ${money(REFERRAL.friendOff)} off their first job with your code `}<b className="font-mono text-ink">{code}</b>{es ? `. Cuando terminen su trabajo, usted recibe un crédito de ${money(REFERRAL.reward)}.` : `. When their job is done, you get a ${money(REFERRAL.reward)} credit.`}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2"><CopyLink url={link} locale={locale} /><span className="break-all text-xs text-ink-soft">{link}</span></div>
        </div>
      )}
      <LoyaltyCard account={{ profileId: userId, email }} es={es} />
      <div className="md:col-span-2"><LanguageToggle locale={locale} /></div>
      <div className="md:col-span-2"><DeleteAccount locale={locale} /></div>
    </div>
  );
}
