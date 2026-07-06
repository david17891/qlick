/**
 * Promotion Engine — automatiza transiciones de status + tareas CRM
 * según el score calculado de la encuesta.
 *
 * Server-only. Best-effort: si falla una sub-operación (update status,
 * insert task, notify admin), NO rompe la promoción — solo loggea.
 *
 * Diseño (feat/funnel-dynamic-surveys-crm, 2026-07-05):
 * - Encapsula la lógica de "qué pasa después de que un lead responde
 *   la encuesta". Antes (Fase 7d.1) era decisión manual del admin
 *   desde la tab Encuestas. Ahora (Fase 7d.2) auto-promoción con
 *   el flag `isConsent` y reglas de score.
 * - Thresholds hardcoded en Fase 1. Cuando David quiera reglas por
 *   evento, se extrae a `event_survey_templates.promotion_rules` jsonb
 *   (sin tocar el contrato público de `applyPromotionRules`).
 *
 * @server
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeadQualification } from "@/types/crm";
import type { SurveyScoreResult } from "./lead-scoring";

export interface PromotionContext {
  /** Cliente Supabase service-role. NULL = modo demo (no persiste). */
  supabase: SupabaseClient | null;
  /** Email del admin que dispara la promotion (audit). */
  actorEmail: string;
  /** Email del lead (para notificar al admin). */
  leadEmail: string | null;
  /** Nombre del lead. */
  leadName: string | null;
  /** Título del evento (para notificar). */
  eventTitle: string;
}

export interface PromotionResult {
  ok: boolean;
  /** Status al que se movió el lead (o el actual si no hubo cambio). */
  newStatus: string | null;
  /** Si se creó una tarea CRM. */
  taskCreated: boolean;
  /** Si se notificó al admin. */
  adminNotified: boolean;
  /** Notas para debug. */
  notes: string[];
}

/**
 * Umbrales por defecto. Documentados en `docs/FUNNEL_DESIGN.md` (futuro).
 * Hardcoded en Fase 1 — extraer a jsonb por evento en Fase 8+.
 */
const QUALIFICATION_THRESHOLDS = {
  mql: 60,
  hot: 40,
  warm: 20,
} as const;

/**
 * Aplica las reglas de promoción al lead.
 *
 * Reglas (Fase 1, hardcoded):
 * - score >= 60 (MQL): status = "qualified", task "HOT LEAD - Llamar", admin notified.
 * - score 40-59 (Hot): status = "contacted", task "Llamar para calificar".
 * - score 20-39 (Warm): status = "contacted", task "Enviar temario".
 * - score < 20 (Cold): sin cambios (status se queda en survey_completed).
 *
 * Best-effort: si falla una sub-operación, sigue con las demás.
 *
 * Server-only.
 */
export async function applyPromotionRules(
  leadId: string,
  scoreResult: SurveyScoreResult,
  ctx: PromotionContext,
): Promise<PromotionResult> {
  const result: PromotionResult = {
    ok: false,
    newStatus: null,
    taskCreated: false,
    adminNotified: false,
    notes: [],
  };

  if (!ctx.supabase) {
    result.notes.push("Modo demo: no se aplicaron reglas.");
    return result;
  }

  const score = scoreResult.score;
  const qualification = scoreResult.qualification;

  // 1) Determinar nuevo status según score
  let newStatus: string | null = null;
  let taskTitle: string | null = null;
  let taskPriority: "high" | "medium" | "low" | null = null;
  let notifyAdmin = false;

  if (score >= QUALIFICATION_THRESHOLDS.mql) {
    newStatus = "qualified";
    taskTitle = `🔥 HOT LEAD — Llamar esta semana (score ${score})`;
    taskPriority = "high";
    notifyAdmin = true;
    result.notes.push(`MQL (score ${score}) → qualified + task + notify`);
  } else if (score >= QUALIFICATION_THRESHOLDS.hot) {
    newStatus = "contacted";
    taskTitle = `Llamar para calificar (score ${score})`;
    taskPriority = "medium";
    result.notes.push(`Hot (score ${score}) → contacted + task`);
  } else if (score >= QUALIFICATION_THRESHOLDS.warm) {
    newStatus = "contacted";
    taskTitle = `Enviar temario del curso (score ${score})`;
    taskPriority = "low";
    result.notes.push(`Warm (score ${score}) → contacted + task`);
  } else {
    result.notes.push(`Cold (score ${score}) → sin cambios`);
  }

  // 2) Update lead status (best-effort)
  if (newStatus) {
    try {
      const { error } = await ctx.supabase
        .from("leads" as never)
        .update({
          status: newStatus,
          score,
          qualification,
          last_contacted_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, leadId);
      if (error) {
        result.notes.push(
          `Update lead status falló: ${(error as { code?: string }).code ?? "unknown"}`,
        );
      } else {
        result.newStatus = newStatus;
      }
    } catch (err) {
      result.notes.push(
        `Update lead status threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 3) Insertar CRM task (best-effort)
  if (taskTitle && newStatus) {
    try {
      const dueInDays = taskPriority === "high" ? 1 : taskPriority === "medium" ? 3 : 7;
      const dueAt = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000).toISOString();
      const { error } = await ctx.supabase.from("crm_tasks" as never).insert({
        lead_id: leadId,
        title: taskTitle,
        priority: taskPriority,
        due_at: dueAt,
        status: "pending",
        // FIX 2026-07-06 (QA funnel-simulation-tester, bug #3): la
        // columna `created_by_email` de `crm_tasks` es NOT NULL pero
        // el Promotion Engine no la seteaba, generando 23502 (not-null
        // violation). FIX 2026-07-06 (audit F5): fallback a "system@qlick"
        // si actorEmail es null/undefined (caso path admin action sin
        // email de actor).
        created_by_email: ctx.actorEmail?.trim() || "system@qlick",
      } as never);
      if (error) {
        result.notes.push(
          `Insert task falló: ${(error as { code?: string }).code ?? "unknown"}`,
        );
      } else {
        result.taskCreated = true;
      }
    } catch (err) {
      result.notes.push(
        `Insert task threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4) Audit log de la promoción (best-effort).
  //    FIX 2026-07-06 (audit F4): antes solo se loggeaba cuando el lead
  //    era MQL (notifyAdmin=true). Ahora TODAS las promociones se
  //    loggean en admin_audit_log con action="lead_promoted" y la
  //    qualification en metadata, para que el admin tenga visibilidad
  //    del funnel completo en el panel /admin/system/audit-log.
  //    Para MQL, además se notifica vía email (futuro Brevo).
  if (newStatus) {
    try {
      await ctx.supabase.from("admin_audit_log" as never).insert({
        actor_email: ctx.actorEmail?.trim() || "system@qlick",
        action: "lead_promoted",
        entity_type: "lead",
        entity_id: leadId,
        metadata: {
          score,
          qualification,
          newStatus,
          taskPriority,
          leadEmail: ctx.leadEmail,
          leadName: ctx.leadName,
          eventTitle: ctx.eventTitle,
          notifyAdmin,
        },
      } as never);
      result.adminNotified = notifyAdmin;
    } catch (err) {
      result.notes.push(
        `Audit log failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  result.ok = true;
  return result;
}

/**
 * Decide qué bucket de follow-up usar según el score.
 * Expuesto para que el bot engine elija el mensaje post-encuesta.
 */
export function selectFollowUpBucket(score: number): "mql" | "hot" | "coldWarm" {
  if (score >= QUALIFICATION_THRESHOLDS.mql) return "mql";
  if (score >= QUALIFICATION_THRESHOLDS.hot) return "hot";
  return "coldWarm";
}

// Re-export para que callers no tengan que importar dos archivos
export type { LeadQualification };