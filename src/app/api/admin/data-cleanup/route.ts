import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { checkSupabaseConfig } from "@/lib/supabase/health";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/crm/audit-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CleanupScope = "lms" | "lms_payments" | "event_test_payments";

type Row = Record<string, unknown>;
type DbResult = { data?: unknown; count?: number | null; error?: { message: string } | null };

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row && typeof row === "object")) : [];
}

async function getRows(supabase: ReturnType<typeof createSupabaseAdminClient>, table: string, columns: string): Promise<Row[]> {
  const { data, error } = await (supabase.from(table as never).select(columns) as unknown as Promise<DbResult>);
  if (error) throw new Error(`${table}: ${error.message}`);
  return asRows(data);
}

async function getCount(supabase: ReturnType<typeof createSupabaseAdminClient>, table: string): Promise<number> {
  const { count, error } = await (supabase.from(table as never).select("id", { count: "exact", head: true }) as unknown as Promise<DbResult>);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

function isTestReference(value: unknown): boolean {
  const reference = String(value ?? "").toLowerCase();
  return reference.includes("cs_test_") || reference.includes("pi_test_") || reference.includes("ch_test_");
}

function isLikelyTestEvent(event: Row): boolean {
  const title = String(event.title ?? "").toLowerCase();
  const rules = event.event_rules && typeof event.event_rules === "object" ? event.event_rules as Row : {};
  return /test|prueba|simul/.test(title) || rules.payment_mode === "test";
}

async function getMaintenanceSnapshot() {
  const supabase = createSupabaseAdminClient();
  const [courses, lmsPayments, events, confirmations, eventPayments, serviceOrders,
    leads, tasks, interactionCount, conversationCount, notesCount, handoffRows] = await Promise.all([
    getRows(supabase, "courses", "id, status"),
    getRows(supabase, "payments", "id, provider, status, external_reference"),
    getRows(supabase, "events", "id, title, event_rules"),
    getRows(supabase, "event_confirmations", "id, event_id"),
    getRows(supabase, "event_payments", "id, confirmation_id, method, external_reference, metadata"),
    getRows(supabase, "service_orders", "id, payment_mode, status"),
    getRows(supabase, "leads", "id, status, owner_id, email, phone, consent_to_contact, updated_at"),
    getRows(supabase, "crm_tasks", "id, lead_id, status, due_at"),
    getCount(supabase, "lead_interactions"),
    getCount(supabase, "lead_whatsapp_conversations"),
    getCount(supabase, "crm_notes"),
    getRows(supabase, "handoff_requests", "id, lead_id"),
  ]);

  const likelyTestEventIds = new Set(events.filter(isLikelyTestEvent).map((event) => String(event.id)));
  const confirmationEventIds = new Map(confirmations.map((row) => [String(row.id), String(row.event_id)]));
  const testEventPaymentIds = eventPayments.filter((payment) => {
    const eventId = confirmationEventIds.get(String(payment.confirmation_id));
    const metadata = JSON.stringify(payment.metadata ?? {}).toLowerCase();
    return payment.method === "simulated_event_payment"
      || isTestReference(payment.external_reference)
      || metadata.includes("simulated")
      || (eventId ? likelyTestEventIds.has(eventId) : false);
  }).map((payment) => String(payment.id));

  const leadIds = new Set(leads.map((lead) => String(lead.id)));
  const openTasks = tasks.filter((task) => task.status === "pending");
  const overdueTasks = openTasks.filter((task) => task.due_at && Date.parse(String(task.due_at)) < Date.now());
  const duplicateRows = (field: string) => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const value = String(lead[field] ?? "").trim().toLowerCase().replace(/\s+/g, "");
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  };
  const leadIdsWithOpenTask = new Set(openTasks.map((task) => String(task.lead_id)));
  const staleLeads = leads.filter((lead) => ["new", "contacted"].includes(String(lead.status))
    && !leadIdsWithOpenTask.has(String(lead.id))
    && Date.now() - Date.parse(String(lead.updated_at)) > 48 * 60 * 60 * 1000).length;

  return {
    cleanup: {
      lms: { courses: courses.length, payments: lmsPayments.length },
      eventTestPayments: testEventPaymentIds.length,
      serviceTestOrders: serviceOrders.filter((order) => order.payment_mode === "test").length,
    },
    crm: {
      leads: leads.length,
      withoutOwner: leads.filter((lead) => !lead.owner_id).length,
      withoutConsent: leads.filter((lead) => !lead.consent_to_contact).length,
      duplicateEmailRows: duplicateRows("email"),
      duplicatePhoneRows: duplicateRows("phone"),
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      staleLeadsWithoutOpenTask: staleLeads,
      interactions: interactionCount,
      conversations: conversationCount,
      notes: notesCount,
      orphanHandoffs: handoffRows.filter((row) => row.lead_id && !leadIds.has(String(row.lead_id))).length,
    },
  };
}

async function guard() {
  if (!checkSupabaseConfig().configured) {
    return { response: NextResponse.json({ ok: false, error: "Supabase no configurado." }, { status: 501 }) };
  }
  const admin = await requireAdmin();
  if (!admin) {
    return { response: NextResponse.json({ ok: false, error: "No autenticado como admin." }, { status: 401 }) };
  }
  return { admin };
}

export async function GET() {
  const auth = await guard();
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ ok: true, ...(await getMaintenanceSnapshot()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo auditar el estado." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await guard();
  if ("response" in auth) return auth.response;

  let body: { scope?: unknown; confirmation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const scope = body.scope;
  const validScopes: CleanupScope[] = ["lms", "lms_payments", "event_test_payments"];
  if (!validScopes.includes(scope as CleanupScope)) {
    return NextResponse.json({ ok: false, error: "Alcance de limpieza no permitido." }, { status: 400 });
  }
  const cleanupScope = scope as CleanupScope;
  const requiredConfirmation = cleanupScope === "lms" ? "ELIMINAR LMS"
    : cleanupScope === "lms_payments" ? "ELIMINAR PAGOS LMS"
      : "ELIMINAR PAGOS DE PRUEBA";
  if (body.confirmation !== requiredConfirmation) {
    return NextResponse.json({ ok: false, error: `Escribe exactamente: ${requiredConfirmation}` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const deleted: Record<string, number> = {};
  try {
    if (cleanupScope === "lms" || cleanupScope === "lms_payments") {
      if (cleanupScope === "lms") {
        deleted.payments = await getCount(supabase, "payments");
        deleted.courseAccess = await getCount(supabase, "course_access");
        deleted.enrollments = await getCount(supabase, "enrollments");
        deleted.courses = await getCount(supabase, "courses");
        for (const table of ["payments", "course_access", "enrollments", "courses"] as const) {
          const { error } = await (supabase.from(table as never).delete().not("id", "is", null) as unknown as Promise<DbResult>);
          if (error) throw new Error(`${table}: ${error.message}`);
        }
      } else {
        deleted.payments = await getCount(supabase, "payments");
        const { error } = await (supabase.from("payments" as never).delete().not("id", "is", null) as unknown as Promise<DbResult>);
        if (error) throw new Error(`payments: ${error.message}`);
      }
    } else {
      const events = await getRows(supabase, "events", "id, title, event_rules");
      const confirmations = await getRows(supabase, "event_confirmations", "id, event_id");
      const eventPayments = await getRows(supabase, "event_payments", "id, confirmation_id, method, external_reference, metadata");
      const testEventIds = new Set(events.filter(isLikelyTestEvent).map((event) => String(event.id)));
      const eventByConfirmation = new Map(confirmations.map((row) => [String(row.id), String(row.event_id)]));
      const ids = eventPayments.filter((payment) => {
        const eventId = eventByConfirmation.get(String(payment.confirmation_id));
        const metadata = JSON.stringify(payment.metadata ?? {}).toLowerCase();
        return payment.method === "simulated_event_payment"
          || isTestReference(payment.external_reference)
          || metadata.includes("simulated")
          || (eventId ? testEventIds.has(eventId) : false);
      }).map((payment) => String(payment.id));
      deleted.eventPayments = ids.length;
      if (ids.length > 0) {
        const { error } = await (supabase.from("event_payments" as never).delete().in("id", ids) as unknown as Promise<DbResult>);
        if (error) throw new Error(`event_payments: ${error.message}`);
      }
    }

    await logAdminAction({
      actor_email: auth.admin.email,
      action: "data_cleanup",
      entity_type: "data_scope",
      entity_id: cleanupScope,
      metadata: { deleted },
    });
    return NextResponse.json({ ok: true, scope: cleanupScope, deleted });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "La limpieza quedó incompleta." }, { status: 500 });
  }
}
