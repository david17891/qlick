/**
 * /cert/[folio] — Página imprimible del certificado de asistencia (Concept C).
 *
 * Sprint Cert Concept C 2026-07-08 (David + Mavis).
 *
 * IMPORTANTE — decisión de implementación:
 *   Esta página NO genera PDF en server. Solo renderiza el HTML del Concept C
 *   aprobado en `docs/qlick-cert-system/03-concept-c-dynamic-authority.html`,
 *   con los datos del cert inyectados server-side. La conversión a PDF la hace
 *   David localmente (Ctrl+P → "Guardar como PDF") porque garantiza fidelidad
 *   100% sin pelearse con `@react-pdf/renderer` ni headless browsers en
 *   Vercel Hobby.
 *
 * - Auth: misma `requireAdmin()` que el endpoint cert viejo (cookie admin).
 * - Datos: leídos por FOLIO desde `event_certificates` (no por attendee), con
 *   JOIN a `event_attendees` + `events` solo para mostrar metadata del evento
 *   que el cert necesitaría referenciar (ubicación, duración). El cert en sí
 *   se compone desde el `metadata` snapshot que se guardó al emitir.
 * - CSS: `app/cert/[folio]/cert.css` — replica 1:1 el Concept C + reglas
 *   `@page` y `@media print` para que el output PDF salga idéntico.
 * - QR: codifica `${BASE_URL}/filosofia` (decisión David 2026-07-08).
 *
 * FIDELIDAD — esta página DEBE ser 1:1 con el HTML aprobado. Cualquier
 * desviación debe reportarse, no inventarse (memory 2026-07-08).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateQrPngDataUrl, getCertQrUrl } from "@/lib/certificates/qr-helper";
import { loadAssetAsDataUrl } from "@/lib/certificates/asset-loader";
import { formatDateLong } from "@/lib/certificates/format-helpers";
import { PrintCertButton } from "./_components/PrintCertButton";
import "./cert.css";

interface CertPageProps {
  params: { folio: string };
}

interface EventCertRow {
  folio: string;
  event_id: string;
  attendee_id: string;
  template_variant: string;
  issued_at: string;
  metadata: Record<string, unknown> | null;
}

interface EventRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
}

interface AttendeeRow {
  id: string;
  name: string | null;
}

interface CertData {
  attendeeName: string;
  attendeeNamePlain: string; // primera palabra (sin gradient)
  attendeeNameAccent: string; // segunda palabra → con gradient
  eventTitle: string;
  eventDateLong: string;
  eventTime: string;
  eventDuration: string;
  eventLocation: string;
  reason: string;
  instructorName: string;
  instructorTitle: string;
  folio: string;
  issueDateLong: string;
  issueDateShort: string;
  qrDataUrl: string;
  signatureDataUrl: string;
  qIconDataUrl: string;
  certUrl: string;
}

function formatDateShort(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const months = [
      "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
      "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
    ];
    return `${day}·${months[d.getUTCMonth() ?? 0]}·${d.getUTCFullYear()}`;
  } catch {
    return iso;
  }
}

function formatDuration(starts: string, ends: string | null): string {
  if (!ends) return "90 minutos";
  const ms = new Date(ends).getTime() - new Date(starts).getTime();
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
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

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Devuelve [primeraParte, segundaParte] del nombre. La segunda parte es la que
 * lleva el gradient en el Concept C (style line 187: `<span class="word accent">Castillo Reyes</span>`).
 * Si el nombre tiene una sola palabra, devuelve ["", full] para que el gradient
 * caiga sobre el único bloque.
 */
function splitName(fullName: string): [string, string] {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const sp = trimmed.indexOf(" ");
  if (sp < 0) return ["", trimmed];
  return [trimmed.slice(0, sp), trimmed.slice(sp + 1)];
}

export default async function CertPage({ params }: CertPageProps) {
  const folio = params.folio?.trim();
  if (!folio) return notFound();

  // 1. Auth admin (cookie).
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="cert-auth-error">
        <h1>No autorizado</h1>
        <p>Necesitás iniciar sesión como admin para ver este cert.</p>
        <p>
          <a href="/login">Iniciar sesión</a>
        </p>
      </div>
    );
  }

  // 2. Supabase config guard.
  if (!checkSupabaseConfig().configured) {
    return (
      <div className="cert-auth-error">
        <h1>Supabase no configurado</h1>
        <p>Variables de entorno faltan. Ver docs/SUPABASE_CONNECTION_BOOTSTRAP.md.</p>
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();

  // 3. Cargar cert por folio.
  // FIXME(types): `event_certificates` no está en el Database type de Supabase
  // (regenerar con `npx supabase gen types typescript` cuando esté el service
  // role key disponible). Por ahora casteamos `as any` solo en este query para
  // destrabar Paso 1; el cast a EventCertRow de abajo mantiene el contrato.
  const { data: certRaw, error: certErr } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  })
    .from("event_certificates")
    .select("folio, event_id, attendee_id, template_variant, issued_at, metadata")
    .eq("folio", folio)
    .maybeSingle();

  if (certErr || !certRaw) return notFound();

  const cert = certRaw as EventCertRow;
  const meta = (cert.metadata ?? {}) as Record<string, unknown>;
  const issuedAt = cert.issued_at;

  // 4. Cargar evento + attendee (para mostrar datos del cert).
  const sbQuery = supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  };
  const [{ data: evData }, { data: attData }] = await Promise.all([
    sbQuery
      .from("events")
      .select("id, title, starts_at, ends_at, location")
      .eq("id", cert.event_id)
      .maybeSingle(),
    sbQuery
      .from("event_attendees")
      .select("id, name")
      .eq("id", cert.attendee_id)
      .maybeSingle(),
  ]);

  if (!evData || !attData) return notFound();

  const event = evData as EventRow;
  const attendee = attData as AttendeeRow;

  const attendeeName =
    (meta.attendeeName as string) ?? attendee.name?.trim() ?? "Asistente";
  const eventTitle = (meta.eventTitle as string) ?? event.title;
  const eventLocation = (meta.eventLocation as string) ?? event.location ?? "Por confirmar";
  const instructorName = (meta.instructorName as string) ?? "Paul Velásquez";
  const instructorTitle =
    (meta.instructorTitle as string) ?? "CEO & Fundador · Imparte este programa";
  const certUrl = getCertQrUrl();

  // 5. Generar QR + cargar assets (operación async).
  const [qrDataUrl, signatureDataUrl, qIconDataUrl] = await Promise.all([
    generateQrPngDataUrl({ data: certUrl, size: 256, errorCorrectionLevel: "H" }),
    Promise.resolve(loadAssetAsDataUrl("paul-signature.png")),
    Promise.resolve(loadAssetAsDataUrl("qlick-q-icon.png")),
  ]);

  const [attendeeNamePlain, attendeeNameAccent] = splitName(attendeeName);

  const certData: CertData = {
    attendeeName,
    attendeeNamePlain,
    attendeeNameAccent,
    eventTitle,
    eventDateLong: formatDateLong(event.starts_at),
    eventTime: formatTime(event.starts_at),
    eventDuration: formatDuration(event.starts_at, event.ends_at),
    eventLocation,
    reason:
      (meta.reason as string) ??
      "por haber completado satisfactoriamente el programa de formación en marketing digital e inteligencia artificial, demostrando dominio de estrategias, herramientas y metodologías de alto impacto.",
    instructorName,
    instructorTitle,
    folio: cert.folio,
    issueDateLong: formatDateLong(issuedAt),
    issueDateShort: formatDateShort(issuedAt),
    qrDataUrl,
    signatureDataUrl,
    qIconDataUrl,
    certUrl,
  };

  const currentYear = new Date().getUTCFullYear();

  // Estructura HTML del Concept C (idéntica a docs/qlick-cert-system/03-concept-c-dynamic-authority.html,
  // con datos inyectados). Server Component de Next para que sea imprimible
  // directamente vía Ctrl+P → "Guardar como PDF".
  return (
    <article className="cert-page" aria-label={`Certificado ${cert.folio}`}>
      {/* Área de acciones — visible en pantalla, oculta al imprimir */}
      <header className="cert-actions no-print">
        <a href={`/admin/eventos/${cert.event_id}`} className="cert-actions-back">
          ← Volver al evento
        </a>
        <h1 className="cert-actions-title">
          Certificado <code>{cert.folio}</code> · {htmlEscape(eventTitle)}
        </h1>
        <p className="cert-actions-hint">
          Para guardar como PDF: <kbd>Ctrl</kbd>+<kbd>P</kbd> → "Guardar como PDF".
          En la ventana emergente elegí <strong>Tamaño: Horizontal A4</strong> y desmarcá <strong>Encabezados y pies de página</strong>.
        </p>
        <PrintCertButton />
      </header>

      <div className="stage">
        <div className="cert">
          {/* LEFT PANEL */}
          <div className="left-panel"></div>
          <div className="chevrons">
            <svg viewBox="0 0 400 794" preserveAspectRatio="none">
              <g fill="none" stroke="#fff" strokeWidth="1.4">
                <path d="M-50 100 L100 200 L-50 300" />
                <path d="M-50 220 L100 320 L-50 420" />
                <path d="M-50 340 L100 440 L-50 540" />
                <path d="M30 100 L180 200 L30 300" />
                <path d="M30 220 L180 320 L30 420" />
                <path d="M30 340 L180 440 L30 540" />
                <path d="M110 100 L260 200 L110 300" />
                <path d="M110 220 L260 320 L110 420" />
                <path d="M190 100 L340 200 L190 300" />
                <path d="M190 220 L340 320 L190 420" />
                <path d="M270 100 L420 200 L270 300" />
                <path d="M270 220 L420 320 L270 420" />
              </g>
            </svg>
          </div>
          <div className="vertical-text">
            QLICK MARKETING DIGITAL · OFICIAL · {currentYear}
          </div>

          {/* Brand block — using real Qlick Q icon */}
          <div className="brand-block">
            <div className="q-icon">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={certData.qIconDataUrl} alt="Qlick Q" />
            </div>
            <div className="wordmark">Qlick</div>
            <div className="tag">Marketing Digital Academy</div>
          </div>

          {/* Course info at bottom of left */}
          <div className="course-info">
            <div className="label">PROGRAMA</div>
            <div className="title">
              {/* El Concept C original usa <br/> para partir el título del
                  curso en 2 líneas (panel diagonal no aguanta títulos largos
                  en 1 línea). Aquí replicamos: si el título tiene más de 22
                  caracteres, lo partimos en el mejor punto (espacio antes
                  de la mitad). */}
              {(() => {
                const t = certData.eventTitle;
                if (t.length <= 22) return t;
                const mid = Math.floor(t.length / 2);
                // Buscar el espacio más cercano a la mitad
                let bestSpace = -1;
                let bestDist = Infinity;
                for (let i = 0; i < t.length; i++) {
                  if (t[i] === " ") {
                    const d = Math.abs(i - mid);
                    if (d < bestDist) { bestDist = d; bestSpace = i; }
                  }
                }
                if (bestSpace < 0) return t;
                return (
                  <>
                    {t.slice(0, bestSpace)}
                    <br />
                    {t.slice(bestSpace + 1)}
                  </>
                );
              })()}
            </div>
            <div className="meta">
              {certData.eventDateLong} · {certData.eventTime} hrs · {certData.eventDuration}
            </div>
            {/* FIX 2026-07-08: eventLocation removido del cert. La ubicación
                logística ("Zoom (link se manda 24h antes)", "Sala X", etc.)
                no es info del cert — el cert es la constancia, no el
                itinerario. El metadata sigue guardándola para auditoría. */}
          </div>

          {/* RIGHT CONTENT */}
          <div className="right">
            <div className="eyebrow-row">
              <div className="label">QLICK CERTIFIED · CONSTANCIA</div>
              <div className="folio">
                FOLIO
                <div className="num">{certData.folio}</div>
              </div>
            </div>

            {/* HERO NAME */}
            <div className="hero">
              <div className="small">Certificado Oficial · {certData.issueDateLong}</div>
              <div className="presented-to">Se otorga la presente a</div>
              <div className="name">
                <span className="word">{certData.attendeeNamePlain}</span>
                <span className="word accent">{certData.attendeeNameAccent}</span>
              </div>
              <div className="deco-line">
                <svg viewBox="0 0 20 20">
                  <path
                    d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <div className="reason">{certData.reason}</div>
            </div>

            {/* Bottom row */}
            <div className="bottom">
              <div className="sig-block">
                <div className="signature">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={certData.signatureDataUrl} alt={`Firma de ${certData.instructorName}`} />
                </div>
                <div className="name">{certData.instructorName}</div>
                <div className="role">{certData.instructorTitle}</div>
              </div>

              <div className="verify-block">
                {/* FIX 2026-07-08: QR centrado, sin texto de URL.
                    El URL completo se sigue codificando en el QR
                    (qlick.digital/filosofia) pero NO se imprime como
                    texto — antes se cortaba en "qlick.digital/fil osofia".
                    El texto ahora es solo "Escanea" arriba y "Emitido DD-MMM-YYYY"
                    abajo, ambos centrados. */}
                <div className="label">Escanea</div>
                <div className="qr">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={certData.qrDataUrl} alt="QR del certificado" />
                </div>
                <div className="date">Emitido {certData.issueDateShort}</div>
              </div>
            </div>
          </div>

          {/* Sparkles */}
          <svg className="sparkle s1" width="22" height="22" viewBox="0 0 20 20">
            <path
              d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z"
              fill="#FBBF24"
            />
          </svg>
          <svg className="sparkle s2" width="14" height="14" viewBox="0 0 20 20">
            <path
              d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z"
              fill="#A855F7"
            />
          </svg>
        </div>
      </div>
    </article>
  );
}

// Forzar dynamic en build por el folio dinámico.
export const dynamic = "force-dynamic";