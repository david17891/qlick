"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type TabVariant = "pill" | "underline";

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  variant?: TabVariant;
  className?: string;
  /** ID del tab activo controlado externamente (opcional). */
  activeTab?: string;
  onChange?: (id: string) => void;
}

/**
 * Tab navigation con 2 variants:
 * - pill (default): tabs como botones con rounded-full, estilo del AdminView
 * - underline: tabs con border-bottom indicador
 *
 * Patrón:
 *   const tabs = [
 *     { id: "general", label: "General", content: <GeneralTab /> },
 *     { id: "avanzado", label: "Avanzado", content: <AvanzadoTab /> }
 *   ];
 *   <Tabs tabs={tabs} />
 */
export function Tabs({
  tabs,
  defaultTab,
  variant = "pill",
  className,
  activeTab: controlledActive,
  onChange
}: TabsProps) {
  const [internal, setInternal] = useState(defaultTab ?? tabs[0]?.id);
  const active = controlledActive ?? internal;

  function setActive(id: string) {
    if (controlledActive === undefined) setInternal(id);
    onChange?.(id);
  }

  const activeContent = tabs.find((t) => t.id === active)?.content;

  return (
    <div className={className}>
      <div
        role="tablist"
        className={cn(
          "flex flex-wrap gap-1",
          variant === "pill"
            ? "rounded-full border border-brand-100 bg-white p-1"
            : "border-b border-brand-100"
        )}
      >
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition",
                variant === "pill"
                  ? cn(
                      "rounded-full",
                      isActive
                        ? "bg-brand-500 text-white shadow-sm"
                        : "text-ink-muted hover:bg-brand-50 hover:text-ink"
                    )
                  : cn(
                      "border-b-2 -mb-px",
                      isActive
                        ? "border-brand-500 text-brand-700"
                        : "border-transparent text-ink-muted hover:text-ink"
                    )
              )}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="mt-6">
        {activeContent}
      </div>
    </div>
  );
}
