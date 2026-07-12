/**
 * Tests del extractor de contacto (Sprint v0.9.8 Mejora 3: typos
 * de dominio + fix legacy de validación de email/nombre).
 *
 * Cubre:
 *   - Validación de email (regex).
 *   - Validación de nombre (mín. 2 palabras, sin placeholders).
 *   - Detección de typos de dominio (gmai.com → gmail.com, etc.).
 *   - Cuando hay typo, la tool NO persiste; devuelve
 *     `status: "needs_domain_confirmation"` con `suggested_domain`.
 *   - Cuando el email es válido, la tool persiste normalmente.
 *
 * Patrón: tests del módulo puro. NO se mockea Supabase (modo demo
 * del executor cuando `ctx.supabase === null`).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const TOOL_URL = pathToFileURL(
  path.join(ROOT, "src/lib/ai/tool-executors/extract-contact.ts")
).href;

test("E1: detectDomainTypo reconoce 'gmai.com' → 'gmail.com'", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  const r = detectDomainTypo("juan@gmai.com");
  assert.ok(r);
  assert.equal(r.suggestedDomain, "gmail.com");
  assert.equal(r.rawDomain, "gmai.com");
});

test("E2: detectDomainTypo reconoce 'hotmai.com' → 'hotmail.com'", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  const r = detectDomainTypo("maria@hotmai.com");
  assert.ok(r);
  assert.equal(r.suggestedDomain, "hotmail.com");
  assert.equal(r.rawDomain, "hotmai.com");
});

test("E3: detectDomainTypo reconoce 'outlook.co' → 'outlook.com'", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  const r = detectDomainTypo("pedro@outlook.co");
  assert.ok(r);
  assert.equal(r.suggestedDomain, "outlook.com");
  assert.equal(r.rawDomain, "outlook.co");
});

test("E4: detectDomainTypo reconoce 'yahho.com' → 'yahoo.com'", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  const r = detectDomainTypo("ana@yahho.com");
  assert.ok(r);
  assert.equal(r.suggestedDomain, "yahoo.com");
  assert.equal(r.rawDomain, "yahho.com");
});

test("E5: detectDomainTypo devuelve null para emails con dominios válidos", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  assert.equal(detectDomainTypo("juan@gmail.com"), null);
  assert.equal(detectDomainTypo("maria@hotmail.com"), null);
  assert.equal(detectDomainTypo("pedro@outlook.com"), null);
  assert.equal(detectDomainTypo("ana@yahoo.com"), null);
  // Dominio personalizado: NO es typo conocido.
  assert.equal(detectDomainTypo("user@miempresa.com"), null);
});

test("E6: detectDomainTypo es case-insensitive (MAYÚSCULAS también detecta)", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  const r = detectDomainTypo("juan@GMAI.COM");
  assert.ok(r);
  assert.equal(r.suggestedDomain, "gmail.com");
  assert.equal(r.rawDomain, "gmai.com");
});

test("E7: detectDomainTypo maneja emails inválidos (null o sin @)", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  assert.equal(detectDomainTypo(null), null);
  assert.equal(detectDomainTypo(""), null);
  assert.equal(detectDomainTypo("sin-arroba"), null);
});

test("E8: detectDomainTypo NO confunde typo con subdominio válido", async () => {
  const { detectDomainTypo } = await import(TOOL_URL);
  // "gm.com" es un dominio válido (no es typo de "gmail.com").
  assert.equal(detectDomainTypo("user@gm.com"), null);
  // "gmail.co.uk" NO es typo de "gmail.com" (TLD diferente intencional).
  assert.equal(detectDomainTypo("user@gmail.co.uk"), null);
});

test("E9: executeExtractAndSaveContact con email typo NO persiste, devuelve needs_domain_confirmation", async () => {
  const { executeExtractAndSaveContact } = await import(TOOL_URL);
  const r = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmai.com" },
    { leadId: "36249ecd-0000-0000-0000-000000000000", supabase: null }
  );
  assert.equal(r.ok, true, "ok=true porque el formato es válido, solo el dominio es ambiguo");
  assert.equal(r.status, "needs_domain_confirmation");
  assert.equal(r.suggested_domain, "gmail.com");
  assert.equal(r.raw_domain, "gmai.com");
  assert.equal(r.persisted, false, "el email con typo NO debe persistirse");
  assert.ok(
    r.note.includes("typo"),
    "la nota debe mencionar el typo y la sugerencia"
  );
  // El nombre SÍ se marca como saved (es válido).
  assert.equal(r.saved_name, "Juan Pérez");
  // El email NO se guarda.
  assert.equal(r.saved_email, undefined);
});

test("E10: executeExtractAndSaveContact con email válido SÍ persiste en modo demo", async () => {
  const { executeExtractAndSaveContact } = await import(TOOL_URL);
  const r = await executeExtractAndSaveContact(
    { name: "Juan Pérez", email: "juan@gmail.com" },
    { leadId: "36249ecd-0000-0000-0000-000000000000", supabase: null }
  );
  assert.equal(r.ok, true);
  assert.equal(r.status, undefined, "sin typo, NO hay status");
  assert.equal(r.suggested_domain, undefined);
  assert.equal(r.saved_name, "Juan Pérez");
  assert.equal(r.saved_email, "juan@gmail.com");
  assert.equal(r.demo, true);
  assert.equal(r.persisted, false, "modo demo: simulado, no persistido realmente");
});

test("E11: validateAndNormalizeEmail acepta emails válidos", async () => {
  const { validateAndNormalizeEmail } = await import(TOOL_URL);
  assert.equal(
    validateAndNormalizeEmail("Juan@Gmail.COM"),
    "juan@gmail.com",
    "trim + lowercase"
  );
  assert.equal(
    validateAndNormalizeEmail("  maria@hotmail.com  "),
    "maria@hotmail.com"
  );
});

test("E12: validateAndNormalizeEmail rechaza emails inválidos", async () => {
  const { validateAndNormalizeEmail } = await import(TOOL_URL);
  assert.equal(validateAndNormalizeEmail("no-es-email"), null);
  assert.equal(validateAndNormalizeEmail("a@b"), null, "sin TLD");
  assert.equal(validateAndNormalizeEmail("@gmail.com"), null, "sin local part");
  assert.equal(validateAndNormalizeEmail("juan@"), null, "sin dominio");
  assert.equal(validateAndNormalizeEmail(null), null);
  assert.equal(validateAndNormalizeEmail(""), null);
});

test("E13: isValidHumanNameLocal acepta nombres válidos", async () => {
  const { isValidHumanNameLocal } = await import(TOOL_URL);
  assert.ok(isValidHumanNameLocal("Juan Pérez"));
  assert.ok(isValidHumanNameLocal("María José"));
  assert.ok(isValidHumanNameLocal("Carlos O'Brien-Smith"));
});

test("E14: isValidHumanNameLocal rechaza nombres inválidos", async () => {
  const { isValidHumanNameLocal } = await import(TOOL_URL);
  assert.equal(isValidHumanNameLocal("Por confirmar"), false, "placeholder UI");
  assert.equal(isValidHumanNameLocal("Asistente"), false, "placeholder UI");
  assert.equal(isValidHumanNameLocal("test"), false, "placeholder UI");
  assert.equal(isValidHumanNameLocal("Juan"), false, "1 sola palabra");
  assert.equal(isValidHumanNameLocal("12345"), false, "solo dígitos");
  assert.equal(isValidHumanNameLocal(""), false);
  assert.equal(isValidHumanNameLocal(null), false);
  assert.equal(isValidHumanNameLocal(undefined), false);
});

test("E15: el executor rechaza verbos de intención como nombre (FIX 2026-07-10)", async () => {
  // El rechazo de verbos de intención se hace en el executor
  // (`executeExtractAndSaveContact`) antes de `isValidHumanNameLocal`,
  // mediante `hasIntentVerbLocal`. El nombre rechazado se marca con
  // `error_name` y NO se persiste. Si el email pasa, la tool puede
  // seguir siendo `ok: true` parcial (guarda el email, NO el nombre).
  const { executeExtractAndSaveContact } = await import(TOOL_URL);
  const r1 = await executeExtractAndSaveContact(
    { name: "Quiero Registrarme", email: "juan@gmail.com" },
    { leadId: "36249ecd-0000-0000-0000-000000000000", supabase: null }
  );
  // ok=true PARCIAL porque el email sí pasó.
  assert.equal(r1.ok, true, "ok=true parcial: el email sí pasó");
  // PERO el nombre fue rechazado y NO se guardó.
  assert.equal(r1.saved_name, undefined, "el nombre NO se guarda");
  assert.ok(
    r1.error_name?.includes("verbo de intención"),
    "el error_name debe mencionar que es verbo de intención"
  );
  // El email SÍ se guardó (parcial).
  assert.equal(r1.saved_email, "juan@gmail.com");

  // Si SOLO viene el nombre con verbo (sin email), ok=false total.
  const r2 = await executeExtractAndSaveContact(
    { name: "Registrarme" },
    { leadId: "36249ecd-0000-0000-0000-000000000000", supabase: null }
  );
  assert.equal(r2.ok, false, "sin email válido, ok=false");
  assert.ok(r2.error_name?.includes("verbo de intención"));
});
