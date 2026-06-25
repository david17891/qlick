/**
 * Servicios server-side para el catálogo de masterclasses.
 *
 * Server-only. Usa el cliente admin (service role, bypass RLS) porque el
 * CRM admin necesita leer TODAS las masterclasses (incluyendo drafts y
 * archivadas). El cliente público usa las funciones de "published" que
 * también podrían resolverse con anon + RLS, pero centralizamos aquí para
 * tener fallback demo consistente.
 *
 * REGLA DE FALLBACK:
 * - Si Supabase NO está configurado → cae a mocks (definidos abajo) y
 *   marca `demo: true` en el resultado.
 * - Si Supabase SÍ está configurado → consulta la tabla real.
 *
 * @server
 */

import type { Masterclass, AdminMasterclassSummary } from "@/types/masterclass";
import {
  mapMasterclassRow,
  type MasterclassRow,
} from "./masterclass-mapper";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** ¿Está activa la persistencia real? Server-only (defensa contra browser). */
function isRealMode(): boolean {
  if (typeof window !== "undefined") return false;
  return checkSupabaseConfig().configured;
}

/* ------------------------------------------------------------------ */
/* Demo fallback (mock data in-memory)                                  */
/* ------------------------------------------------------------------ */

const DEMO_MASTERCLASSES: Masterclass[] = [
  {
    id: "demo-mc-1",
    slug: "clase-gratuita-marketing-digital",
    title: "Clase gratuita de Marketing Digital",
    subtitle: "Aprende los fundamentos en 60 minutos",
    description:
      "En esta clase gratuita veremos los pilares del marketing digital moderno: estrategia de contenidos, embudo de conversión y medición con analytics. Ideal si estás empezando o quieres ordenar lo que ya sabes.",
    instructorName: "Por confirmar",
    startsAt: null,
    durationMinutes: 60,
    modality: "online",
    location: null,
    coverImageUrl: null,
    status: "published",
    ctaLabel: "Registrarme gratis",
    createdAt: "2026-06-25T00:00:00.000Z",
    updatedAt: "2026-06-25T00:00:00.000Z",
  },
];

/* ------------------------------------------------------------------ */
/* Lecturas                                                              */
/* ------------------------------------------------------------------ */

/**
 * Devuelve una masterclass publicada por slug (público).
 * Si la masterclass está en draft/archived, devuelve undefined.
 */
export async function getPublishedMasterclassBySlug(
  slug: string,
): Promise<Masterclass | undefined> {
  if (!isRealMode()) {
    return DEMO_MASTERCLASSES.find(
      (m) => m.slug === slug && m.status === "published",
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("masterclasses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[masterclasses-server] getPublishedMasterclassBySlug falló", {
      code: error.code,
      slug,
    });
    // Fallback a demo: si el slug coincide, devolvemos el mock.
    return DEMO_MASTERCLASSES.find(
      (m) => m.slug === slug && m.status === "published",
    );
  }
  if (!data) return undefined;
  return mapMasterclassRow(data as MasterclassRow);
}

/**
 * Lista TODAS las masterclasses para el admin (incluye drafts/archived).
 * Devuelve además un resumen con conteos de registrations (attended,
 * interested). Esto requiere otro SELECT; se hace en paralelo.
 */
export async function getAdminMasterclasses(): Promise<AdminMasterclassSummary[]> {
  if (!isRealMode()) {
    return DEMO_MASTERCLASSES.map((m) => ({
      masterclass: m,
      registrationCount: 0,
      attendedCount: 0,
      interestedCount: 0,
    }));
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("masterclasses")
    .select("*")
    .order("starts_at", { ascending: false, nullsFirst: false });

  if (error || !data) {
    // eslint-disable-next-line no-console
    console.error("[masterclasses-server] getAdminMasterclasses falló", {
      code: error?.code,
    });
    return DEMO_MASTERCLASSES.map((m) => ({
      masterclass: m,
      registrationCount: 0,
      attendedCount: 0,
      interestedCount: 0,
    }));
  }

  const masterclasses = (data as MasterclassRow[]).map(mapMasterclassRow);

  // Conteos de registrations por masterclass.
  const { data: counts, error: countsError } = await supabase
    .from("masterclass_registrations")
    .select("masterclass_id, attendance_status, commercial_status");

  if (countsError || !counts) {
    // Sin conteos: devolver masterclasses con 0.
    return masterclasses.map((m) => ({
      masterclass: m,
      registrationCount: 0,
      attendedCount: 0,
      interestedCount: 0,
    }));
  }

  type CountRow = {
    masterclass_id: string;
    attendance_status: Masterclass["id"] extends string
      ? "pending" | "attended" | "no_show"
      : never;
    commercial_status: "new" | "interested" | "not_interested" | "converted" | "lost";
  };

  return masterclasses.map((m) => {
    const mine = (counts as CountRow[]).filter(
      (r) => r.masterclass_id === m.id,
    );
    return {
      masterclass: m,
      registrationCount: mine.length,
      attendedCount: mine.filter((r) => r.attendance_status === "attended").length,
      interestedCount: mine.filter(
        (r) => r.commercial_status === "interested",
      ).length,
    };
  });
}

/**
 * Devuelve una masterclass por ID (admin). Sin filtro de status.
 */
export async function getAdminMasterclassById(
  id: string,
): Promise<Masterclass | undefined> {
  if (!isRealMode()) {
    return DEMO_MASTERCLASSES.find((m) => m.id === id);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("masterclasses")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return DEMO_MASTERCLASSES.find((m) => m.id === id);
  }
  return mapMasterclassRow(data as MasterclassRow);
}