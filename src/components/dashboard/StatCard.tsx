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
  const ring =
    tone === "accent"
      ? "from-amber-100"
      : tone === "neutral"
        ? "from-slate-100"
        : "from-brand-100";
  return (
    <Card className={cn("p-5 bg-gradient-to-br to-white", ring)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            {label}
          </p>
          <p className="mt-1 text-2xl font-bold text-ink font-display">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
        </div>
        {icon && <div className="text-2xl opacity-70">{icon}</div>}
      </div>
    </Card>
  );
}
