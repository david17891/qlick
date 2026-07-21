"use client";

import { useEffect, useRef, useState } from "react";

export interface UseInViewOptions {
  /** Threshold (0-1) de visibilidad para disparar. Default 0.15. */
  threshold?: number;
  /** Si true, solo dispara una vez. Default true. */
  once?: boolean;
  /** Root margin CSS-style. Default "0px". */
  rootMargin?: string;
}

/**
 * Hook liviano (~1KB) con IntersectionObserver nativo.
 * Retorna `ref` para attach al elemento y `inView: boolean` que se activa
 * cuando el elemento entra en el viewport.
 *
 * Patrón:
 *   const { ref, inView } = useInView({ threshold: 0.2 });
 *   <div ref={ref} className={inView ? "opacity-100" : "opacity-0"}>
 *     ...
 *   </div>
 */
export function useInView<T extends Element = HTMLDivElement>(
  options: UseInViewOptions = {}
) {
  const { threshold = 0.15, once = true, rootMargin = "0px" } = options;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Si el browser no soporta IntersectionObserver, mostramos directo.
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return { ref, inView };
}
