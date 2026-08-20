import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateQrPngDataUrl, getCertQrUrl } from "@/lib/certificates/qr-helper";
import { formatDateLong } from "@/lib/certificates/format-helpers";
import { getSignatoriesForEvent } from "@/lib/certificates/signatories";
import { PrintCertButton } from "../../../../cert/[folio]/_components/PrintCertButton";
import "../../../../cert/[folio]/cert.css";

const COVERED_PAYMENT_STATUSES = new Set([
  "not_required",
  "partial",
  "paid",
  "paid_manual",
]);

const PLACEHOLDER_NAMES = new Set([
  "asistente",
  "por confirmar",
  "confirmar",
  "pendiente",
  "test",
  "n/a",
  "na",
  "anonimo",
  "anonymous",
  "sin nombre",
]);

interface Props {
  params: { id: string };
  searchParams?: { bloque?: string; tamano?: string };
}

interface Signatory {
  name: string;
  title: string;
  assetFilename: string;
}

interface PreprintRow {
  name: string;
  paymentStatus: string;
}

function splitName(fullName: string): [string, string] {
  const normalized = fullName.trim().replace(/\s+/g, " ");
  const splitAt = normalized.indexOf(" ");
  if (splitAt < 0) return ["", normalized];
  return [normalized.slice(0, splitAt), normalized.slice(splitAt + 1)];
}

function formatDateShort(iso: string): string {
  const date = new Date(iso);
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${String(date.getDate()).padStart(2, "0")}·${months[date.getMonth()]}·${date.getFullYear()}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "America/Phoenix",
  });
}

function formatDuration(starts: string, ends: string | null): string {
  if (!ends) return "90 minutos";
  const minutes = Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 60_000);
  if (minutes < 90) return `${minutes} minutos`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 hora" : `${hours} horas`;
}

function titleWithBreak(title: string) {
  if (title.length <= 22) return title;
  const midpoint = Math.floor(title.length / 2);
  let splitAt = -1;
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < title.length; index += 1) {
    if (title[index] === " ") {
      const candidateDistance = Math.abs(index - midpoint);
      if (candidateDistance < distance) {
        splitAt = index;
        distance = candidateDistance;
      }
    }
  }
  if (splitAt < 0) return title;
  return <>{title.slice(0, splitAt)}<br />{title.slice(splitAt + 1)}</>;
}

function PreprintSheet({
  name,
  eventTitle,
  startsAt,
  endsAt,
  signatories,
  qrDataUrl,
  printNumber,
}: {
  name: string;
  eventTitle: string;
  startsAt: string;
  endsAt: string | null;
  signatories: Signatory[];
  qrDataUrl: string;
  printNumber: number;
}) {
  const [plainName, accentName] = splitName(name);
  const preprintFolio = `PRE-${String(printNumber).padStart(3, "0")}`;
  return (
    <div className="stage">
      <div className="cert">
        <div className="left-panel" />
        <div className="chevrons"><svg viewBox="0 0 400 794" preserveAspectRatio="none"><g fill="none" stroke="#fff" strokeWidth="1.4"><path d="M-50 100 L100 200 L-50 300" /><path d="M-50 220 L100 320 L-50 420" /><path d="M-50 340 L100 440 L-50 540" /><path d="M30 100 L180 200 L30 300" /><path d="M30 220 L180 320 L30 420" /><path d="M30 340 L180 440 L30 540" /><path d="M110 100 L260 200 L110 300" /><path d="M110 220 L260 320 L110 420" /><path d="M190 100 L340 200 L190 300" /><path d="M190 220 L340 320 L190 420" /><path d="M270 100 L420 200 L270 300" /><path d="M270 220 L420 320 L270 420" /></g></svg></div>
        <div className="vertical-text">QLICK MARKETING DIGITAL · OFICIAL · 2026</div>
        <div className="brand-block"><div className="q-icon"><img src="/certificates/qlick-q-icon.png" alt="Qlick Q" /></div><div className="wordmark">Qlick</div><div className="tag">Marketing Digital Academy</div></div>
        <div className="course-info"><div className="label">PROGRAMA</div><div className="title">{titleWithBreak(eventTitle)}</div><div className="meta">{formatDateLong(startsAt)} · {formatTime(startsAt)} hrs · {formatDuration(startsAt, endsAt)}</div></div>
        <div className="right">
          <div className="eyebrow-row"><div className="label">QLICK CERTIFIED · CONSTANCIA</div><div className="folio">PREIMPRESIÓN<div className="num">{preprintFolio}</div></div></div>
          <div className="hero"><div className="small">Constancia preparada · {formatDateLong(new Date().toISOString())}</div><div className="presented-to">Se otorga la presente a</div><div className="name"><span className="word">{plainName}</span><span className="word accent">{accentName}</span></div><div className="deco-line"><svg viewBox="0 0 20 20"><path d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z" fill="currentColor" /></svg></div><div className="reason">por su participación y registro en el programa de formación de Qlick Marketing Digital.</div></div>
          <div className="bottom"><div className={`sig-block${signatories.length > 1 ? " multiple" : ""}`}>{signatories.map((signatory) => <div className="signatory" key={signatory.name}><div className="signature"><img src={`/certificates/${signatory.assetFilename}`} alt={`Firma de ${signatory.name}`} /></div><div className="name">{signatory.name}</div><div className="role">{signatory.title}</div></div>)}</div><div className="verify-block"><div className="label">Escanea</div><div className="qr"><img src={qrDataUrl} alt="QR de Qlick" /></div><div className="date">Preimpresión · {formatDateShort(new Date().toISOString())}</div></div></div>
        </div>
        <svg className="sparkle s1" width="22" height="22" viewBox="0 0 20 20"><path d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z" fill="#FBBF24" /></svg><svg className="sparkle s2" width="14" height="14" viewBox="0 0 20 20"><path d="M10 0l1.5 8.5L20 10l-8.5 1.5L10 20l-1.5-8.5L0 10l8.5-1.5z" fill="#A855F7" /></svg>
      </div>
    </div>
  );
}

export default async function CertificatePreprintPage({ params, searchParams }: Props) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const supabase = createSupabaseAdminClient();
  const [{ data: event }, { data: confirmations, error }] = await Promise.all([
    supabase.from("events").select("id, title, slug, starts_at, ends_at").eq("id", params.id).maybeSingle(),
    supabase.from("event_confirmations").select("name, payment_status").eq("event_id", params.id).in("payment_status", Array.from(COVERED_PAYMENT_STATUSES)),
  ]);
  if (!event || error) notFound();

  const rows: PreprintRow[] = (confirmations ?? [])
    .filter((row) => {
      const name = row.name.trim();
      return name.length >= 2 && !PLACEHOLDER_NAMES.has(name.toLowerCase());
    })
    .map((row) => ({ name: row.name.trim(), paymentStatus: row.payment_status }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const rawSize = Number(searchParams?.tamano ?? 12);
  const blockSize = Number.isFinite(rawSize) ? Math.min(50, Math.max(1, Math.round(rawSize))) : 12;
  const blockCount = Math.max(1, Math.ceil(rows.length / blockSize));
  const requestedBlock = searchParams?.bloque && searchParams.bloque !== "todos" ? Number(searchParams.bloque) : 0;
  const block = Number.isInteger(requestedBlock) && requestedBlock > 0 && requestedBlock <= blockCount ? requestedBlock : 0;
  const visibleRows = block > 0 ? rows.slice((block - 1) * blockSize, block * blockSize) : rows;
  const qrDataUrl = await generateQrPngDataUrl({ data: getCertQrUrl(), size: 256, errorCorrectionLevel: "H" });
  const signatories = getSignatoriesForEvent(event.slug);

  return (
    <main className="preprint-page">
      <header className="cert-actions no-print"><Link className="cert-actions-back" href={`/admin/eventos/${params.id}`}>← Volver al evento</Link><h1 className="cert-actions-title">Preimpresión de constancias · {event.title}</h1><p className="cert-actions-hint">Se incluyen registros con pago cubierto. No crea asistentes, no marca check-in y no envía mensajes. Usa <strong>Ctrl+P → Guardar como PDF</strong>, A4 horizontal y sin encabezados.</p><div className="preprint-toolbar"><PrintCertButton />{block > 0 ? <Link className="cert-actions-back" href={`/admin/eventos/${params.id}/certificados-preimpresion?tamano=${blockSize}&bloque=todos`}>Ver todos</Link> : null}{Array.from({ length: blockCount }, (_, index) => <Link key={index} className="preprint-block-link" href={`/admin/eventos/${params.id}/certificados-preimpresion?tamano=${blockSize}&bloque=${index + 1}`}>Bloque {index + 1}</Link>)}</div><p className="cert-actions-hint">{rows.length} registros elegibles · {block > 0 ? `mostrando bloque ${block} de ${blockCount}` : "mostrando todos"} · {blockSize} por bloque</p></header>
      <div className="preprint-certificate-pages">{visibleRows.map((row, index) => <PreprintSheet key={`${row.name}-${index}`} name={row.name} eventTitle={event.title} startsAt={event.starts_at} endsAt={event.ends_at} signatories={signatories} qrDataUrl={qrDataUrl} printNumber={(block > 0 ? (block - 1) * blockSize : 0) + index + 1} />)}</div>
      {rows.length === 0 ? <div className="cert-auth-error no-print"><h1>No hay registros elegibles</h1><p>Solo se muestran nombres reales con pago cubierto.</p></div> : null}
    </main>
  );
}

export const dynamic = "force-dynamic";
