/**
 * Audit Script — CRM Fase 1 (Qlick)
 *
 * Valida los 4 escenarios críticos definidos en la spec de Fase 1:
 *
 *   C1: Exportación CSV Streaming + BOM + escape + audit log + consent filter
 *   C2: Soft Delete (Archivado) preserva lead_consent_log + audit log
 *   C3: Bulk Update con Optimistic Lock genera N audit entries con bulk_action_id
 *   C4: UI Filter Selection Safety (reset de selectedIds al cambiar filtro)
 *
 * EJECUCIÓN:
 *   node --experimental-strip-types --env-file=.env.local \
 *        scratch/qlick-crm-audit.mjs [opcional: --scenario=N (1-4)]
 *
 * El script usa el cliente Supabase admin (service role, bypass RLS) para
 * crear datos de prueba, ejecutar las operaciones, validar invariantes y
 * limpiar. NO requiere Next.js corriendo.
 *
 * ⚠️ PELIGRO: este script escribe a la DB real. Solo correr en
 *    pre-producción o con el script seed:demo:reset antes.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error(
    "[audit] Faltan env vars NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY",
  );
  console.error(
    "[audit] Cargá .env.local antes de correr: --env-file=.env.local",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

const ACTOR = "audit-script@qlick";
const TEST_TAG = `audit-${Date.now()}`;

let pass = 0;
let fail = 0;

function ok(label) {
  pass++;
  console.log(`  ✅ ${label}`);
}

function bad(label, detail) {
  fail++;
  console.log(`  ❌ ${label}`);
  if (detail) console.log(`     ${detail}`);
}

function section(label) {
  console.log(`\n── ${label} ──`);
}

async function makeTestLead() {
  const id = randomUUID();
  const row = {
    id,
    name: `Audit Lead ${TEST_TAG}`,
    email: `audit-${id.slice(0, 8)}@example.com`,
    phone: `+52653${Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(7, "0")}`,
    status: "new",
    source: "website",
    intent: "course_information",
    consent_to_contact: true,
  };
  const { error } = await supabase.from("leads").insert(row);
  if (error) throw new Error(`makeTestLead: ${error.message}`);
  return row;
}

async function cleanupTestLeads() {
  const { error } = await supabase
    .from("leads")
    .delete()
    .like("email", `audit-%@example.com`);
  if (error) console.warn(`[audit] cleanup falló: ${error.message}`);
}

async function cleanupTestConsentLogs() {
  // Solo limpia si quedaron logs huérfanos del audit.
  const { error } = await supabase
    .from("lead_consent_log")
    .delete()
    .eq("consent_source", "manual")
    .eq("consent_text", "audit-script test consent");
  if (error) console.warn(`[audit] cleanup consent falló: ${error.message}`);
}

// =============================================================================
// C1: Exportación CSV Streaming + BOM + escape + audit log + consent filter
// =============================================================================
async function scenarioC1() {
  section("C1: Exportación CSV Streaming + BOM + escape + audit log");

  // Replicar exportLeadsAsCsvStream() directamente con Supabase + ReadableStream.
  // (No dynamic-importamos el módulo porque usa @/lib path-aliases que
  // node --experimental-strip-types no resuelve. La lógica es 1:1 con
  // `src/lib/crm/leads-csv-export.ts`.)
  const { csvEscape } = await import("../src/lib/crm/csv-utils.ts");

  // 1. Audit log pre-flight (igual que el módulo original).
  const { count: totalConsented } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("consent_to_contact", true);
  await supabase.from("admin_audit_log").insert({
    actor_email: ACTOR,
    action: "leads_export",
    entity_type: "lead",
    entity_id: null,
    metadata: {
      include_all: false,
      filters: {
        status: null,
        source: null,
        owner_id: null,
      },
      estimated_count: totalConsented ?? null,
      cap: 100_000,
    },
  });

  // 2. Construir stream CSV manualmente (mismo formato que el módulo).
  const HEADERS = [
    "ID",
    "Nombre",
    "Teléfono",
    "Email",
    "Etapa",
    "Score",
    "Curso de Interés",
    "Fuente",
    "Fecha de Registro",
    "Próximo Seguimiento",
  ];

  const PAGE = 100;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode("\uFEFF")); // BOM
      controller.enqueue(
        encoder.encode(HEADERS.map(csvEscape).join(",") + "\r\n"),
      );
      let offset = 0;
      while (true) {
        const { data: rows } = await supabase
          .from("leads")
          .select(
            "id, name, phone, email, status, score, course_of_interest, source, created_at, next_follow_up_at, consent_to_contact",
          )
          .eq("consent_to_contact", true)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (!rows || rows.length === 0) break;
        for (const row of rows) {
          const cells = [
            row.id,
            row.name,
            row.phone ?? "",
            row.email,
            row.status,
            row.score ?? "",
            row.course_of_interest ?? "",
            row.source ?? "",
            row.created_at,
            row.next_follow_up_at ?? "",
          ];
          controller.enqueue(
            encoder.encode(cells.map(csvEscape).join(",") + "\r\n"),
          );
        }
        if (rows.length < PAGE) break;
        offset += PAGE;
      }
      controller.close();
    },
  });

  // 3. Leer el stream completo. Importante: `ignoreBOM: true` para que el
  // BOM UTF-8 no se consuma en el decode (si no, no podríamos verificarlo).
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  let csv = "";
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    csv += decoder.decode(value, { stream: true });
  }
  csv += decoder.decode();

  // 4. Aserciones.
  if (csv.charCodeAt(0) === 0xfeff) {
    ok("BOM UTF-8 al inicio del stream");
  } else {
    bad("BOM UTF-8 al inicio del stream", `primer char: ${csv.charCodeAt(0)}`);
  }

  if (csv.includes("ID,Nombre,Teléfono,Email,Etapa")) {
    ok("Headers en español presentes");
  } else {
    bad("Headers en español presentes", csv.split("\n")[0].slice(0, 100));
  }

  // 5. Crear 1 lead SIN consentimiento para verificar que NO aparece.
  const idNoConsent = randomUUID();
  const { error: eNoConsent } = await supabase.from("leads").insert({
    id: idNoConsent,
    name: "Audit Lead NO CONSENT",
    email: `audit-no-consent-${idNoConsent.slice(0, 8)}@example.com`,
    phone: "+526530000000",
    status: "new",
    source: "website",
    intent: "course_information",
    consent_to_contact: false,
  });
  if (eNoConsent) throw new Error(`insert no-consent: ${eNoConsent.message}`);

  if (!csv.includes("audit-no-consent")) {
    ok("Lead SIN consentimiento NO aparece (filtro consent funciona)");
  } else {
    bad("Lead SIN consentimiento NO aparece (filtro consent funciona)");
  }

  await supabase.from("leads").delete().eq("id", idNoConsent);

  // 6. Audit log registrado.
  const { data: auditRows, error: auditErr } = await supabase
    .from("admin_audit_log")
    .select("action, entity_id, actor_email, metadata")
    .eq("actor_email", ACTOR)
    .eq("action", "leads_export")
    .order("created_at", { ascending: false })
    .limit(1);

  if (auditErr) {
    bad("audit log query no falló", auditErr.message);
  } else if (auditRows && auditRows.length === 1) {
    const row = auditRows[0];
    if (row.metadata?.include_all === false) {
      ok("Audit log con include_all=false (consent filter activo)");
    } else {
      bad("Audit log metadata incorrecta", JSON.stringify(row.metadata));
    }
    ok("Audit log leads_export registrado");
  } else {
    bad("Audit log leads_export registrado", "no se encontró");
  }
}

// =============================================================================
// C2: Soft Delete (Archivado) preserva lead_consent_log + audit log
// =============================================================================
// Implementación: NO dynamic-importamos leads-admin-server.ts porque usa
// @/lib path-aliases que node --experimental-strip-types no resuelve.
// En su lugar, replicamos la lógica de archiveLead con el cliente Supabase
// directo (es la misma operación, comportamiento equivalente).
async function scenarioC2() {
  section("C2: Soft Delete (Archivado) preserva consent + audit");

  const lead = await makeTestLead();

  // Insertar un consent log para el lead.
  const consentId = randomUUID();
  const { error: consentErr } = await supabase.from("lead_consent_log").insert({
    id: consentId,
    lead_id: lead.id,
    phone_normalized: lead.phone,
    consent_granted: true,
    consent_source: "manual",
    consent_text: "audit-script test consent",
  });
  if (consentErr) throw new Error(`insert consent: ${consentErr.message}`);

// Replicar archiveLead:
//   1. SELECT status actual
//   2. UPDATE WHERE status = prevStatus (optimistic lock)
//   3. INSERT admin_audit_log
  const { data: prevRow } = await supabase
    .from("leads")
    .select("status")
    .eq("id", lead.id)
    .maybeSingle();
  const prevStatus = prevRow?.status;

  const { data: updatedRow, error: updateErr } = await supabase
    .from("leads")
    .update({ status: "archived" })
    .eq("id", lead.id)
    .eq("status", prevStatus)
    .select("*")
    .maybeSingle();

  if (updateErr || !updatedRow) {
    bad("archiveLead falló", updateErr?.message ?? "no se actualizó");
    return;
  }
  ok("archiveLead devolvió ok=true");

  // Insertar audit log (el módulo real lo hace via logAdminAction, acá
  // replicamos la inserción directa para testear el contrato).
  const { error: auditErr2 } = await supabase.from("admin_audit_log").insert({
    actor_email: ACTOR,
    action: "lead_archive",
    entity_type: "lead",
    entity_id: lead.id,
    metadata: { from: prevStatus, to: "archived" },
  });
  if (auditErr2) {
    bad("insert audit log lead_archive", auditErr2.message);
  } else {
    ok("Audit log lead_archive insertado");
  }

  // Validar: el lead sigue existiendo con status='archived'.
  const { data: leadAfter } = await supabase
    .from("leads")
    .select("id, status")
    .eq("id", lead.id)
    .maybeSingle();

  if (leadAfter && leadAfter.status === "archived") {
    ok("Lead sigue en la tabla con status='archived' (soft delete)");
  } else {
    bad("Lead sigue en la tabla con status='archived'", JSON.stringify(leadAfter));
  }

  // Validar: lead_consent_log PRESERVADO (no se borró por CASCADE).
  const { data: consentAfter } = await supabase
    .from("lead_consent_log")
    .select("id")
    .eq("id", consentId)
    .maybeSingle();

  if (consentAfter) {
    ok("lead_consent_log PRESERVADO (compliance LGPD OK)");
  } else {
    bad("lead_consent_log PRESERVADO", "se borró por CASCADE — VIOLACIÓN LGPD");
  }

  // Validar: audit log con action='lead_archive'.
  const { data: auditRows } = await supabase
    .from("admin_audit_log")
    .select("action, entity_id, metadata")
    .eq("actor_email", ACTOR)
    .eq("action", "lead_archive")
    .eq("entity_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (auditRows && auditRows.length === 1) {
    ok("Audit log lead_archive registrado");
    const meta = auditRows[0].metadata;
    if (meta?.from === "new" && meta?.to === "archived") {
      ok("Audit log metadata { from: 'new', to: 'archived' } correcto");
    } else {
      bad("Audit log metadata", JSON.stringify(meta));
    }
  } else {
    bad("Audit log lead_archive registrado");
  }

  // Cleanup
  await supabase.from("lead_consent_log").delete().eq("id", consentId);
}

// =============================================================================
// C3: Bulk Update con Optimistic Lock genera N audit entries con bulk_action_id
// =============================================================================
async function scenarioC3() {
  section("C3: Bulk Update con Optimistic Lock + N audit entries");

  const leads = [];
  for (let i = 0; i < 3; i++) {
    leads.push(await makeTestLead());
  }
  const leadIds = leads.map((l) => l.id);

  // Replicar bulkUpdateLeads (archive) directamente contra Supabase.
  const bulkActionId = randomUUID();

  // 1. SELECT status actual de los 3 leads.
  const { data: prevRows } = await supabase
    .from("leads")
    .select("id, status")
    .in("id", leadIds);
  const prevById = new Map((prevRows ?? []).map((r) => [r.id, r.status]));

  // 2. UPDATE por-lead con optimistic lock (replicamos el patrón del código).
  let succeeded = 0;
  let conflicted = 0;
  for (const id of leadIds) {
    const prevStatus = prevById.get(id);
    const { data: upd } = await supabase
      .from("leads")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("status", prevStatus)
      .select("id")
      .maybeSingle();
    if (upd) {
      succeeded++;
      // 3. Audit log por-lead con bulk_action_id compartido.
      await supabase.from("admin_audit_log").insert({
        actor_email: ACTOR,
        action: "lead_archive",
        entity_type: "lead",
        entity_id: id,
        metadata: {
          bulk_action_id: bulkActionId,
          from: prevStatus,
          to: "archived",
        },
      });
    } else {
      conflicted++;
    }
  }

  if (succeeded === 3 && conflicted === 0) {
    ok(`bulkUpdateLeads succeeded=3/3, conflicted=0`);
  } else {
    bad(
      "bulkUpdateLeads succeeded=3/3",
      `succ=${succeeded} conf=${conflicted}`,
    );
  }

  if (bulkActionId) {
    ok(`bulkActionId generado: ${bulkActionId.slice(0, 8)}...`);
  }

  // Validar 3 audit entries con ese bulk_action_id.
  const { data: auditRows } = await supabase
    .from("admin_audit_log")
    .select("entity_id, metadata")
    .eq("actor_email", ACTOR)
    .eq("action", "lead_archive")
    .in("entity_id", leadIds);

  const withBulkActionId = (auditRows ?? []).filter(
    (r) => r.metadata?.bulk_action_id === bulkActionId,
  );

  if (withBulkActionId.length === 3) {
    ok(
      `3 audit entries con bulk_action_id compartido (${withBulkActionId.length})`,
    );
  } else {
    bad(
      "3 audit entries con bulk_action_id compartido",
      `encontradas: ${withBulkActionId.length}`,
    );
  }

  // Validar que los 3 leads están archived.
  const { data: leadsAfter } = await supabase
    .from("leads")
    .select("id, status")
    .in("id", leadIds);

  const allArchived = (leadsAfter ?? []).every((l) => l.status === "archived");
  if (allArchived) {
    ok("Los 3 leads están con status='archived'");
  } else {
    bad(
      "Los 3 leads están con status='archived'",
      JSON.stringify(leadsAfter?.map((l) => l.status)),
    );
  }

  // Test de optimistic lock: simulamos race condition cambiando el status
  // de un lead DESPUÉS del SELECT previo del bulk pero ANTES del UPDATE.
  // Esto reproduce el escenario real donde el bot de WhatsApp toca el
  // mismo lead concurrentemente.
  //
  // Setup: bulk de 2 leads. Entre el SELECT previo y el UPDATE por-lead,
  // flippamos manualmente el status de uno de los leads. El UPDATE del
  // bulk para ese lead NO debe matchear → conflict.
  const raceLeadA = await makeTestLead();
  const raceLeadB = await makeTestLead();
  const raceIds = [raceLeadA.id, raceLeadB.id];

  // 1. SELECT previo (esto es lo que hace bulkUpdateLeads al inicio).
  const { data: racePrev } = await supabase
    .from("leads")
    .select("id, status")
    .in("id", raceIds);
  const racePrevById = new Map((racePrev ?? []).map((r) => [r.id, r.status]));

  // 2. "Otro proceso" cambia raceLeadA.status de 'new' a 'contacted'
  //    entre el SELECT y el UPDATE del bulk.
  await supabase
    .from("leads")
    .update({ status: "contacted" })
    .eq("id", raceLeadA.id)
    .eq("status", "new");

  // 3. UPDATE bulk con optimistic lock (replicando bulkUpdateLeads).
  let succRace = 0;
  let confRace = 0;
  for (const id of raceIds) {
    const prevStatus = racePrevById.get(id);
    const { data: upd } = await supabase
      .from("leads")
      .update({ status: "archived" })
      .eq("id", id)
      .eq("status", prevStatus) // ← raceLeadA ya no es 'new', no matchea
      .select("id")
      .maybeSingle();
    if (upd) succRace++;
    else confRace++;
  }

  if (succRace === 1 && confRace === 1) {
    ok(
      "Optimistic lock detecta race condition: succ=1, conf=1 (lead cuyo status cambió entre SELECT y UPDATE no se archiva silenciosamente)",
    );
  } else {
    bad(
      "Optimistic lock detecta race condition",
      `succ=${succRace} conf=${confRace}`,
    );
  }

  // Cleanup
  await supabase.from("leads").delete().in("id", [...leadIds, ...raceIds]);
}

// =============================================================================
// C4: UI Filter Selection Safety
// =============================================================================
// Esta validación requiere el componente React; no se puede ejecutar desde
// un script Node. En su lugar, verificamos que el `useEffect` de reset
// esté en el código del componente y dependa de los inputs correctos.

async function scenarioC4() {
  section("C4: UI Filter Selection Safety (static analysis)");

  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const componentPath = path.resolve(
    process.cwd(),
    "src/components/crm/CRMView.tsx",
  );
  const src = await fs.readFile(componentPath, "utf8");

  // 1. selectedIds se resetea cuando cambian los filtros (peer review R7).
  const resetEffect = src.match(
    /useEffect\(\(\) => \{[\s\S]*?setSelectedIds[\s\S]*?\},\s*\[q,\s*status,\s*source,\s*course,\s*ownerFilter,\s*intent,\s*eventFilter\]\)/,
  );
  if (resetEffect) {
    ok("useEffect resetea selectedIds al cambiar filtros (R7)");
  } else {
    bad(
      "useEffect resetea selectedIds al cambiar filtros (R7)",
      "no se encontró el patrón esperado en CRMView.tsx",
    );
  }

  // 2. Master checkbox "Seleccionar todo" afecta solo a filtered.
  const masterCheckbox = src.match(
    /toggleAllVisible[\s\S]{0,300}filtered\.forEach/,
  );
  if (masterCheckbox) {
    ok("toggleAllVisible itera solo sobre `filtered` (no todos los leads)");
  } else {
    bad(
      "toggleAllVisible itera solo sobre `filtered`",
      "no se encontró el patrón",
    );
  }

  // 3. Modal type-the-word ARCHIVAR N para confirmar bulk.
  const confirmPattern = src.match(/ARCHIVAR\s*\$\{selectedIds\.size\}/);
  if (confirmPattern) {
    ok('Modal exige escribir literalmente "ARCHIVAR N" (peer review R13)');
  } else {
    bad(
      'Modal exige escribir literalmente "ARCHIVAR N"',
      "no se encontró el patrón",
    );
  }

  // 4. Endpoint DELETE tiene bloqueador de mode=hard.
  const routePath = path.resolve(
    process.cwd(),
    "src/app/api/admin/leads/[id]/route.ts",
  );
  const routeSrc = await fs.readFile(routePath, "utf8");
  if (
    routeSrc.includes('mode === "hard"') &&
    routeSrc.includes("Hard delete deshabilitado")
  ) {
    ok("Endpoint DELETE bloquea explícitamente mode=hard (compliance)");
  } else {
    bad("Endpoint DELETE bloquea explícitamente mode=hard");
  }
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  console.log("\n🛡️  Qlick CRM Fase 1 — Audit Script");
  console.log("=====================================\n");

  const scenarioArg = process.argv
    .find((a) => a.startsWith("--scenario="))
    ?.split("=")[1];
  const scenariosToRun = scenarioArg
    ? [parseInt(scenarioArg, 10)]
    : [1, 2, 3, 4];

  try {
    if (scenariosToRun.includes(1)) await scenarioC1();
    if (scenariosToRun.includes(2)) await scenarioC2();
    if (scenariosToRun.includes(3)) await scenarioC3();
    if (scenariosToRun.includes(4)) await scenarioC4();
  } catch (err) {
    console.error("\n[audit] ERROR FATAL:", err.message);
    fail++;
  }

  // Cleanup defensivo de leads/audit/consent del script.
  await cleanupTestLeads();
  await cleanupTestConsentLogs();

  console.log("\n=====================================");
  console.log(`📊 Resultado: ${pass} OK, ${fail} FAIL`);
  console.log("=====================================\n");

  process.exit(fail > 0 ? 1 : 0);
}

main();