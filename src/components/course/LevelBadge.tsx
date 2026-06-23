import type { CourseLevel, CourseStatus } from "@/types";
import { Badge } from "@/components/ui";

const levelConfig: Record<CourseLevel, { label: string; tone: "brand" | "info" | "danger" }> = {
  basico: { label: "Básico", tone: "brand" },
  intermedio: { label: "Intermedio", tone: "info" },
  avanzado: { label: "Avanzado", tone: "danger" }
};

export function LevelBadge({ level }: { level: CourseLevel }) {
  const c = levelConfig[level];
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

export function StatusBadge({ status }: { status: CourseStatus }) {
  if (status === "gratis") return <Badge tone="success">Gratis</Badge>;
  if (status === "proximamente") return <Badge tone="info">Próximamente</Badge>;
  return <Badge tone="brand">De pago</Badge>;
}
