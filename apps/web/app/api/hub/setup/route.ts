/*
 * FILE    : apps/web/app/api/hub/setup/route.ts
 * PROJECT : Handled (HandledServices) — AI-run home & business services
 * CREATED : 2026-10-01_1940 UTC
 * PURPOSE : Staff: readiness report (GET) and one-click fixes (POST { action: "sync_catalog" }).
 * UPDATED : 2026-10-11_1500 UTC — Go-live setup is admins only.
 */
import { ADMINS_ONLY, deny, getViewer, isAdmin, isStaff } from "@/lib/auth";
import { readiness } from "@/lib/readiness";
import { syncCatalog } from "@/lib/catalog";

export async function GET(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  return Response.json({ checks: await readiness() });
}

export async function POST(req: Request) {
  const v = await getViewer(req);
  if (!isStaff(v)) return deny();
  if (!isAdmin(v)) return deny(403, ADMINS_ONLY);
  const body = await req.json().catch(() => ({}));
  if (body.action === "sync_catalog") return Response.json(await syncCatalog(true));
  return deny(400, "Unknown action");
}
