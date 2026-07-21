/**
 * Resuelve un nombre de icono (string) a su componente de Lucide.
 *
 * Necesario porque el catálogo de servicios guarda `services.icon` como
 * string en la DB (ej. 'Globe', 'ClipboardCheck', 'Megaphone'). En lugar
 * de hacer dynamic import en runtime (caro), mantenemos un map cerrado
 * con los iconos que usa el seed de FASE 8B. Para agregar uno nuevo,
 * importar el componente de lucide-react y sumarlo al map.
 *
 * Si el nombre no está en el map, cae a `Sparkles` (default neutro).
 */

import {
  Globe,
  ClipboardCheck,
  Megaphone,
  Package,
  CheckCircle2,
  MessageCircle,
  Sparkles,
  type LucideIcon as LucideIconType,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIconType> = {
  Globe,
  ClipboardCheck,
  Megaphone,
  Package,
  CheckCircle2,
  MessageCircle,
  Sparkles,
};

export function resolveIcon(name: string | null | undefined): LucideIconType {
  if (name && ICON_MAP[name]) return ICON_MAP[name];
  return Sparkles;
}
