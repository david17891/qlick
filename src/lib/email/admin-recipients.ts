/** Destinatarios internos para notificaciones operativas. Server-only. */
export function getAdminNotificationRecipients(): string[] {
  const raw = process.env.ADMIN_NOTIFICATION_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0 && email.includes("@"));
}
