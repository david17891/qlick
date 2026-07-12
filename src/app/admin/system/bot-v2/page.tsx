/**
 * /admin/system/bot-v2 — LEGACY (sprint v15 PR #1).
 *
 * El toggle del motor IA y todos los controles del bot viven ahora
 * en la pestaña "🤖 Configuración Bot" del dashboard principal
 * (`/admin?tab=bot`). Esta ruta se conserva como redirect 307 para
 * no romper bookmarks del equipo.
 */
import { redirect } from "next/navigation";

export default function LegacyBotV2Page() {
  redirect("/admin?tab=bot");
}
