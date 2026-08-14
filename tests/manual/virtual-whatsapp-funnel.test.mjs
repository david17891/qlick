/**
 * Arnés interno de WhatsApp virtual.
 *
 * No es una ruta pública ni usa Meta/Brevo: envía mensajes sintéticos al
 * mismo processInboundMessage que usa el webhook y captura los outbound.
 * La persistencia, reglas de pago y consultas de Supabase sí son reales.
 *
 * Ejecutar manualmente (no forma parte de npm test):
 *   $env:DEEPSEEK_API_KEY = "..."
 *   node --experimental-test-module-mocks --import ./tests/loader-register.mjs `
 *     --experimental-strip-types --test tests/manual/virtual-whatsapp-funnel.test.mjs
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvLocal() {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
  ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const outbound = [];
const emails = [];

mock.module("../../src/lib/whatsapp/index.ts", {
  namedExports: {
    getActiveWhatsAppProvider: () => ({
      name: "virtual-whatsapp",
      displayName: "Virtual WhatsApp (internal E2E)",
      active: true,
      stub: true,
      send: async (args) => {
        outbound.push({ to: args.to, body: args.body ?? "", type: args.type ?? "text" });
        return { ok: true, externalId: `virtual_${outbound.length}`, demo: true };
      },
    }),
    REGISTRY: {},
  },
});

mock.module("../../src/lib/email/brevo-client.ts", {
  namedExports: {
    sendEmail: async (args) => {
      emails.push({ to: args.to, subject: args.subject ?? "" });
      return { ok: true, messageId: `virtual_email_${emails.length}` };
    },
  },
});

async function setting(key) {
  const { data } = await supabase.from("system_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function setMode(mode) {
  const { error } = await supabase.from("system_settings").upsert({
    key: "bot_global_mode",
    value: JSON.stringify(mode),
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw new Error(`setMode: ${error.message}`);
}

async function createLead(phone, { placeholderEmail = true } = {}) {
  const { data, error } = await supabase.from("leads").insert({
    phone,
    phone_normalized: phone,
    // El schema histórico exige valores no nulos; son placeholders que el
    // motor debe ignorar y reemplazar solo con datos capturados del chat.
    name: "Pendiente",
    email: placeholderEmail ? `pending-${phone.slice(-3)}@example.com` : null,
    source: "whatsapp",
    status: "new",
    consent_to_contact: true,
    // El constraint de producción solo permite la marca de laboratorio; el
    // teléfono es sintético y se elimina en finally.
    simulation_source: "admin_lab",
  }).select("id, phone_normalized").single();
  if (error) throw new Error(`createLead: ${error.message}`);
  return data;
}

async function cleanupLead(lead) {
  if (!lead) return;
  await supabase.from("event_qr_tokens").delete().eq("attendee_phone_normalized", lead.phone_normalized);
  await supabase.from("event_confirmations").delete().eq("phone_normalized", lead.phone_normalized);
  await supabase.from("lead_whatsapp_conversations").delete().eq("lead_id", lead.id);
  await supabase.from("lead_profile").delete().eq("lead_id", lead.id);
  await supabase.from("leads").delete().eq("id", lead.id);
}

async function getActiveEvent() {
  const { data, error } = await supabase.from("events")
    .select("id, slug, title, price_mxn")
    .eq("status", "published")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`event: ${error.message}`);
  return data;
}

async function snapshot(lead, event) {
  const [{ data: dbLead, error: leadError }, { data: confirmation, error: confirmationError }, { data: qr, error: qrError }] = await Promise.all([
    supabase.from("leads").select("name, email, status").eq("id", lead.id).maybeSingle(),
    supabase.from("event_confirmations")
      .select("id, name, email, payment_status, registration_status")
      .eq("event_id", event.id).eq("phone_normalized", lead.phone_normalized)
      .order("confirmed_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("event_qr_tokens").select("id, revoked_at")
      .eq("attendee_phone_normalized", lead.phone_normalized),
  ]);
  if (leadError || confirmationError || qrError) {
    throw new Error(JSON.stringify({ leadError, confirmationError, qrError }));
  }
  return {
    lead: dbLead,
    confirmation,
    qrCount: qr?.length ?? 0,
    activeQrCount: (qr ?? []).filter((token) => !token.revoked_at).length,
    outbound: outbound.splice(0),
    emails: emails.splice(0),
  };
}

async function send(processInboundMessage, phone, text, n) {
  const result = await processInboundMessage({
    messageId: `virtual_${phone.slice(-4)}_${n}_${Date.now()}`,
    from: phone,
    contactName: "Virtual Tester",
    text,
    type: "text",
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  assert.equal(result.ok, true, `turno ${n} no procesado: ${result.note ?? "sin nota"}`);
  return result;
}

async function sendButton(processInboundMessage, phone, buttonId, buttonTitle, n) {
  const result = await processInboundMessage({
    messageId: `virtual_button_${phone.slice(-4)}_${n}_${Date.now()}`,
    from: phone,
    contactName: "Virtual Tester",
    text: buttonTitle,
    type: "interactive",
    buttonId,
    buttonTitle,
    timestamp: String(Math.floor(Date.now() / 1000)),
  });
  assert.equal(result.ok, true, `botón ${buttonId} no procesado: ${result.note ?? "sin nota"}`);
  return result;
}

test("Virtual WhatsApp: captura secuencial no vuelve a pedir nombre", async (t) => {
  if (!supabase) {
    t.skip("requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SECRET_KEY");
    return;
  }

  const previousMode = await setting("bot_global_mode");
  const event = await getActiveEvent();
  assert.ok(event, "No hay evento publicado para el funnel virtual");
  const { processInboundMessage } = await import("../../src/lib/whatsapp/bot-engine.ts");
  const phone = "+525599980009";
  const lead = await createLead(phone, { placeholderEmail: false });

  try {
    await setMode("super_executive_v2");
    await sendButton(
      processInboundMessage,
      phone,
      `evt_inscribir_${event.slug}`,
      "Inscribirme",
      1,
    );
    await snapshot(lead, event);
    await send(processInboundMessage, phone, "Prueba Nombre Completo", 2);
    const afterName = await snapshot(lead, event);
    await send(processInboundMessage, phone, "prueba@example.com", 3);
    const afterEmail = await snapshot(lead, event);

    assert.equal(afterName.lead?.name, "Prueba Nombre Completo");
    assert.equal(afterEmail.lead?.email, "prueba@example.com");
    assert.equal(afterEmail.confirmation?.registration_status, "payment_pending");
    assert.equal(afterEmail.activeQrCount, 0);
    assert.equal(afterEmail.emails.length, 0);
    assert.doesNotMatch(
      afterEmail.outbound.map((message) => message.body).join("\n"),
      /Antes de registrarte.*nombre completo/i,
    );
  } finally {
    let restore = "super_executive_v2";
    try {
      restore = JSON.parse(previousMode ?? '"super_executive_v2"');
    } catch {
      restore = previousMode ?? restore;
    }
    await setMode(restore);
    await cleanupLead(lead);
  }
});

test("Virtual WhatsApp: compara Human Style y Súper Ejecutivo en el funnel real", async (t) => {
  if (!supabase || !process.env.DEEPSEEK_API_KEY) {
    t.skip("requiere NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y DEEPSEEK_API_KEY");
    return;
  }

  const previousMode = await setting("bot_global_mode");
  const event = await getActiveEvent();
  assert.ok(event, "No hay evento publicado para el funnel virtual");
  const { processInboundMessage } = await import("../../src/lib/whatsapp/bot-engine.ts");
  const report = [];
  const leads = [];

  try {
    for (const [mode, suffix] of [["human_first", "human"], ["super_executive_v2", "super"]]) {
      await setMode(mode);
      const phone = `+5255999800${suffix === "human" ? "001" : "002"}`;
      const lead = await createLead(phone);
      leads.push(lead);
      await send(processInboundMessage, phone, "Hola, quiero inscribirme al curso de agosto.", 1);
      const first = await snapshot(lead, event);
      await send(processInboundMessage, phone, `Prueba Virtual ${suffix === "human" ? "Human" : "Super"}`, 2);
      const second = await snapshot(lead, event);
      await send(processInboundMessage, phone, `virtual.${suffix}@example.com`, 3);
      const third = await snapshot(lead, event);
      report.push({ mode, first, second, third });

      assert.equal(third.lead?.email, `virtual.${suffix}@example.com`);
      assert.match(third.lead?.name ?? "", /Prueba Virtual/);
      assert.equal(third.confirmation?.payment_status, "pending");
      assert.equal(third.confirmation?.registration_status, "payment_pending");
      assert.doesNotMatch(
        third.outbound.map((m) => m.body).join("\n"),
        /Antes de registrarte.*nombre completo/i,
        "no debe volver a pedir el nombre después de capturarlo",
      );
      assert.match(
        third.outbound.map((m) => m.body).join("\n"),
        /pago|apart|confirmar/i,
        "el cierre debe dirigir al pago o apartado",
      );
      // Puede quedar un token histórico revocado por la migración de
      // seguridad; lo que nunca debe existir es un token utilizable.
      assert.equal(third.activeQrCount, 0, "un evento pagado no debe emitir QR activo antes del pago");
      assert.equal(third.emails.length, 0, "no debe enviar pase por correo antes del pago");
    }
  } finally {
    await setMode(JSON.parse(previousMode ?? '"super_executive_v2"'));
    for (const lead of leads) await cleanupLead(lead);
  }

  console.log(JSON.stringify({
    event: { id: event.id, title: event.title, price_mxn: event.price_mxn },
    modes: report.map((r) => ({
      mode: r.mode,
      turns: [r.first, r.second, r.third].map((s) => ({
        lead: s.lead,
        confirmation: s.confirmation,
        qrCount: s.qrCount,
        activeQrCount: s.activeQrCount,
        outbound: s.outbound.map((m) => m.body.slice(0, 240)),
        emailCount: s.emails.length,
      })),
    })),
  }, null, 2));
});

test("Virtual WhatsApp: batería adversarial de captura y seguridad", async (t) => {
  if (!supabase || !process.env.DEEPSEEK_API_KEY) {
    t.skip("requiere NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y DEEPSEEK_API_KEY");
    return;
  }

  const previousMode = await setting("bot_global_mode");
  const event = await getActiveEvent();
  assert.ok(event, "No hay evento publicado para la batería adversarial");
  const { processInboundMessage } = await import("../../src/lib/whatsapp/bot-engine.ts");
  const created = [];
  const results = [];

  async function state(lead) {
    const [{ data: dbLead }, { data: confirmations }, { data: qr }] = await Promise.all([
      supabase.from("leads").select("name, email, status").eq("id", lead.id).maybeSingle(),
      supabase.from("event_confirmations")
        .select("id, payment_status, registration_status")
        .eq("event_id", event.id).eq("phone_normalized", lead.phone_normalized),
      supabase.from("event_qr_tokens")
        .select("id, revoked_at")
        .eq("attendee_phone_normalized", lead.phone_normalized),
    ]);
    return {
      lead: dbLead,
      confirmationCount: confirmations?.length ?? 0,
      confirmations: confirmations ?? [],
      activeQrCount: (qr ?? []).filter((token) => !token.revoked_at).length,
      outbound: outbound.splice(0).map((message) => message.body),
      emailCount: emails.splice(0).length,
    };
  }

  async function runScenario(label, suffix, turns) {
    const phone = `+525599990${suffix}`;
    const lead = await createLead(phone);
    created.push(lead);
    const snapshots = [];
    for (let index = 0; index < turns.length; index += 1) {
      await send(processInboundMessage, phone, turns[index], index + 1);
      snapshots.push(await state(lead));
    }
    results.push({ label, snapshots });
    return { lead, snapshots };
  }

  try {
    await setMode("super_executive_v2");

    const wrongName = await runScenario("ubicación no es nombre", "101", [
      "Hola, quiero inscribirme al curso.",
      "CANACO, San Luis Río Colorado",
    ]);
    assert.equal(wrongName.snapshots[1].lead?.name, "Pendiente");
    assert.match(wrongName.snapshots[1].outbound.join("\n"), /nombre/i);
    assert.doesNotMatch(wrongName.snapshots[1].outbound.join("\n"), /confirmad|QR|pago/i);

    const emailFirst = await runScenario("correo antes del nombre", "102", [
      "Hola, quiero inscribirme al curso.",
      "ana@example.com",
    ]);
    assert.equal(emailFirst.snapshots[1].lead?.email, "pending-102@example.com");
    assert.equal(emailFirst.snapshots[1].confirmationCount, 0);
    assert.match(emailFirst.snapshots[1].outbound.join("\n"), /nombre/i);

    const duplicate = await runScenario("correo duplicado", "103", [
      "Hola, quiero inscribirme al curso.",
      "Ana Torres",
      "ana.torres@example.com",
      "ana.torres@example.com",
    ]);
    const duplicateFinal = duplicate.snapshots.at(-1);
    assert.equal(duplicateFinal.lead?.email, "ana.torres@example.com");
    assert.equal(duplicateFinal.confirmationCount, 1, "el webhook conversacional no debe duplicar confirmaciones");
    assert.equal(duplicateFinal.activeQrCount, 0);
    assert.equal(duplicateFinal.emailCount, 0);

    const optOut = await runScenario("baja voluntaria", "104", [
      "Hola, quiero inscribirme al curso.",
      "No me interesa, gracias.",
    ]);
    assert.equal(optOut.snapshots[1].confirmationCount, 0);
    assert.equal(optOut.snapshots[1].activeQrCount, 0);
    assert.doesNotMatch(optOut.snapshots[1].outbound.join("\n"), /pagar|apart|QR/i);

    const outOfOrder = await runScenario("nombre y correo en orden inverso", "105", [
      "Hola, quiero inscribirme al curso.",
      "Luis Gómez",
      "luis.gomez@example.com",
    ]);
    const outOfOrderFinal = outOfOrder.snapshots.at(-1);
    assert.equal(outOfOrderFinal.lead?.name, "Luis Gómez");
    assert.equal(outOfOrderFinal.lead?.email, "luis.gomez@example.com");
    assert.equal(outOfOrderFinal.confirmationCount, 1);
    assert.equal(outOfOrderFinal.activeQrCount, 0);
    assert.match(outOfOrderFinal.outbound.join("\n"), /apart|pago/i);

    console.log(JSON.stringify({
      event: { slug: event.slug, title: event.title, price_mxn: event.price_mxn },
      scenarios: results.map(({ label, snapshots }) => ({
        label,
        last: snapshots.at(-1),
      })),
    }, null, 2));
  } finally {
    await setMode(JSON.parse(previousMode ?? '"super_executive_v2"'));
    for (const lead of created) await cleanupLead(lead);
  }
});
