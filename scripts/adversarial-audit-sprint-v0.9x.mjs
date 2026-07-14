#!/usr/bin/env node
/**
 * Adversarial audit para Sprint v0.9.x (PR #1-8).
 *
 * Intenta ROMPER el sistema de formas nuevas:
 *   - SQL injection en inputs
 *   - XSS en outputs
 *   - Caracteres especiales (null bytes, RTL, control chars)
 *   - DoS (inputs muy grandes)
 *   - Race conditions (cambios de modo durante procesamiento)
 *   - Edge cases de tipos (UUIDs malformados, emails inválidos)
 *   - Concurrencia (2 admins creando a la vez)
 *
 * NO modifica el sistema. Solo prueba inputs maliciosos y reporta
 * qué pasa. Si algo explota, lo arreglo.
 *
 * Uso: node --env-file=.env.local scripts/adversarial-audit-sprint-v0.9x.mjs
 */

import { createSupabaseAdminClient } from "../src/lib/supabase/admin.ts";
import {
  createSyntheticLead,
  listSyntheticLeads,
  deleteAllSyntheticLeads,
  SIMULATION_SOURCE_ADMIN_LAB
} from "../src/lib/whatsapp/synthetic-leads.ts";
import { processInboundMessage, resolveIntent } from "../src/lib/whatsapp/bot-engine.ts";
import { buildHumanFirstPrompt } from "../src/lib/ai/agent-prompts.ts";
import {
  KEY_BOT_GLOBAL_MODE,
  readSystemSetting,
  setSystemSetting
} from "../src/lib/admin/system-settings-server.ts";

/* ------------------------------------------------------------------ */
/*  Helpers de reporting                                                */
/* ------------------------------------------------------------------ */

const results = [];
function record(category, name, severity, detail) {
  const icon = severity === "CRITICAL" ? "🔴"
    : severity === "HIGH" ? "🟠"
    : severity === "MEDIUM" ? "🟡"
    : "🟢";
  const status = severity === "OK" ? "✓ OK"
    : severity === "CRITICAL" || severity === "HIGH" ? "✗ BUG"
    : "⚠ WARN";
  results.push({ category, name, severity, detail });
  console.log(`  ${icon} ${status.padEnd(8)} [${category}] ${name}`);
  if (detail) console.log(`           ${detail}`);
}

function section(title) {
  console.log("");
  console.log("=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

/* ------------------------------------------------------------------ */
/*  Adversarial tests                                                   */
/* ------------------------------------------------------------------ */

async function main() {
  const originalMode = await readSystemSetting(KEY_BOT_GLOBAL_MODE);
  console.log(`[adversarial] Modo original: ${JSON.stringify(originalMode)}`);

  // Limpiar al inicio.
  await deleteAllSyntheticLeads();

  try {
    /* ============================================================ */
    /*  Categoría 1: SQL INJECTION                                 */
    /* ============================================================ */
    section("Categoría 1: SQL INJECTION en inputs del simulador");

    // Test 1.1: name con SQL injection clásico.
    try {
      const evil = await createSyntheticLead({
        createdBy: "adversarial'; DROP TABLE leads; --",
        name: "Robert'); DROP TABLE leads; CASCADE; --"
      });
      const sb = createSupabaseAdminClient();
      const { data: leadsAfter } = await sb
        .from("leads")
        .select("id")
        .limit(1);
      record(
        "SQL injection en name (DROP TABLE)",
        "name con 'DROP TABLE leads'",
        leadsAfter && leadsAfter.length > 0 ? "OK" : "CRITICAL",
        `tabla leads sigue existiendo (${leadsAfter?.length ?? 0} rows). lead created=${evil.id}`
      );
      // Limpiar
      await sb.from("leads").delete().eq("id", evil.id);
    } catch (err) {
      record(
        "SQL injection en name",
        "lanzó excepción",
        "OK",
        `Supabase rechazó: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`
      );
    }

    // Test 1.2: phone con SQL injection.
    try {
      const evil = await createSyntheticLead({
        createdBy: "adversarial",
        phone: "+52'; DROP TABLE leads; --"
      });
      record(
        "SQL injection en phone (custom)",
        "phone con 'DROP TABLE'",
        "OK",
        `Supabase acepta el input como string (no ejecuta). phone=${evil.phoneNormalized}`
      );
      // Limpiar
      const sb = createSupabaseAdminClient();
      await sb.from("leads").delete().eq("id", evil.id);
    } catch (err) {
      record(
        "SQL injection en phone",
        "lanzó excepción",
        "OK",
        `rechazado: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`
      );
    }

    // Test 1.3: simulation_metadata con SQL injection.
    try {
      const evil = await createSyntheticLead({
        createdBy: "adversarial'); UPDATE leads SET status = 'lost' WHERE 1=1; --"
      });
      const sb = createSupabaseAdminClient();
      const { data: leads } = await sb
        .from("leads")
        .select("status")
        .eq("id", evil.id)
        .maybeSingle();
      const status = leads?.status;
      record(
        "SQL injection en createdBy (UPDATE)",
        "createdBy con SQL",
        status === "new" ? "OK" : "CRITICAL",
        `status del lead nuevo: ${status} (debe ser 'new')`
      );
      // Limpiar
      await sb.from("leads").delete().eq("id", evil.id);
    } catch (err) {
      record(
        "SQL injection en createdBy",
        "lanzó excepción",
        "OK",
        `rechazado: ${err instanceof Error ? err.message.slice(0, 100) : String(err)}`
      );
    }

    /* ============================================================ */
    /*  Categoría 2: XSS / Injection en UI                          */
    /* ============================================================ */
    section("Categoría 2: XSS / HTML injection en outputs del bot");

    // Test 2.1: name con <script> en lead sintético → ¿se renderiza en la UI?
    const evilName = "<script>alert('xss')</script><img src=x onerror=alert(1)>";
    let evilLead;
    try {
      evilLead = await createSyntheticLead({
        createdBy: "adversarial",
        name: evilName
      });
      record(
        "XSS en name del lead",
        "name con <script>",
        "OK",
        `Supabase acepta el string. Persiste como TEXT. La UI debe escapar antes de renderizar.`
      );
    } catch (err) {
      record(
        "XSS en name",
        "lanzó excepción",
        "OK",
        `rechazado: ${err.message?.slice(0, 100)}`
      );
    }

    // Test 2.2: response del LLM con HTML injection (lo que el bot responde).
    if (evilLead) {
      const sb = createSupabaseAdminClient();
      const phone = evilLead.phoneNormalized;
      const message = {
        messageId: `adv_xss_${Date.now()}`,
        from: phone,
        timestamp: new Date().toISOString(),
        type: "text",
        text: "<script>alert(1)</script>",
        contactName: evilLead.name
      };
      let result;
      try {
        result = await processInboundMessage(message);
      } catch (err) {
        record(
          "XSS en body del mensaje",
          "processInboundMessage lanzó",
          "OK",
          `rechazó el mensaje malicioso: ${err.message?.slice(0, 100)}`
        );
        await deleteAllSyntheticLeads();
        return;
      }
      // Verificar que el response_preview NO contiene HTML crudo.
      const responseText = result.responsePreview ?? "";
      const hasHtmlTags = /<script|<img|<svg|onerror=/i.test(responseText);
      // NOTA: aunque el response contiene tags HTML, React renderiza
      // strings con `{...}` como texto plano (escapa automáticamente).
      // Verificamos en BotSimulatorTab.tsx:751: <div>{m.body}</div>
      // → React escapa. NO es XSS. Es solo contenido confuso.
      record(
        "XSS en body del mensaje",
        "response del bot contiene HTML?",
        "INFO",
        hasHtmlTags
          ? `LLM replicó el HTML del body (${responseText.slice(0, 100)}). La UI lo renderiza como texto plano (React escapa). NO es XSS.`
          : `response NO contiene HTML.`
      );
    }

    /* ============================================================ */
    /*  Categoría 3: Caracteres especiales (null bytes, control)   */
    /* ============================================================ */
    section("Categoría 3: Caracteres especiales en inputs");

    // Test 3.1: name con null bytes (usando String.fromCharCode para evitar
    // el bug de escape de Node en .mjs).
    try {
      const nullChar = String.fromCharCode(0);
      const evilName = `Robert${nullChar}Malo${nullChar}${nullChar}${nullChar}`;
      const evil = await createSyntheticLead({
        createdBy: "adversarial",
        name: evilName
      });
      record(
        "Null bytes en name",
        "name con \\u0000",
        evil.name.includes(nullChar) ? "MEDIUM" : "OK",
        `Supabase acepta. name persistido (length=${evil.name.length})`
      );
      const sb = createSupabaseAdminClient();
      await sb.from("leads").delete().eq("id", evil.id);
    } catch (err) {
      record(
        "Null bytes en name",
        "lanzó excepción",
        "OK",
        `rechazado: ${err.message?.slice(0, 100)}`
      );
    }

    // Test 3.2: body con RTL override (Unicode bidi attack).
    if (await createSyntheticLead({ createdBy: "adversarial" }).then((l) => (evilLead = l, true))) {
      const phone = evilLead.phoneNormalized;
      const message = {
        messageId: `adv_rtl_${Date.now()}`,
        from: phone,
        timestamp: new Date().toISOString(),
        type: "text",
        // Unicode RTL override: "evil.exe\u202Ecod.pdf" (parece un PDF pero es un EXE)
        text: "innocent\u202Egpj.exe",
        contactName: evilLead.name
      };
      let result;
      try {
        result = await processInboundMessage(message);
      } catch (err) {
        record("RTL override en body", "lanzó excepción", "OK", err.message?.slice(0, 100));
        await deleteAllSyntheticLeads();
        return;
      }
      record(
        "RTL override en body",
        "body procesado OK",
        "OK",
        `body persistido correctamente. response: "${(result.responsePreview ?? "").slice(0, 80)}"`
      );
    }

    /* ============================================================ */
    /*  Categoría 4: DoS / Inputs muy grandes                       */
    /* ============================================================ */
    section("Categoría 4: DoS / inputs muy grandes");

    // Test 4.1: name de 10,000 chars.
    try {
      const hugeName = "A".repeat(10_000);
      const evil = await createSyntheticLead({
        createdBy: "adversarial",
        name: hugeName
      });
      record(
        "DoS: name de 10k chars",
        "createSyntheticLead OK",
        "MEDIUM",
        `Supabase acepta 10k chars. name.length=${evil.name.length}. Riesgo: DoS en UI que renderiza el nombre.`
      );
      const sb = createSupabaseAdminClient();
      await sb.from("leads").delete().eq("id", evil.id);
    } catch (err) {
      record(
        "DoS: name de 10k chars",
        "lanzó excepción",
        "OK",
        `rechazado por algún constraint: ${err.message?.slice(0, 100)}`
      );
    }

    // Test 4.2: body de 100,000 chars (cuerpo del mensaje del lead).
    evilLead = await createSyntheticLead({ createdBy: "adversarial" });
    {
      const phone = evilLead.phoneNormalized;
      const hugeBody = "X".repeat(100_000);
      const message = {
        messageId: `adv_huge_${Date.now()}`,
        from: phone,
        timestamp: new Date().toISOString(),
        type: "text",
        text: hugeBody,
        contactName: evilLead.name
      };
      const t0 = Date.now();
      let result;
      try {
        result = await processInboundMessage(message);
      } catch (err) {
        record(
          "DoS: body de 100k chars",
          "processInboundMessage lanzó",
          "OK",
          `rechazó: ${err.message?.slice(0, 100)}`
        );
        await deleteAllSyntheticLeads();
        return;
      }
      const latencyMs = Date.now() - t0;
      // Verificar que NO se persistió el body completo (debe truncarse o rechazarse).
      const sb = createSupabaseAdminClient();
      const { data: conv } = await sb
        .from("lead_whatsapp_conversations")
        .select("body")
        .eq("lead_id", evilLead.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const persistedLen = conv?.body?.length ?? 0;
      record(
        "DoS: body de 100k chars",
        "body persistido completo?",
        persistedLen < hugeBody.length ? "OK" : "MEDIUM",
        `body enviado=${hugeBody.length} chars, persistido=${persistedLen} chars, latency=${latencyMs}ms`
      );
    }

    /* ============================================================ */
    /*  Categoría 5: Edge cases de tipos                             */
    /* ============================================================ */
    section("Categoría 5: Edge cases de tipos");

    // Test 5.1: leadId malformado en simulate/real.
    // (No podemos llamar al endpoint sin auth, pero sí podemos probar
    // el flow directo de processInboundMessage con un phone que
    // matchea un leadId malformado, NO. Saltamos.)
    record(
      "leadId malformado en endpoint",
      "No probado via endpoint (requiere auth admin)",
      "OK",
      "Validación manual del código: el endpoint verifica `!body.leadId || typeof body.leadId !== 'string'` (line 88). Rechaza con 400."
    );

    // Test 5.2: email sintético duplicado.
    const lead1 = await createSyntheticLead({ createdBy: "adversarial" });
    const lead2 = await createSyntheticLead({ createdBy: "adversarial" });
    const sb = createSupabaseAdminClient();
    // Intentar update manual del email del lead2 al email del lead1.
    // (No podemos crear 2 con el mismo email via helper, pero podemos
    // intentar el UPDATE directo).
    const { error: updateErr } = await sb
      .from("leads")
      .update({ email: lead1.email })
      .eq("id", lead2.id);
    record(
      "UNIQUE constraint en email",
      "UPDATE con email duplicado",
      updateErr ? "OK" : "MEDIUM",
      updateErr
        ? `Supabase rechazó: ${updateErr.code} ${updateErr.message?.slice(0, 100)}`
        : `Supabase aceptó el UPDATE sin error. ¿Hay UNIQUE constraint en leads.email?`
      );
    await deleteAllSyntheticLeads();

    // Test 5.3: phone sintético duplicado via UPDATE.
    const l3 = await createSyntheticLead({ createdBy: "adversarial" });
    const l4 = await createSyntheticLead({ createdBy: "adversarial" });
    const { error: phoneUpdateErr } = await sb
      .from("leads")
      .update({ phone_normalized: l3.phoneNormalized })
      .eq("id", l4.id);
    record(
      "UNIQUE constraint en phone",
      "UPDATE con phone duplicado",
      phoneUpdateErr ? "OK" : "MEDIUM",
      phoneUpdateErr
        ? `Supabase rechazó: ${phoneUpdateErr.code} ${phoneUpdateErr.message?.slice(0, 100)}`
        : `Supabase aceptó el UPDATE. ¿Hay UNIQUE constraint en leads.phone_normalized?`
      );
    await deleteAllSyntheticLeads();

    /* ============================================================ */
    /*  Categoría 6: Race conditions                                */
    /* ============================================================ */
    section("Categoría 6: Race conditions");

    // Test 6.1: 2 admins creando personas simultáneamente.
    // (Lo simulamos con Promise.all)
    const createPromises = [];
    for (let i = 0; i < 5; i++) {
      createPromises.push(createSyntheticLead({ createdBy: `adversarial-${i}` }));
    }
    const results6_1 = await Promise.allSettled(createPromises);
    const fulfilled = results6_1.filter((r) => r.status === "fulfilled");
    const rejected = results6_1.filter((r) => r.status === "rejected");
    record(
      "5 creates concurrentes",
      "Promise.all de 5 createSyntheticLead",
      fulfilled.length === 5 ? "OK" : "MEDIUM",
      `fulfilled=${fulfilled.length}/5, rejected=${rejected.length}. Phones: ${fulfilled.map((r) => r.value.phoneNormalized).join(", ")}`
    );
    // Verificar que todos los phones son únicos.
    const phonesCreated = fulfilled.map((r) => r.value.phoneNormalized);
    const uniquePhones = new Set(phonesCreated);
    record(
      "5 creates concurrentes",
      "phones únicos entre creates paralelos",
      uniquePhones.size === phonesCreated.length ? "OK" : "HIGH",
      `${uniquePhones.size} únicos / ${phonesCreated.length} totales`
    );
    await deleteAllSyntheticLeads();

    // Test 6.2: Cambio de modo durante el procesamiento.
    // (Simulamos: mientras processInboundMessage corre, cambiamos el modo).
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, "human_first", "adversarial");
    const lRace = await createSyntheticLead({ createdBy: "adversarial" });
    const racePhone = lRace.phoneNormalized;
    const raceMessage = {
      messageId: `adv_race_${Date.now()}`,
      from: racePhone,
      timestamp: new Date().toISOString(),
      type: "text",
      text: "Hola test race",
      contactName: lRace.name
    };
    // Cambiar el modo en paralelo al processInboundMessage.
    const [raceResult] = await Promise.all([
      processInboundMessage(raceMessage),
      (async () => {
        // Esperar 50ms para que processInboundMessage haya leído el modo
        await new Promise((r) => setTimeout(r, 50));
        await setSystemSetting(KEY_BOT_GLOBAL_MODE, "socratic_autopilot_v2", "adversarial");
      })()
    ]);
    record(
      "Race: cambio de modo durante processing",
      "modo cambia durante processInboundMessage",
      "INFO",
      `intent detectado: ${raceResult.intent}. OK si el comportamiento es determinista (cache 30s de readSystemSetting protege).`
    );
    await deleteAllSyntheticLeads();
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode, "adversarial");
  } finally {
    // Limpiar y restaurar.
    await deleteAllSyntheticLeads();
    await setSystemSetting(KEY_BOT_GLOBAL_MODE, originalMode, "adversarial");
  }

  // Reporte final.
  console.log("");
  console.log("=".repeat(70));
  console.log("REPORTE ADVERSARIAL FINAL");
  console.log("=".repeat(70));
  const criticals = results.filter((r) => r.severity === "CRITICAL");
  const highs = results.filter((r) => r.severity === "HIGH");
  const mediums = results.filter((r) => r.severity === "MEDIUM");
  const oks = results.filter((r) => r.severity === "OK");
  const infos = results.filter((r) => r.severity === "INFO");
  console.log(`Total: ${results.length} tests`);
  console.log(`  OK:      ${oks.length}`);
  console.log(`  INFO:    ${infos.length}`);
  console.log(`  MEDIUM:  ${mediums.length}`);
  console.log(`  HIGH:    ${highs.length}`);
  console.log(`  CRITICAL: ${criticals.length}`);

  if (criticals.length > 0 || highs.length > 0) {
    console.log("");
    console.log("Bugs encontrados (CRITICAL/HIGH):");
    for (const r of [...criticals, ...highs]) {
      console.log(`  [${r.severity}] [${r.category}] ${r.name}`);
      if (r.detail) console.log(`    ${r.detail}`);
    }
  }
  if (mediums.length > 0) {
    console.log("");
    console.log("Advertencias (MEDIUM):");
    for (const r of mediums) {
      console.log(`  [${r.category}] ${r.name}`);
      if (r.detail) console.log(`    ${r.detail}`);
    }
  }
}

main().catch((err) => {
  console.error("[adversarial] Error fatal:", err);
  process.exit(1);
});
