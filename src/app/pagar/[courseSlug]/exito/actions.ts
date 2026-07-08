"use server";

/**
 * Server actions del flow /pagar/[slug]/exito (guest checkout).
 *
 * `markRecentPurchase(email)`: setea cookie httpOnly con el email del
 *   comprador para que /pagar/[slug] lo detecte en visitas futuras
 *   sin sesión y muestre "ya compraste" en vez del botón "Pagar ahora".
 *
 * `resendGuestAccessLink(sessionId)`: lee el email del Stripe session
 *   y dispara `supabase.auth.signInWithOtp`. Rate limited a 3 por hora
 *   por combinación IP+email (FASE 2 hardening contra email bombing).
 */

import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { recordAndCheckRateLimit, getClientIp } from "@/lib/api/rate-limit";

export async function markRecentPurchase(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = email.trim().toLowerCase();
    // Validación mínima para evitar garbage data / XSS via this action.
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "email inválido" };
    }
    cookies().set("qlick_recent_purchase", trimmed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

export async function resendGuestAccessLink(sessionId: string): Promise<{
  ok: boolean;
  email?: string;
  error?: string;
  retryAfterSec?: number;
}> {
  // Rate limit: 3 calls/hora por combinación IP+email (FASE 2 anti email bombing).
  const ip = getClientIpFromHeaders();
  let email: string | null | undefined;
  try {
    // Caso A: sessionId real (cs_test_...) → consultamos Stripe.
    // Caso B: sessionId = "auto" → usamos la cookie seteada por
    //   MarkRecentPurchase.
    if (sessionId && sessionId !== "auto") {
      const provider = getPaymentProvider();
      const result = await provider.getStatus(sessionId);
      email = (result as any).customerEmail;
    } else {
      email = cookies().get("qlick_recent_purchase")?.value;
    }

    if (!email) {
      return {
        ok: false,
        error:
          "No pudimos recuperar el email del pago. Si compraste hace más de 7 días, la cookie expiró — contactános.",
      };
    }

    const rateKey = `resend:${ip}:${email.toLowerCase()}`;
    const decision = recordAndCheckRateLimit(rateKey, {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxCalls: 3,
    });
    if (!decision.allowed) {
      const retryAfterSec = Math.ceil(decision.resetMs / 1000);
      return {
        ok: false,
        error: `Demasiados reenvíos. Probá de nuevo en ${Math.ceil(retryAfterSec / 60)} minutos.`,
        retryAfterSec,
      };
    }

    await markRecentPurchase(email);
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${
          process.env.NEXT_PUBLIC_APP_URL ?? "https://www.qlick.digital"
        }/dashboard?paid=ok`,
      },
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true, email };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error inesperado.",
    };
  }
}

/**
 * Helper: extrae IP del request via headers de Next.js. Similar a
 * `getClientIp(req: Request)` pero server actions no exponen el Request
 * completo, solo headers.
 */
function getClientIpFromHeaders(): string {
  const h = headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = h.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}