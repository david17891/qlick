import { cn } from "@/lib/utils";

/** Anillo de progreso circular SVG. */
export function ProgressRing({
  value,
  size = 56,
  stroke = 6,
  className,
  showLabel = true,
  tone = "brand"
}: {
  value: number;
  size?: number;
  stroke?: number;
  className?: string;
  showLabel?: boolean;
  tone?: "brand" | "accent" | "neutral";
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  const colorClass =
    tone === "accent" ? "#EF9F08" : tone === "neutral" ? "#2a2438" : "#AB3FEA";

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f3e6ff"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colorClass}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {showLabel && (
        <span className="absolute text-xs font-bold text-ink">
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
