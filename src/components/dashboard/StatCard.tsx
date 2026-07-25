import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand"
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "brand" | "accent" | "neutral";
}) {
  // v2 (2026-07-21 — redesign "está muy blanco"):
  //  - fondo: wash estático (linear-gradient brand wash 6% → blanco)
  //    en lugar de `bg-gradient-to-br from-brand-100 to-white` plano.
  //  - chip: gradiente brand-100→blanco con ring inset, color brand-700.
  //    Reemplaza el `bg-brand-100` plano que se perdía contra el fondo.
  const wash =
    tone === "accent"
      ? "rgba(245, 158, 11, 0.06)"
      : tone === "neutral"
        ? "rgba(15, 10, 26, 0.04)"
        : "rgba(171, 63, 234, 0.06)";

  const chipClass =
    tone === "accent"
      ? "chip-brand-accent"
      : tone === "neutral"
        ? "chip-brand-neutral"
        : "chip-brand";

  return (
    <Card variant="pro" className="p-5" style={{ background: `linear-gradient(180deg, ${wash}, #ffffff 70%)` }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-ink font-display">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        {icon && (
          <div
            className={cn(
              "flex h-10 w-10 flex-shrink-0 items-center justify-center",
              chipClass
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
