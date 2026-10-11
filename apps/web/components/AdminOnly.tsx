/*
 * FILE    : apps/web/components/AdminOnly.tsx
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-11_1500 UTC
 * PURPOSE : Gate for Hub pages that only admins can open (money, settings and setup). Dispatchers don't see them in the menu;
 *           opening one by link shows this notice. The /api/hub routes enforce the same rule on their own.
 *           Usage at the top of a page:  const gate = await adminOnly(); if (gate) return gate;
 */
import Link from "next/link";
import { getViewer, isAdmin } from "@/lib/auth";

export async function adminOnly() {
  if (isAdmin(await getViewer())) return null;
  return (
    <div className="card max-w-lg space-y-2 text-sm">
      <h1 className="text-xl font-bold">Admins only</h1>
      <p className="text-ink-soft">Money, settings and setup pages are for admins. Dispatchers run day-to-day operations: jobs, the live roster, pros and customers.</p>
      <p className="text-ink-soft">Need something here? Ask an admin — see <Link href="/hub/team" className="underline">Hub → Team</Link>.</p>
    </div>
  );
}
