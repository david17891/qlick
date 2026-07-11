/**
 * Template PDF del certificado de asistencia — Concept C (Dynamic Authority).
 *
 * Replica fiel del diseno estatico en:
 *   docs/qlick-cert-system/03-concept-c-dynamic-authority.html
 *
 * Layout A4 landscape (842 x 595 pts):
 *   - Panel diagonal morado oscuro (38% ancho, gradiente vertical)
 *     - Isotipo Q + wordmark "Qlick" + tag "MARKETING DIGITAL"
 *     - Course label + titulo evento + meta (fecha/hora/duracion/lugar)
 *   - Right content (62% ancho, padding generoso)
 *     - Eyebrow row: "CERTIFICADO DE ASISTENCIA" | folio
 *     - Hero: "Presentado a" + nombre (60pt, primera palabra en morado)
 *             + deco line con spark + "Por completar exitosamente"
 *             + titulo evento (morado oscuro)
 *     - Bottom row: signature (1.5fr) + QR (1fr), sin URL estampada
 *
 * Decisiones del 2026-07-08 (sesion David):
 *   - QR codifica ${BASE_URL}/filosofia (landing de marca, NO /verify/{folio})
 *   - URL NO se estampa como texto en el cert — solo el QR visual
 *   - David decidio que el QR del cert no es verificable por folio
 *
 * Fuentes: registramos Inter y Plus Jakarta Sans en runtime
 * (registrar fuentes de Google requiere fetch en build/runtime).
 * Si el registro falla, cae a Helvetica (default de @react-pdf/renderer).
 */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  Svg,
  Polygon,
  Defs,
  LinearGradient,
  Stop,
  Path,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import * as React from "react";
import type { CertificateData } from "./types";

// ---------------------------------------------------------------------------
// Fuentes
// ---------------------------------------------------------------------------

const FONT_FAMILY = {
  sans: "Helvetica", // fallback si Google Fonts falla al registrar
  serif: "Times-Roman",
};

let fontsRegistered = false;
function tryRegisterFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  try {
    // Inter (display/body). Registramos solo regular y bold desde el repo de
    // Google Fonts CDN. Si falla (build offline / sin red), seguimos con
    // Helvetica y @react-pdf/renderer usa la fuente por defecto.
    Font.register({
      family: "Inter",
      src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff",
      fontWeight: 400,
    });
    Font.register({
      family: "Inter",
      src: "https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff",
      fontWeight: 700,
    });
    FONT_FAMILY.sans = "Inter";
  } catch {
    // fallback silencioso a Helvetica
  }
}

// ---------------------------------------------------------------------------
// Paleta y estilos
// ---------------------------------------------------------------------------

const COLORS = {
  purple700: "#7E22CE",
  purple800: "#6B21A8",
  purple900: "#3B0764",
  purple950: "#1E0540",
  ink: "#0F172A",
  slate700: "#334155",
  slate500: "#64748B",
  slate300: "#CBD5E1",
  ivory: "#FAFAF7",
  spark: "#FBBF24",
  white: "#FFFFFF",
  cream: "#F5F2EA",
} as const;

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PANEL_WIDTH = Math.round(PAGE_WIDTH * 0.38); // 320 pts
const PANEL_DIAGONAL_X = Math.round(PANEL_WIDTH * 0.78); // 250 pts

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.ivory,
    fontFamily: FONT_FAMILY.sans,
    color: COLORS.ink,
    padding: 0,
    position: "relative",
  },

  // ---------- Panel izquierdo (morado diagonal) ----------

  brandBlock: {
    position: "absolute",
    top: 48,
    left: 56,
    width: PANEL_WIDTH - 90, // deja espacio para la diagonal en el top-right
  },
  qIcon: {
    width: 70,
    height: 100,
    marginBottom: 16,
  },
  wordmark: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 800,
    fontSize: 32,
    letterSpacing: -0.8,
    color: COLORS.white,
    lineHeight: 1,
  },
  brandTag: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 600,
    fontSize: 9,
    letterSpacing: 2.5,
    color: "rgba(255,255,255,0.7)",
    textTransform: "uppercase",
    marginTop: 6,
  },

  courseInfo: {
    position: "absolute",
    bottom: 40,
    left: 56,
    width: PANEL_WIDTH - 90,
  },
  courseLabel: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 8,
    letterSpacing: 2.5,
    color: COLORS.spark,
    textTransform: "uppercase",
  },
  courseTitle: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 700,
    fontSize: 18,
    color: COLORS.white,
    marginTop: 4,
    lineHeight: 1.15,
  },
  courseMeta: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    lineHeight: 1.4,
  },

  verticalText: {
    position: "absolute",
    top: 220,
    left: 30,
    transform: "rotate(-90deg)",
    transformOrigin: "0% 0%",
    fontFamily: FONT_FAMILY.sans,
    fontSize: 8,
    letterSpacing: 4,
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    // font-size un poco chico para que no choque con la diagonal
  },

  // ---------- Right content ----------

  rightContent: {
    position: "absolute",
    top: 56,
    left: PANEL_WIDTH + 30,
    right: 56,
    bottom: 56,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
  },

  eyebrowRow: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  eyebrowLabel: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 9,
    letterSpacing: 3,
    color: COLORS.purple700,
    textTransform: "uppercase",
    fontWeight: 600,
  },
  eyebrowFolioBlock: {
    textAlign: "right",
  },
  eyebrowFolioLabel: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 9,
    letterSpacing: 2.5,
    color: COLORS.slate500,
    textTransform: "uppercase",
  },
  eyebrowFolioNum: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.ink,
    marginTop: 4,
    letterSpacing: 1,
  },

  hero: {
    marginTop: 16,
  },
  heroEyebrow: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 12,
    fontWeight: 600,
    color: COLORS.slate500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  heroPresentedTo: {
    fontFamily: FONT_FAMILY.sans,
    fontStyle: "italic",
    fontSize: 13,
    color: COLORS.slate700,
    marginTop: 12,
  },
  heroName: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 900,
    fontSize: 56,
    lineHeight: 0.95,
    letterSpacing: -2,
    color: COLORS.ink,
    marginTop: 8,
  },
  heroNameAccent: {
    color: COLORS.purple700,
  },
  heroNameRest: {
    color: COLORS.ink,
  },
  decoLine: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 12,
  },
  heroReason: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 13,
    color: COLORS.slate700,
    maxWidth: 420,
    lineHeight: 1.5,
  },
  heroCourse: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 700,
    fontSize: 18,
    color: COLORS.purple900,
    marginTop: 10,
    letterSpacing: -0.2,
    lineHeight: 1.2,
  },

  bottom: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: 24,
  },
  sigBlock: {
    flex: 1.4,
  },
  signature: {
    height: 64,
    marginLeft: -10, // compensa el bbox del PNG (ver asset-loading notes)
  },
  instructorName: {
    fontFamily: FONT_FAMILY.sans,
    fontWeight: 700,
    fontSize: 12,
    color: COLORS.ink,
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.slate300,
    paddingRight: 20,
    marginRight: 20,
  },
  instructorTitle: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 10,
    color: COLORS.slate500,
    marginTop: 3,
    paddingRight: 20,
    marginRight: 20,
  },

  qrBlock: {
    flex: 0.9,
    alignItems: "flex-end",
  },
  qrBox: {
    width: 84,
    height: 84,
    backgroundColor: COLORS.white,
    borderRadius: 4,
    padding: 4,
    border: `1px solid ${COLORS.slate300}`,
  },
  qrImage: {
    width: "100%",
    height: "100%",
  },
  qrIssueDate: {
    fontFamily: FONT_FAMILY.sans,
    fontSize: 9,
    color: COLORS.slate500,
    marginTop: 6,
    textAlign: "right",
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function firstWordAndRest(name: string): { first: string; rest: string } {
  const trimmed = name.trim();
  if (!trimmed) return { first: "", rest: "" };
  const sp = trimmed.indexOf(" ");
  if (sp < 0) return { first: trimmed, rest: "" };
  return {
    first: trimmed.slice(0, sp),
    rest: trimmed.slice(sp + 1),
  };
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function CertificatePDF({ data }: { data: CertificateData }) {
  tryRegisterFonts();

  const { first: firstWord, rest: nameRest } = firstWordAndRest(data.attendeeName);

  return (
    <Document
      title={`Certificado ${data.folio} - ${data.attendeeName}`}
      author="Qlick Marketing Digital"
      subject="Certificado de Asistencia"
      creator="qlick-certificates"
    >
      <Page
        size="A4"
        orientation="landscape"
        style={styles.page}
      >
        {/* ---------- Panel izquierdo morado diagonal ---------- */}
        <Svg
          width={PAGE_WIDTH}
          height={PAGE_HEIGHT}
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <Defs>
            <LinearGradient
              id="purpleGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop offset="0%" stopColor={COLORS.purple700} />
              <Stop offset="100%" stopColor={COLORS.purple900} />
            </LinearGradient>
            <LinearGradient
              id="purpleOverlay"
              x1="0"
              y1="0"
              x2="1"
              y2="1"
            >
              <Stop offset="0%" stopColor="rgba(168,85,247,0.4)" />
              <Stop offset="100%" stopColor="transparent" />
            </LinearGradient>
          </Defs>

          {/* Panel diagonal (38% ancho, corte en 78% abajo) */}
          <Polygon
            points={`0,0 ${PANEL_WIDTH},0 ${PANEL_DIAGONAL_X},${PAGE_HEIGHT} 0,${PAGE_HEIGHT}`}
            fill="url(#purpleGradient)"
          />
          {/* Overlay sutil para textura */}
          <Polygon
            points={`0,0 ${PANEL_WIDTH},0 ${PANEL_DIAGONAL_X},${PAGE_HEIGHT} 0,${PAGE_HEIGHT}`}
            fill="url(#purpleOverlay)"
          />
        </Svg>

        {/* Brand block (Q icon + wordmark) */}
        <View style={styles.brandBlock}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image no soporta alt */}
          <Image src={data.qIconDataUrl} style={styles.qIcon} />
          <Text style={styles.wordmark}>Qlick</Text>
          <Text style={styles.brandTag}>Marketing Digital</Text>
        </View>

        {/* Texto vertical decorativo */}
        <Text style={styles.verticalText}>
          CERTIFICADO · {data.folio}
        </Text>

        {/* Course info en panel izq inferior */}
        <View style={styles.courseInfo}>
          <Text style={styles.courseLabel}>{data.courseLabel}</Text>
          <Text style={styles.courseTitle}>{data.eventTitle}</Text>
          <Text style={styles.courseMeta}>
            {data.eventDate} · {data.eventTime} hrs · {data.eventDuration}
          </Text>
          <Text style={styles.courseMeta}>{data.eventLocation}</Text>
        </View>

        {/* ---------- Right content (62% ancho) ---------- */}
        <View style={styles.rightContent}>
          {/* Eyebrow row */}
          <View style={styles.eyebrowRow}>
            <Text style={styles.eyebrowLabel}>
              Certificado de Asistencia
            </Text>
            <View style={styles.eyebrowFolioBlock}>
              <Text style={styles.eyebrowFolioLabel}>Folio</Text>
              <Text style={styles.eyebrowFolioNum}>{data.folio}</Text>
            </View>
          </View>

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Qlick Award · 2026</Text>
            <Text style={styles.heroPresentedTo}>
              Presentado a
            </Text>
            <Text style={styles.heroName}>
              <Text style={styles.heroNameAccent}>{firstWord}</Text>
              {nameRest ? " " : ""}
              <Text style={styles.heroNameRest}>{nameRest}</Text>
            </Text>

            {/* Deco line con spark diamond */}
            <View style={styles.decoLine}>
              <Svg width="14" height="14">
                <Polygon
                  points="7,0 14,7 7,14 0,7"
                  fill={COLORS.spark}
                />
              </Svg>
            </View>

            <Text style={styles.heroReason}>
              Por completar exitosamente
            </Text>
            <Text style={styles.heroCourse}>{data.eventTitle}</Text>
          </View>

          {/* Bottom: signature + QR */}
          <View style={styles.bottom}>
            <View style={styles.sigBlock}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image no soporta alt */}
              <Image
                src={data.signatureDataUrl}
                style={styles.signature}
              />
              <Text style={styles.instructorName}>{data.instructorName}</Text>
              <Text style={styles.instructorTitle}>
                {data.instructorTitle}
              </Text>
            </View>

            <View style={styles.qrBlock}>
              <View style={styles.qrBox}>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image no soporta alt */}
                <Image src={data.qrDataUrl} style={styles.qrImage} />
              </View>
              <Text style={styles.qrIssueDate}>
                Emitido el {data.issueDate}
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Render API — uso directo (no API route)
// ---------------------------------------------------------------------------

/**
 * Renderiza el PDF a un Buffer (Node) o Blob (browser).
 * Para API routes usa esta version: `await renderCertificatePdf(...)`
 * que devuelve el buffer listo para stream.
 */
export async function renderCertificatePdf(data: CertificateData): Promise<Buffer> {
  // Import dinamico para que @react-pdf/renderer no se cargue en edge runtime
  const { renderToBuffer } = await import("@react-pdf/renderer");
  return await renderToBuffer(<CertificatePDF data={data} />);
}

/**
 * Version sync del render a stream — util para responses directos.
 */
export async function renderCertificateStream(
  data: CertificateData,
): Promise<NodeJS.ReadableStream> {
  const reactPdf = await import("@react-pdf/renderer");
  return reactPdf.renderToStream(<CertificatePDF data={data} />);
}
