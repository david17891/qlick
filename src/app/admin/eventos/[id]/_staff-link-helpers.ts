/**
 * Helpers no-server (NO use server directive) compartidos entre server
 * components y server actions de event_staff_links.
 *
 * Esto existe porque un archivo con `"use server"` SOLO puede exportar
 * async functions. Los helpers síncronos (como `staffLinkWithUrl`) tienen
 * que vivir en un archivo separado.
 */

import { appBaseUrl } from "@/lib/utils";
import type { EventStaffLink } from "@/lib/staff/links";

/**
 * EventStaffLink + URL publica pre-calculada. Lo que el panel cliente
 * recibe para mostrar "Copiar URL".
 */
export interface StaffLinkWithUrl extends EventStaffLink {
  url: string;
}

/**
 * Helper para agregar URL a un link. Usado por el server component
 * que renderiza el panel.
 */
export function staffLinkWithUrl(link: EventStaffLink): StaffLinkWithUrl {
  return { ...link, url: `${appBaseUrl()}/staff/scan/${link.token}` };
}