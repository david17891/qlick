"use server";

/**
 * Server actions del flow /pagar/[slug]/exito (guest checkout).
 *
 * `markRecentPurchase(email)`: setea cookie httpOnly con el email del
 *   comprador para que /pagar/[slug] lo detecte en visitas futuras
 *   sin sesión y muestre "ya compraste" en vez del botón "Pagar ahora".
 *   Cookie expira en 7 días (después el user va a tener que loguearse
 *   o usar el magic link).
 *
 * `resendGuestAccessLink(sessionId)`: lee el email del Stripe session
 *   y dispara `supabase.auth.signInWithOtp`.
 */

import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments";

export async function markRecentPurchase(
  email: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = email.trim().toLowerCase();
    // Validación mínima para evitar que cualquier string sea cookie
    // (protección contra garbage data y contra XSS reflected via this
    // action).
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
}> {
  try {
    let email: string | null | undefined;

    // Caso A: sessionId real (cs_test_...) → consultamos Stripe.
    // Caso B: sessionId = "auto" (desde /pagar después de comprar, no
    //   tenemos el session_id a mano) → usamos la cookie seteada por
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
          "No pudimos recuperar el email del pago. Si compraste hace más de 7 días, la cookie expiró — contactános.",
      };
    }
    // Seteamos/refreshamos cookie para que /pagar/[slug] lo detecte después.
    await markRecentPurchase(email);
    // Mandamos magic link vía Supabase.
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