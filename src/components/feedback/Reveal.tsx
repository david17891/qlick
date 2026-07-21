"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/hooks/useInView";

type RevealDirection = "up" | "down" | "left" | "right" | "none";

export interface RevealProps {
  children: ReactNode;
  /** Dirección del reveal. Default "up". */
  direction?: RevealDirection;
  /** Delay en ms para stagger. Default 0. */
  delay?: number;
  /** Duración de la transición en ms. Default 500. */
  duration?: number;
  /** Threshold del observer. Default 0.15. */
  threshold?: number;
  /** Si true, solo se anima una vez. Default true. */
  once?: boolean;
  /** Tag HTML a renderizar. Default "div". */
  as?: "div" | "section" | "article" | "li" | "span";
  className?: string;
}

const directionInitial: Record<RevealDirection, string> = {
  up: "translate-y-3",
  down: "-translate-y-3",
  left: "translate-x-3",
  right: "-translate-x-3",
  none: ""
};

/**
 * Componente para animar elementos cuando entran al viewport.
 * Usa `useInView` (IntersectionObserver nativo, ~1KB).
 *
 * Patrón:
 *   <Reveal delay={100}>
 *     <Card>...</Card>
 *   </Reveal>
 *
 *   <Reveal as="li" delay={i * 100}>
 *     <li>...</li>
 *   </Reveal>
 */
export function Reveal({
  children,
  direction = "up",
  delay = 0,
  duration = 500,
  threshold = 0.15,
  once = true,
  as: Tag = "div",
  className
}: RevealProps) {
  const { ref, inView } = useInView({ threshold, once });

  return (
    <Tag
      ref={ref as never}
      className={cn(
        "transition-all ease-out",
        inView ? "opacity-100 translate-x-0 translate-y-0" : `opacity-0 ${directionInitial[direction]}`,
        className
      )}
      style={{ transitionDuration: `${duration}ms`, transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
