/**
 * Server actions para gestión de event_staff_links (Commit B, 2026-07-03).
 *
 * Solo accesible para admins autenticados (requireAdmin). El admin:
 *   - Genera links nuevos (`createStaffLinkAction`)
 *   - Lista links activos + revocados (`listStaffLinksAction`)
 *   - Revoca links (`revokeStaffLinkAction`)
 *
 * **Decisiones de UX:**
 *   - Default de `validUntil` = `event.starts_at + 4h` (configurable).
 *   - Label opcional: "Entrada principal", "Staff A", etc.
 *   - Revocación es idempotente: revocar un link ya revocado no falla.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { logAdminAction } from "@/lib/crm/audit-server";
import {
  generateStaffLink,
  revokeStaffLink,
  listStaffLinks,
  type EventStaffLink,
} from "@/lib/staff/links";
import { staffLinkWithUrl, type StaffLinkWithUrl } from "./_staff-link-helpers";

export interface StaffLinkActionResult {
  ok: boolean;
  note: string;
  link?: EventStaffLink;
  /** URL publica del link (solo en create). */
  url?: string;
  links?: StaffLinkWithUrl[];
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createStaffLinkAction(
  _prev: StaffLinkActionResult | null,
  formData: FormData,
): Promise<StaffLinkActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const eventId = formData.get("eventId");
  const validUntilRaw = formData.get("validUntil");
  const labelRaw = formData.get("label");
  if (typeof eventId !== "string" || !eventId) {
    return { ok: false, note: "Falta eventId." };
  }
  const validUntil =
    typeof validUntilRaw === "string" && validUntilRaw
      ? new Date(validUntilRaw).toISOString()
      : undefined;
  const label =
    typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : null;

  const result = await generateStaffLink({
    eventId,
    validUntil,
    label,
    createdBy: admin.email ?? "system@qlick",
  });
  if (!result.ok || !result.link) {
    return { ok: false, note: result.note };
  }

  await logAdminAction({
    actor_email: admin.email ?? "system@qlick",
    action: "event_staff_link_create",
    entity_type: "event_staff_link",
    entity_id: result.link.id,
    metadata: {
      eventId,
      validUntil: result.link.validUntil,
      label: result.link.label,
    },
  });

  revalidatePath(`/admin/eventos/${eventId}`);
  return {
    ok: true,
    note: result.note,
    link: result.link,
    url: result.url,
  };
}

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export async function listStaffLinksAction(
  eventId: string,
): Promise<StaffLinkActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  if (!eventId) {
    return { ok: false, note: "Falta eventId." };
  }
  const links = (await listStaffLinks(eventId)).map(staffLinkWithUrl);
  return {
    ok: true,
    note: `${links.length} link(s).`,
    links,
  };
}

// ─────────────────────────────────────────────────────────────
// Revoke
// ─────────────────────────────────────────────────────────────

export async function revokeStaffLinkAction(
  _prev: StaffLinkActionResult | null,
  formData: FormData,
): Promise<StaffLinkActionResult> {
  const admin = await requireAdmin();
  if (!admin) {
    return { ok: false, note: "No autenticado como admin." };
  }
  const linkId = formData.get("linkId");
  const eventId = formData.get("eventId");
  const reasonRaw = formData.get("reason");
  if (typeof linkId !== "string" || !linkId) {
    return { ok: false, note: "Falta linkId." };
  }
  const reason =
    typeof reasonRaw === "string" && reasonRaw.trim() ? reasonRaw.trim() : null;

  const result = await revokeStaffLink(linkId, admin.email ?? "system@qlick", reason);
  if (!result.ok) {
    return { ok: false, note: result.note };
  }

  await logAdminAction({
    actor_email: admin.email ?? "system@qlick",
    action: "event_staff_link_revoke",
    entity_type: "event_staff_link",
    entity_id: linkId,
    metadata: {
      eventId: typeof eventId === "string" ? eventId : null,
      reason,
    },
  });

  if (typeof eventId === "string") {
    revalidatePath(`/admin/eventos/${eventId}`);
  }
  return { ok: true, note: result.note };
}