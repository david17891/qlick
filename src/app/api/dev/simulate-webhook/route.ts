/**
 * Endpoint dev para simular el webhook de un provider de pagos.
 *
 * Mockea el patrón de webhook asíncrono de Stripe / MercadoPago / Conekta:
 * - El cliente llama al endpoint con `{ event: 'paid' | 'failed' | 'pending' }`.
 * - El endpoint crea/actualiza el payment en DB.
 * - Si event='paid' → llama `grantAccess` para activar el acceso al curso.
 * - Si event='failed' o 'pending' → NO se activa el acceso.
 *
 * CUÁNDO SE REEMPLAZA: cuando integremos Stripe/MercadoPago/Conekta real, este
 * endpoint se reemplaza por el webhook del provider real con la misma signature
 * y la misma lógica de actualización de payment + grantAccess.
 *
 * DEV-ONLY: este endpoint está bajo `/api/dev/` para hacer explícito que es
 * solo para desarrollo. En producción, devuelve 404 (ver guard al inicio).
 *
 * Auth (FIX 2026-07-11 A-3): dos modos válidos, en orden de precedencia:
 *   1. **Header `x-dev-admin-secret`**: si `process.env.DEV_ADMIN_SECRET`
 *      está configurado Y el header matchea, pasa sin auth de estudiante.
 *      Para callers admin (scripts, tests, Playwright E2E).
 *   2. **Sesión de estudiante** (`getCurrentStudent`): fallback para el
 *      Client Component `/pagar/[courseSlug]/exito` que llama desde el browser.
 *
 * Si ninguno de los dos, 401. En producción, 404 antes de llegar acá.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { grantAccess } from "@/lib/lms/entitlements";
import { enrollUserInCourse } from "@/lib/lms/enrollments-server";
import { getCourseBySlug } from "@/lib/lms/courses-server";

type SimulateEvent = "paid" | "failed" | "pending";
type PaymentMethod = "card" | "oxxo" | "spei" | "wallet" | "free";

interface SimulateRequest {
  courseSlug: string;
  event: SimulateEvent;
  method?: PaymentMethod;
  amountMxn?: number;
  /** Para idempotencia: si el cliente ya tiene un paymentId, lo pasa. */
  paymentId?: string;
}

interface SimulateResponse {
  ok: boolean;
  paymentId: string;
  status: "pending" | "approved" | "rejected" | "refunded" | "cancelled";
  accessGranted: boolean;
  message: string;
  note?: string;
}

const VALID_EVENTS: SimulateEvent[] = ["paid", "failed", "pending"];
const VALID_METHODS: PaymentMethod[] = ["card", "oxxo", "spei", "wallet", "free"];

function isValidEvent(e: unknown): e is SimulateEvent {
  return typeof e === "string" && VALID_EVENTS.includes(e as SimulateEvent);
}

function isValidMethod(m: unknown): m is PaymentMethod {
  return typeof m === "string" && VALID_METHODS.includes(m as PaymentMethod);
}

function mapEventToStatus(event: SimulateEvent): "approved" | "rejected" | "pending" {
  if (event === "paid") return "approved";
  if (event === "failed") return "rejected";
  return "pending";
}

export async function POST(req: NextRequest) {
  // 0. En producción, este endpoint NO debe estar disponible. Si quedó
  //    desplegado por error, devolvemos 404 para no exponer la simulación
  //    de pagos. (En Fase G, cuando integremos Stripe real, este endpoint
  //    se reemplaza por el webhook real y esta guard se vuelve redundante.)
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, message: "Not found" },
      { status: 404 },
    );
  }

  // 1. Auth (FIX 2026-07-11 A-3): header DEV_ADMIN_SECRET O sesión de estudiante.
  const providedSecret = req.headers.get("x-dev-admin-secret");
  const expectedSecret = process.env.DEV_ADMIN_SECRET;
  const isAdminCall = Boolean(
    expectedSecret && providedSecret && providedSecret === expectedSecret,
  );

  // 2. Parse body.
  let body: SimulateRequest & { userId?: string };
  try {
    body = (await req.json()) as SimulateRequest & { userId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body inválido (JSON requerido)." },
      { status: 400 },
    );
  }

  // 3. Resolvemos el userId de la operación según el modo de auth.
  //    Si isAdminCall, necesitamos un userId del body (campo opcional `userId`).
  //    Si sesión de estudiante, usamos session.userId.
  let effectiveUserId: string;
  if (isAdminCall) {
    // En modo admin, el caller DEBE especificar a qué userId se le
    // simula el pago (no hay sesión). Si no viene, error 400.
    if (typeof body.userId !== "string" || !body.userId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Modo admin (x-dev-admin-secret) requiere campo `userId` en el body.",
        },
        { status: 400 },
      );
    }
    effectiveUserId = body.userId;
  } else {
    // Fallback: sesión de estudiante (Client Component).
    const session = await getCurrentStudent();
    if (!session) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Necesitás enviar x-dev-admin-secret o tener sesión de estudiante para simular un pago.",
        },
        { status: 401 },
      );
    }
    effectiveUserId = session.userId;
  }

  if (!body.courseSlug || typeof body.courseSlug !== "string") {
    return NextResponse.json(
      { ok: false, message: "Falta courseSlug." },
      { status: 400 },
    );
  }
  if (!isValidEvent(body.event)) {
    return NextResponse.json(
      {
        ok: false,
        message: `event inválido. Valores permitidos: ${VALID_EVENTS.join(", ")}`,
      },
      { status: 400 },
    );
  }
  const method: PaymentMethod = isValidMethod(body.method) ? body.method : "card";

  // 3. Cargar el curso.
  const course = await getCourseBySlug(body.courseSlug);
  if (!course) {
    return NextResponse.json(
      { ok: false, message: `Curso '${body.courseSlug}' no existe.` },
      { status: 404 },
    );
  }

  // 4. Crear o encontrar el payment (idempotencia).
  //    Usamos un idempotency_key determinístico basado en user+course+method+event
  //    para que el simulador sea idempotente.
  const idempotencyKey = `sim_${effectiveUserId}_${course.id}_${method}_${body.event}`;
  const newStatus = mapEventToStatus(body.event);
  const amountMxn = body.amountMxn ?? course.priceMXN ?? 0;

  const supabase = createSupabaseAdminClient();

  // Buscar si ya existe un payment con esta idempotency_key.
  const { data: existing } = await supabase
    .from("payments")
    .select("id, status")
    .eq("user_id", effectiveUserId)
    .eq("course_id", course.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  let paymentId: string;
  if (existing) {
    // Ya existe, actualizamos status.
    const { error: updErr } = await supabase
      .from("payments")
      .update({ status: newStatus })
      .eq("id", existing.id);
    if (updErr) {
      return NextResponse.json(
        { ok: false, message: `Error actualizando payment: ${updErr.message}` },
        { status: 500 },
      );
    }
    paymentId = existing.id;
  } else {
    // Crear nuevo.
    const { data: created, error: insErr } = await supabase
      .from("payments")
      .insert({
        user_id: effectiveUserId,
        course_id: course.id,
        provider: "mock",
        external_reference: `MOCK-${idempotencyKey}`,
        amount_mxn: amountMxn,
        discount_mxn: 0,
        currency: "MXN",
        status: newStatus,
        method,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();
    if (insErr || !created) {
      return NextResponse.json(
        { ok: false, message: `Error creando payment: ${insErr?.message ?? "unknown"}` },
        { status: 500 },
      );
    }
    paymentId = created.id;
  }

  // 5. Si event='paid', activar acceso.
  let accessGranted = false;
  if (body.event === "paid") {
    try {
      await grantAccess({
        userId: effectiveUserId,
        courseId: course.id,
        source: "simulated_payment",
        paymentId,
        grantedReason: `paid_via_sim_${new Date().toISOString().slice(0, 16)}`,
      });
      // También creamos/actualizamos el enrollment para que el dashboard
      // muestre el curso. enrollments-server maneja idempotencia
      // (no duplica si ya hay uno).
      //
      // source=null: la atribución del pago está en `course_access.access_source`
      // (vía grantAccess arriba con `"simulated_payment"`). `enrollments.source`
      // es para el ORIGEN del enrollment (qr/organic/referral/campaign), no el
      // método de pago, así que null es correcto.
      const enrollResult = await enrollUserInCourse(
        effectiveUserId,
        course.id,
        null,
      );
      if (!enrollResult.ok) {
        // eslint-disable-next-line no-console
        console.error("[simulate-webhook] enrollUserInCourse falló", {
          note: enrollResult.note,
        });
      }
      accessGranted = true;
    } catch (err) {
      return NextResponse.json(
        {
          ok: false,
          paymentId,
          status: newStatus,
          accessGranted: false,
          message: `Pago aprobado pero no se pudo activar el acceso: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 500 },
      );
    }
  }

  // 6. Respuesta.
  const message =
    body.event === "paid"
      ? accessGranted
        ? "Pago aprobado y acceso activado."
        : "Pago aprobado pero acceso NO activado."
      : body.event === "failed"
        ? "Pago rechazado. No se activó el acceso."
        : "Pago pendiente. Esperá la confirmación del provider.";

  const response: SimulateResponse = {
    ok: true,
    paymentId,
    status: newStatus,
    accessGranted,
    message,
  };
  return NextResponse.json(response);
}

// TODO(prod): mover este endpoint fuera de `/api/dev/` o protegerlo con
// `process.env.NODE_ENV !== "production"` para evitar que se use en producción.
// Alternativa: eliminar el endpoint y reemplazarlo por el webhook real del
// provider (Stripe/MercadoPago/Conekta) con verificación de firma.
