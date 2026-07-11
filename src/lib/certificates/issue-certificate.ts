/**
 * issue-certificate.ts — Emision idempotente de certificados de asistencia.
 *
 * Sprint Certificados Concept C (sesion David 2026-07-08).
 *
 * Flujo:
 *   1. Validar attendee + event (mismas reglas que el placeholder HTML).
 *   2. Llamar RPC `issue_event_certificate()` — es race-safe y atomica.
 *      - Si ya existe cert para (event, attendee): devuelve el existente.
 *      - Si no: INSERT con el folio generado. Si hay UNIQUE violation
 *        por race, la RPC re-intenta y devuelve el ganador.
 *   3. Cargar assets (firma + isotipo) + generar QR.
 *   4. Render PDF via @react-pdf/renderer.
 *   5. Devolver el buffer + folio para que el caller lo streame.
 *
 * NOTA sobre el typegen:
 *   La tabla `event_certificates` y la RPC `issue_event_certificate` son
 *   typesafe via `src/types/supabase.ts` (regenerado con
 *   `supabase gen types typescript --project-id <ref>` el 2026-07-08).
 *   Los queries a `event_attendees` y `events` tambien son typesafe.
 */

import {
  createSupabaseAdminClient,
  type SupabaseAdminClient,
} from "@/lib/supabase/admin";
import { renderCertificatePdf } from "./render-certificate";
import { generateFolio } from "./folio";
import { generateQrPngDataUrl, getCertQrUrl } from "./qr-helper";
import { loadAssetAsDataUrl } from "./asset-loader";
import type { CertificateData } from "./types";

// ---------------------------------------------------------------------------
// Constantes de branding
// ---------------------------------------------------------------------------

const INSTRUCTOR_NAME = "Paul Velásquez";
const INSTRUCTOR_TITLE = "CEO & Fundador";
const TEMPLATE_VARIANT = "concept-c" as const;
/**
 * Etiqueta del tipo de evento. Por ahora constante porque la tabla `events`
 * no tiene `event_type` (solo `format` enum). Si se agrega, derivar aqui.
 */
const DEFAULT_COURSE_LABEL = "PARTICIPACIÓN EN";

// Regex de placeholder para rechazar nombres invalidos (mismo que el
// endpoint HTML original).
const PLACEHOLDER_NAME_RE =
  /^(asistente|por confirmar|confirmar|pendiente|test|n\/?a|anonimo|anonymous|sin nombre)$/i;

// ---------------------------------------------------------------------------
// Tipos de entrada / salida
// ---------------------------------------------------------------------------

export interface IssueCertificateInput {
  eventId: string;
  attendeeId: string;
  /** UUID del admin que emite (auth.users.id). Opcional. */
  adminUserId?: string;
}

export interface IssueCertificateResult {
  folio: string;
  pdfBuffer: Buffer;
  /** ISO 8601 timestamptz. */
  issuedAt: string;
  /** True si el cert ya existia (re-emision idempotente). */
  alreadyIssued: boolean;
  /** URL publica destino del QR (qlick.digital/filosofia). */
  certUrl: string;
}

export class CertificateValidationError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "CertificateValidationError";
    this.statusCode = statusCode;
  }
}

// ---------------------------------------------------------------------------
// Funcion principal
// ---------------------------------------------------------------------------

export async function issueCertificate(
  input: IssueCertificateInput,
): Promise<IssueCertificateResult> {
  const supabase = createSupabaseAdminClient();

  // 1. Cargar attendee
  const { data: attendee, error: attErr } = await supabase
    .from("event_attendees")
    .select("id, event_id, name, email, phone_normalized, checked_in_at")
    .eq("id", input.attendeeId)
    .eq("event_id", input.eventId)
    .maybeSingle();

  if (attErr || !attendee) {
    throw new CertificateValidationError(
      `Attendee no encontrado en este evento: ${attErr?.message ?? "not found"}`,
      404,
    );
  }
  if (!attendee.checked_in_at) {
    throw new CertificateValidationError(
      "El asistente no ha hecho check-in. El certificado solo se emite para asistentes que confirmaron asistencia.",
      409,
    );
  }

  // 2. Validar nombre (no placeholder)
  const name = (attendee.name ?? "").trim();
  if (name.length < 2 || PLACEHOLDER_NAME_RE.test(name)) {
    throw new CertificateValidationError(
      `El asistente no tiene un nombre real (actual: "${name}"). Edita su nombre en el panel admin antes de emitir el certificado.`,
      422,
    );
  }

  // 3. Cargar evento
  const { data: event, error: evtErr } = await supabase
    .from("events")
    .select("id, title, slug, starts_at, ends_at, location")
    .eq("id", input.eventId)
    .maybeSingle();

  if (evtErr || !event) {
    throw new CertificateValidationError(
      `Evento no encontrado: ${evtErr?.message ?? "not found"}`,
      404,
    );
  }

  // 4. Intentar emision via RPC (con retry por UNIQUE en folio).
  const rpcResult = await callIssueRpcWithRetry(supabase, input, name);

  // 5. Render PDF (re-uso del folio, sea nuevo o ya emitido).
  const certData = await buildCertificateData({
    name,
    eventTitle: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location: event.location ?? "Por confirmar",
    folio: rpcResult.folio,
    issuedAt: rpcResult.issued_at,
  });
  const pdfBuffer = await renderCertificatePdf(certData);

  return {
    folio: rpcResult.folio,
    pdfBuffer,
    issuedAt: rpcResult.issued_at,
    alreadyIssued: !rpcResult.was_inserted,
    certUrl: getCertQrUrl(),
  };
}

// ---------------------------------------------------------------------------
// Llamada RPC con retry
// ---------------------------------------------------------------------------

interface RpcRow {
  folio: string;
  issued_at: string;
  was_inserted: boolean;
}

/**
 * Wrapper sobre la RPC que maneja el caso de UNIQUE violation por folio:
 * si el folio random coincide con uno existente (no del mismo attendee,
 * pero podria pasar), regeneramos y reintentamos.
 *
 * La propia RPC ya maneja UNIQUE violations por (event_id, attendee_id)
 * via SELECT-then-INSERT con EXCEPTION handler. Este wrapper maneja
 * UNIQUE violations por `folio` puro.
 */
async function callIssueRpcWithRetry(
  supabase: SupabaseAdminClient,
  input: IssueCertificateInput,
  attendeeName: string,
  maxAttempts = 5,
): Promise<RpcRow> {
  let lastError: unknown = null;
  let metadata = {
    instructor_name: INSTRUCTOR_NAME,
    instructor_title: INSTRUCTOR_TITLE,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidateFolio = generateFolio();
    // RPC espera `undefined` cuando el param es opcional, no `null`.
    // El default de la PL/pgSQL ya es NULL — omitir la key es equivalente.
    const { data, error } = await supabase.rpc(
      "issue_event_certificate",
      {
        p_event_id: input.eventId,
        p_attendee_id: input.attendeeId,
        p_folio: candidateFolio,
        p_template_variant: TEMPLATE_VARIANT,
        p_metadata: metadata,
        ...(input.adminUserId != null
          ? { p_admin_user_id: input.adminUserId }
          : {}),
      },
    );

    if (!error && data) {
      // PostgREST rpc() con `returns table` devuelve array.
      const row = Array.isArray(data) ? data[0] : data;
      return row as RpcRow;
    }

    lastError = error;

    // Si es UNIQUE violation por folio (folio random ya existia), retry con
    // nuevo folio. Cualquier otro error, propagar.
    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      break;
    }

    // Si coincide con un cert ya emitido para el MISMO attendee, la RPC lo
    // maneja sola (re-fetch). Pero PostgREST podria no distinguir.
    // El break evita retry en bucle.
    if (attempt >= maxAttempts) break;
  }

  const msg =
    lastError && typeof lastError === "object" && "message" in lastError
      ? String((lastError as { message?: unknown }).message)
      : "Error desconocido";
  throw new CertificateValidationError(
    `No se pudo emitir el certificado despues de ${maxAttempts} intentos: ${msg}`,
    500,
  );
}

// ---------------------------------------------------------------------------
// Construccion del CertificateData
// ---------------------------------------------------------------------------

interface CertificateBuildContext {
  name: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  location: string;
  folio: string;
  issuedAt: string;
}

async function buildCertificateData(
  ctx: CertificateBuildContext,
): Promise<CertificateData> {
  // QR (async — uses qrcode lib)
  const qrDataUrl = await generateQrPngDataUrl({
    data: getCertQrUrl(),
    size: 256,
    errorCorrectionLevel: "H",
    margin: 2,
  });

  // Assets (sync — fs.readFileSync)
  const signatureDataUrl = loadAssetAsDataUrl("paul-signature.png");
  const qIconDataUrl = loadAssetAsDataUrl("qlick-q-icon.png");

  return {
    attendeeName: ctx.name,
    courseLabel: DEFAULT_COURSE_LABEL,
    eventTitle: ctx.eventTitle,
    eventDate: formatDateLong(ctx.startsAt),
    eventTime: formatTime(ctx.startsAt),
    eventDuration: formatDuration(ctx.startsAt, ctx.endsAt),
    eventLocation: ctx.location,
    instructorName: INSTRUCTOR_NAME,
    instructorTitle: INSTRUCTOR_TITLE,
    folio: ctx.folio,
    qrDataUrl,
    signatureDataUrl,
    qIconDataUrl,
    issueDate: formatDateLong(new Date().toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Formateo (es-MX, zona America/Phoenix — coherente con el placeholder HTML)
// ---------------------------------------------------------------------------

function formatDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Phoenix",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Phoenix",
    });
  } catch {
    return "";
  }
}

function formatDuration(startsIso: string, endsIso: string | null): string {
  if (!endsIso) return "90 minutos";
  const ms = new Date(endsIso).getTime() - new Date(startsIso).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}
