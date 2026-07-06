/**
 * Query: leads calientes (hot/mql) sin actividad reciente.
 *
 * FIX 2026-07-05 (feat/funnel-dynamic-surveys-crm, commit 12):
 * vista priorizada para el CRM. El admin ve los leads que vale la pena
 * contactar primero, ordenados por score DESC.
 *
 * Criterios:
 * - qualification IN ('hot', 'mql')
 * - status NOT IN ('enrolled', 'lost', 'archived')
 * - last_contacted_at IS NULL OR < ahora - 3 días
 * - ORDER BY score DESC LIMIT 20
 *
 * Server-only.
 */

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkSupabaseConfig } from "@/lib/supabase/health";

const DAYS_WITHOUT_CONTACT = 3;
const MAX_RESULTS = 20;

export interface HotLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  qualification: string | null;
  status: string | null;
  lastContactedAt: string | null;
}

export async function getHotLeadsWithoutRecentActivity(): Promise<HotLead[]> {
  if (!checkSupabaseConfig().configured) {
    return [];
  }
  const supabase = createSupabaseAdminClient();
  const cutoff = new Date(
    Date.now() - DAYS_WITHOUT_CONTACT * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await supabase
    .from("leads" as never)
    .select(
      "id, name, email, phone, score, qualification, status, last_contacted_at" as never,
    )
    .in("qualification" as never, ["hot", "mql"])
    .not("status" as never, "in", "(enrolled,lost,archived)")
    .or(
      `last_contacted_at.is.null,last_contacted_at.lt.${cutoff}` as never,
    )
    .order("score" as never, { ascending: false })
    .limit(MAX_RESULTS);

  if (error || !data) return [];

  return (data as Array<{
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    score: number | null;
    qualification: string | null;
    status: string | null;
    last_contacted_at: string | null;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    score: row.score,
    qualification: row.qualification,
    status: row.status,
    lastContactedAt: row.last_contacted_at,
  }));
}