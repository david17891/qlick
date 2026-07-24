"use server";

/**
 * Server actions del flow /pagar/[slug]/exito (guest checkout).
 *
 * `markRecentPurchase(email)`: setea cookie httpOnly con el email del
 *   comprador para que /pagar/[slug] lo detecte en visitas futuras
 *   sin sesion y muestre "ya compraste" en vez del boton "Pagar ahora".
 *   Cookie expira en 7 dias (despues el user va a tener que loguearse
 *   o usar el magic link).
 *
 * `resendGuestAccessLink(sessionId)`: lee el email del Stripe session
 *   y dispara `supabase.auth.signInWithOtp`. Rate limited a 3 por hora
 *   por combinacion IP+email (FASE 2 hardening contra email bombing).
 */

import { cookies, headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";
import { recordAndCheckRateLimit } from "@/lib/api/rate-limit";

export async function markRecentPurchase(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = email.trim().toLowerCase();
    // Validacion minima para evitar que cualquier string sea cookie
    // (proteccion contra garbage data y contra XSS reflected via this
    // action).
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "email invalido" };
    }
    cookies().set("qlick_recent_purchase", trimmed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 dias
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
  try {
    let email: string | null | undefined;

    // Caso A: sessionId real (cs_test_...) -> consultamos Stripe.
    // Caso B: sessionId = "auto" (desde /pagar despues de comprar, no
    //   tenemos el session_id a mano) -> usamos la cookie seteada por
    //   MarkRecentPurchase.
    if (sessionId && sessionId !== "auto") {
      const provider = getPaymentProvider();
      const result = await provider.getStatus(sessionId);
      email = result.customerEmail;
    } else {
      email = cookies().get("qlick_recent_purchase")?.value;
    }

    if (!email) {
      return {
        ok: false,
        error:
          "No pudimos recuperar el email del pago. Si compraste hace mas de 7 dias, la cookie expiro - contactanos.",
      };
    }

    // Rate limit: 3 calls/hora por combinacion IP+email (FASE 2 anti
    // email bombing). Previene que un atacante con lista de emails
    // haga spam desde una IP, o que un usuario cliquee muchas veces
    // el boton "Reenviar link".
    const ip = getClientIpFromHeaders();
    const rateKey = `resend:${ip}:${email.toLowerCase()}`;
    const decision = recordAndCheckRateLimit(rateKey, {
      windowMs: 60 * 60 * 1000, // 1 hora
      maxCalls: 3,
    });
    if (!decision.allowed) {
      const retryAfterSec = Math.ceil(decision.resetMs / 1000);
      return {
        ok: false,
        error: `Demasiados reenvios. Prueba de nuevo en ${Math.ceil(
          retryAfterSec / 60
        )} minutos.`,
        retryAfterSec,
      };
    }

    // Seteamos/refreshamos cookie para que /pagar/[slug] lo detecte despues.
    await markRecentPurchase(email);
    // Mandamos magic link via Supabase.
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
