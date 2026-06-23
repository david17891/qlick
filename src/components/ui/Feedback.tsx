import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Estado vacío reutilizable. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-14 px-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50/30",
        className
      )}
    >
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-ink-muted max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Skeleton placeholder para loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-brand-100/60",
        className
      )}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-brand-100/70 bg-white p-6 space-y-3">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

/** Componente visual de progreso (barra). */
export function ProgressBar({
  value,
  className,
  tone = "brand"
}: {
  value: number;
  className?: string;
  tone?: "brand" | "accent" | "neutral";
}) {
  const toneClass =
    tone === "accent"
      ? "bg-brand-accent"
      : tone === "neutral"
        ? "bg-ink-soft"
        : "bg-brand-500";
  return (
    <div
      className={cn(
        "h-2 w-full rounded-full bg-brand-100 overflow-hidden",
        className
      )}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", toneClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/** Spinner simple. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin",
        className
      )}
    />
  );
}

/** Sección con encabezado estándar. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  center,
  className
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && "text-center mx-auto", "max-w-2xl", className)}>
      {eyebrow && (
        <p className="text-sm font-bold uppercase tracking-wider text-brand-600 mb-2">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl sm:text-4xl font-bold text-ink font-display">
        {title}
      </h2>
      {description && (
        <p className="mt-3 text-ink-muted text-lg">{description}</p>
      )}
    </div>
  );
}
