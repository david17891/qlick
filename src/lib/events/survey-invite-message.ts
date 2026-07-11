/**
 * Sprint cierre-eventos-virtuales (2026-07-11).
 *
 * Helper puro: construye el mensaje pre-armado de WhatsApp para que el
 * admin mande al confirmado el link de la encuesta post-evento.
 *
 * Se usa desde el orquestador `sendSurveyLinkToAllConfirmations()`
 * para generar un link `wa.me/<phone>?text=<msg>` que el admin
 * (o un automation) puede abrir. El body del mensaje es
 * intencionalmente corto — el foco es el link.
 */
export interface SurveyInviteWhatsAppInput {
  attendeeName: string;
  eventTitle: string;
  surveyUrl: string;
}

export function buildSurveyInviteWhatsAppMessage(
  input: SurveyInviteWhatsAppInput,
): string {
  const greet = input.attendeeName?.trim() ? `Hola ${input.attendeeName.trim()}` : "Hola";
  const lines: string[] = [
    `${greet},`,
    `¿pudiste asistir a "${input.eventTitle}"? Tardás 2 min en confirmar y nos ayudás un montón.`,
    "",
    `👉 ${input.surveyUrl}`,
    "",
    "— Equipo Qlick",
  ];
  return lines.join("\n");
}
