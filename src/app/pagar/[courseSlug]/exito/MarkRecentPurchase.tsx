"use client";

/**
 * Client component que en /exito/page.tsx se monta y dispara el server
 * action `markRecentPurchase(email)` apenas carga. Eso deja una cookie
 * httpOnly con el email del comprador (7d) que /pagar/[slug] usa para
 * detectar "ya compraste este curso" cuando el usuario vuelve al buy
 * page sin haberse logueado todavía.
 *
 * No rompe nada si el user ya está logueado — la cookie simplemente no
 * se usa (server prefiere `getCurrentStudent()`).
 */

import { useEffect } from "react";
import { markRecentPurchase } from "./actions";

interface Props {
  email: string | null;
}

export function MarkRecentPurchase({ email }: Props) {
  useEffect(() => {
    if (!email) return;
    // Fire-and-forget. Si falla (cookie disabled / private mode), no
    // rompe la página — solo /pagar no va a reconocer la compra
    // reciente y mostrará el botón de comprar (no fatal).
    markRecentPurchase(email).catch(() => {});
  }, [email]);
  return null;
}