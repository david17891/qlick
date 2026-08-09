/**
 * Auditoría agregada, sin PII, del estado administrativo y CRM.
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-admin-state.mjs
 *
 * No imprime nombres, correos, teléfonos, mensajes ni referencias de pago.
 * Su objetivo es conservar evidencia reproducible para decidir qué limpiar.
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(2);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function groupBy(rows, field) {
  return rows.reduce((out, row) => {
    const value = String(row[field] ?? '(null)');
    out[value] = (out[value] ?? 0) + 1;
    return out;
  }, {});
}

function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

function duplicateCount(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = normalize(row[field]);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
}

function dateRange(rows, field) {
  const dates = rows.map((row) => Date.parse(row[field])).filter(Number.isFinite).sort((a, b) => a - b);
  return dates.length === 0 ? null : { first: new Date(dates[0]).toISOString(), last: new Date(dates.at(-1)).toISOString() };
}

function paymentReferenceKind(value) {
  const reference = String(value ?? '').toLowerCase();
  if (!reference) return '(null)';
  if (reference.includes('cs_test_') || reference.includes('pi_test_') || reference.includes('ch_test_')) return 'stripe_test_reference';
  if (reference.includes('cs_live_') || reference.includes('pi_live_') || reference.includes('ch_live_')) return 'stripe_live_reference';
  if (reference.startsWith('manual_admin_')) return 'manual_admin_reference';
  return 'other_reference';
}

function groupPaymentReferences(rows) {
  return rows.reduce((out, row) => {
    const value = paymentReferenceKind(row.external_reference);
    out[value] = (out[value] ?? 0) + 1;
    return out;
  }, {});
}

async function read(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(offset, offset + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

const [courses, modules, lessons, enrollments, lmsPayments, courseAccess, events,
  confirmations, eventPayments, serviceOrders, leads, tasks, interactions,
  conversations, whatsappLog, notes, handoffs, auditLog] = await Promise.all([
  read('courses', 'id, status, created_at'),
  read('modules', 'id, course_id'),
  read('lessons', 'id, module_id'),
  read('enrollments', 'id, user_id, course_id, status, enrolled_at'),
  read('payments', 'id, provider, status, amount_mxn, external_reference, created_at'),
  read('course_access', 'id, user_id, course_id, access_status, access_source, created_at'),
  read('events', 'id, title, status, starts_at, event_rules'),
  read('event_confirmations', 'id, event_id, payment_status'),
  read('event_payments', 'id, confirmation_id, method, status, amount_mxn, external_reference, metadata, created_at'),
  read('service_orders', 'id, status, payment_mode, amount_mxn, created_at'),
  read('leads', 'id, name, email, phone, status, source, intent, owner_id, consent_to_contact, created_at, updated_at'),
  read('crm_tasks', 'id, lead_id, status, due_at, created_at'),
  read('lead_interactions', 'id, lead_id, channel, direction, created_at'),
  read('lead_whatsapp_conversations', 'id, lead_id, phone_normalized, direction, message_type, created_at'),
  read('lead_whatsapp_log', 'id, lead_id, new_status, created_at'),
  read('crm_notes', 'id, lead_id, created_at'),
  read('handoff_requests', 'id, lead_id, status, created_at'),
  read('admin_audit_log', 'id, actor_email, action, entity_type, created_at'),
]);

const leadIds = new Set(leads.map((row) => row.id));
const now = Date.now();
const openTasks = tasks.filter((row) => row.status === 'pending');
const overdueTasks = openTasks.filter((row) => row.due_at && Date.parse(row.due_at) < now);
const leadIdsWithOpenTask = new Set(openTasks.map((row) => row.lead_id));
const leadIdsWithInteraction = new Set(interactions.map((row) => row.lead_id));
const staleLeads = leads.filter((row) => {
  if (!['new', 'contacted'].includes(row.status)) return false;
  if (leadIdsWithOpenTask.has(row.id)) return false;
  const lastActivity = Math.max(Date.parse(row.updated_at), 0);
  return !lastActivity || now - lastActivity > 48 * 60 * 60 * 1000;
});

const eventPaymentTest = eventPayments.filter((row) => {
  const reference = String(row.external_reference ?? '').toLowerCase();
  const metadata = JSON.stringify(row.metadata ?? {}).toLowerCase();
  return row.method === 'simulated_event_payment'
    || reference.includes('cs_test_')
    || reference.includes('pi_test_')
    || metadata.includes('simulated');
});

const confirmationById = new Map(confirmations.map((row) => [row.id, row]));
const testEventIds = new Set(events.filter((row) => {
  const rules = row.event_rules && typeof row.event_rules === 'object' ? row.event_rules : {};
  return String(row.title ?? '').toLowerCase().match(/test|prueba|simul/) || rules.payment_mode === 'test';
}).map((row) => row.id));
const eventPaymentsOnTestEvents = eventPayments.filter((row) => {
  const confirmation = confirmationById.get(row.confirmation_id);
  return confirmation ? testEventIds.has(confirmation.event_id) : false;
});

const orphanCounts = {
  conversations: conversations.filter((row) => row.lead_id && !leadIds.has(row.lead_id)).length,
  interactions: interactions.filter((row) => !leadIds.has(row.lead_id)).length,
  tasks: tasks.filter((row) => !leadIds.has(row.lead_id)).length,
  notes: notes.filter((row) => !leadIds.has(row.lead_id)).length,
  whatsappLog: whatsappLog.filter((row) => !leadIds.has(row.lead_id)).length,
  handoffs: handoffs.filter((row) => !leadIds.has(row.lead_id)).length,
};

const result = {
  generatedAt: new Date().toISOString(),
  lms: {
    courses: courses.length,
    coursesByStatus: groupBy(courses, 'status'),
    modules: modules.length,
    lessons: lessons.length,
    enrollments: enrollments.length,
    enrollmentsByStatus: groupBy(enrollments, 'status'),
    courseAccess: courseAccess.length,
    courseAccessByStatus: groupBy(courseAccess, 'access_status'),
    courseAccessBySource: groupBy(courseAccess, 'access_source'),
    lmsPayments: lmsPayments.length,
    lmsPaymentsByProvider: groupBy(lmsPayments, 'provider'),
    lmsPaymentsByStatus: groupBy(lmsPayments, 'status'),
    lmsPaymentsByReferenceKind: groupPaymentReferences(lmsPayments),
    createdAtRange: dateRange(lmsPayments, 'created_at'),
  },
  eventAndServicePayments: {
    events: events.length,
    eventStatuses: groupBy(events, 'status'),
    eventPayments: eventPayments.length,
    eventPaymentsByMethod: groupBy(eventPayments, 'method'),
    eventPaymentsByStatus: groupBy(eventPayments, 'status'),
    eventPaymentsByReferenceKind: groupPaymentReferences(eventPayments),
    likelyTestPaymentsByReferenceOrMetadata: eventPaymentTest.length,
    paymentsOnLikelyTestEvents: eventPaymentsOnTestEvents.length,
    serviceOrders: serviceOrders.length,
    serviceOrdersByStatus: groupBy(serviceOrders, 'status'),
    serviceOrdersByPaymentMode: groupBy(serviceOrders, 'payment_mode'),
  },
  crm: {
    leads: leads.length,
    leadsByStatus: groupBy(leads, 'status'),
    leadsBySource: groupBy(leads, 'source'),
    leadsByIntent: groupBy(leads, 'intent'),
    leadsWithoutConsent: leads.filter((row) => !row.consent_to_contact).length,
    leadsWithoutOwner: leads.filter((row) => !row.owner_id).length,
    duplicateEmailRows: duplicateCount(leads, 'email'),
    duplicatePhoneRows: duplicateCount(leads, 'phone'),
    openTasks: openTasks.length,
    overdueOpenTasks: overdueTasks.length,
    interactions: interactions.length,
    whatsappConversations: conversations.length,
    whatsappInbound: conversations.filter((row) => row.direction === 'inbound').length,
    whatsappOutbound: conversations.filter((row) => row.direction === 'outbound').length,
    whatsappStatusLogRows: whatsappLog.length,
    notes: notes.length,
    handoffs: handoffs.length,
    adminAuditRows: auditLog.length,
    staleLeadsWithoutOpenTask: staleLeads.length,
    orphanCounts,
    leadsWithNoInteraction: leads.filter((row) => !leadIdsWithInteraction.has(row.id)).length,
    leadCreatedAtRange: dateRange(leads, 'created_at'),
    conversationCreatedAtRange: dateRange(conversations, 'created_at'),
  },
  privacy: {
    printedPersonalData: false,
    printedPaymentReferences: false,
  },
};

console.log(JSON.stringify(result, null, 2));
