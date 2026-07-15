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
import { grantEventAccess } from "@/lib/lms/event-entitlements";
import { enrollUserInCourse } from "@/lib/lms/enrollments-server";
import { getCourseBySlug } from "@/lib/lms/courses-server";
import { getEventBySlug } from "@/lib/events/events-server";

type SimulateEvent = "paid" | "failed" | "pending";
type PaymentMethod = "card" | "oxxo" | "spei" | "wallet" | "free";
type SimulateProductKind = "course" | "event";

interface SimulateRequest {
  /** Slug del curso (compat: default `productKind="course"`). */
  courseSlug?: string;
  /** Slug del evento (usar con `productKind: "event"`). */
  eventSlug?: string;
  /** Tipo de producto. Default "course" si no se pasa. */
  productKind?: SimulateProductKind;
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

  // Resolvemos el producto según productKind. Default "course" para
  // mantener compat con callers que ya existían antes del soporte de
  // eventos (migration 20260714230000).
  const productKind: SimulateProductKind =
    body.productKind === "event" ? "event" : "course";
  const slug = productKind === "event" ? body.eventSlug : body.courseSlug;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json(
      {
        ok: false,
        message:
          productKind === "event"
            ? "Falta eventSlug (o productKind='event' sin eventSlug)."
            : "Falta courseSlug.",
      },
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

  // 3. Cargar el producto (curso o evento).
  let productId: string;
  let productLabel: string;
  let productTitle: string;
  let defaultAmountMxn: number;
  if (productKind === "event") {
    const event = await getEventBySlug(slug);
    if (!event) {
      return NextResponse.json(
        { ok: false, message: `Evento '${slug}' no existe.` },
        { status: 404 },
      );
    }
    if (!event.priceMXN || event.priceMXN <= 0) {
      return NextResponse.json(
        {
          ok: false,
          message: `El evento '${slug}' es gratuito. El simulador solo aplica a eventos con cobro.`,
        },
        { status: 400 },
      );
    }
    productId = event.id;
    productLabel = "event";
    productTitle = event.title;
    defaultAmountMxn = event.priceMXN;
  } else {
    const course = await getCourseBySlug(slug);
    if (!course) {
      return NextResponse.json(
        { ok: false, message: `Curso '${slug}' no existe.` },
        { status: 404 },
      );
    }
    productId = course.id;
    productLabel = "course";
    productTitle = course.title;
    defaultAmountMxn = course.priceMXN ?? 0;
  }

  // 4. Crear o encontrar el payment (idempotencia).
  //    Usamos un idempotency_key determinístico basado en user+product+method+event
  //    para que el simulador sea idempotente. El prefijo "course_" o "event_"
  //    evita colisión entre cursos y eventos con el mismo id (no debería
  //    pasar porque son tablas separadas, pero defense in depth).
  const idempotencyKey = `sim_${productLabel}_${effectiveUserId}_${productId}_${method}_${body.event}`;
  const newStatus = mapEventToStatus(body.event);
  const amountMxn = body.amountMxn ?? defaultAmountMxn;

  const supabase = createSupabaseAdminClient();

  // Buscar si ya existe un payment con esta idempotency_key.
  // El filtro por idempotency_key ya garantiza unicidad (incluye
  // productLabel + productId, así que no choca con cursos o eventos
  // distintos del mismo user). Para eventos, NO filtramos por
  // course_id porque la tabla payments no tiene event_id y para
  // eventos queda null.
  const { data: existing } = await supabase
    .from("payments")
    .select("id, status")
    .eq("user_id", effectiveUserId)
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
    // Crear nuevo. Para eventos, course_id queda null (la tabla
    // payments no tiene columna event_id; la referencia al evento
    // vive en event_access.payment_id, que se crea en el grant abajo).
    const { data: created, error: insErr } = await supabase
      .from("payments")
      .insert({
        user_id: effectiveUserId,
        course_id: productKind === "course" ? productId : null,
        provider: "mock",
        external_reference: `MOCK-${idempotencyKey}`,
        amount_mxn: amountMxn,
        discount_mxn: 0,
        currency: "MXN",
        status: newStatus,
        method,
        idempotency_key: idempotencyKey,
        metadata: {
          product_kind: productKind,
          product_id: productId,
          product_title: productTitle,
        },
      } as never)
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

  // 5. Si event='paid', activar acceso (course_access o event_access).
  let accessGranted = false;
  if (body.event === "paid") {
    try {
      if (productKind === "event") {
        // Evento: grantEventAccess (migration 20260707100000).
        // El access_source es 'simulated_event_payment' para distinguir
        // de 'event_purchase' (Stripe real) en queries/auditoría.
        await grantEventAccess({
          userId: effectiveUserId,
          eventId: productId,
          source: "simulated_event_payment",
          paymentId,
          grantedReason: `paid_via_sim_${new Date().toISOString().slice(0, 16)}`,
        });
      } else {
        // Curso: grantAccess + enrollUserInCourse (comportamiento legacy).
        await grantAccess({
          userId: effectiveUserId,
          courseId: productId,
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
          productId,
          null,
        );
        if (!enrollResult.ok) {
          // eslint-disable-next-line no-console
          console.error("[simulate-webhook] enrollUserInCourse falló", {
            note: enrollResult.note,
          });
        }
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
