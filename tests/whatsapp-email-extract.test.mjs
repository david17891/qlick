/**
 * Tests del fix "email extraction from conversational text" (2026-07-05).
 *
 * Caso reportado por David: el bot decia "Actualizamos tu registro... te llega
 * el QR" cuando el usuario corrigia su email con contexto, pero el email
 * NUNCA llegaba a Brevo. Root cause: `body.trim()` se usaba directo como
 * email, asi que cuando el usuario decia "Me equivoque, es david17891@gmail.com",
 * se guardaba la frase entera en leads.email y Brevo la rechazaba por invalida.
 *
 * `extractEmailFromText()` debe:
 *   1. Devolver el email cuando el body es SOLO un email (caso limpio).
 *   2. Devolver el email cuando esta embebido en una frase con contexto.
 *   3. Devolver el email cuando aparece al final, al medio, o al inicio.
 *   4. Devolver el PRIMER email cuando hay varios.
 *   5. Devolver null cuando no hay ningun email en el texto.
 *
 * Patron: `node --test`, sin libs externas.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// @ts-check

import { extractEmailFromText } from "../src/lib/whatsapp/email-extract.ts";

/* ─────────────────────────────────────────────────────────────
 * Casos felices: email extraido correctamente
 * ───────────────────────────────────────────────────────────── */

test("extractEmailFromText: email puro (caso limpio)", () => {
  assert.equal(extractEmailFromText("david17891@gmail.com"), "david17891@gmail.com");
});

test("extractEmailFromText: email con espacios alrededor", () => {
  assert.equal(extractEmailFromText("  david17891@gmail.com  "), "david17891@gmail.com");
});

test("extractEmailFromText: email al final de frase con contexto (caso del bug)", () => {
  // Este es el caso EXACTO que reporto David.
  const body = "Me equivoqué de correo, es David17891@gmail.com";
  assert.equal(extractEmailFromText(body), "David17891@gmail.com");
});

test("extractEmailFromText: email al medio de frase", () => {
  assert.equal(
    extractEmailFromText("Perdón, quise decir david17891@gmail.com que es el bueno"),
    "david17891@gmail.com"
  );
});

test("extractEmailFromText: email al inicio de frase", () => {
  assert.equal(
    extractEmailFromText("david17891@gmail.com es mi correo, gracias"),
    "david17891@gmail.com"
  );
});

test("extractEmailFromText: email con subdomain (multi-dot)", () => {
  assert.equal(
    extractEmailFromText("Mi correo es david@mail.cdmx.gob.mx porfa"),
    "david@mail.cdmx.gob.mx"
  );
});

test("extractEmailFromText: email con caracteres validos extra (punto, guion, guion_bajo)", () => {
  assert.equal(
    extractEmailFromText("escribime a david.esparza-1990_qa@sub.example.com"),
    "david.esparza-1990_qa@sub.example.com"
  );
});

test("extractEmailFromText: devuelve el PRIMER email cuando hay varios", () => {
  // Caso edge: usuario menciona su viejo email Y el nuevo en el mismo body.
  // Nos interesa el primero (que es lo que el bot va a registrar).
  // La coma despues del primer email NO debe incluirse en el match.
  assert.equal(
    extractEmailFromText("antes era foo@bar.com, ahora david17891@gmail.com"),
    "foo@bar.com"
  );
});

test("extractEmailFromText: ignora puntuacion trailing (coma, punto y coma, dos puntos)", () => {
  assert.equal(extractEmailFromText("escribime a david@bar.com,"), "david@bar.com");
  assert.equal(extractEmailFromText("escribime a david@bar.com."), "david@bar.com");
  assert.equal(extractEmailFromText("escribime a david@bar.com;"), "david@bar.com");
  assert.equal(extractEmailFromText("escribime a david@bar.com:"), "david@bar.com");
});

/* ─────────────────────────────────────────────────────────────
 * Casos edge: null cuando no hay email
 * ───────────────────────────────────────────────────────────── */

test("extractEmailFromText: devuelve null si no hay email en el texto", () => {
  assert.equal(extractEmailFromText("hola, quiero info del evento"), null);
});

test("extractEmailFromText: devuelve null con string vacio", () => {
  assert.equal(extractEmailFromText(""), null);
});

test("extractEmailFromText: devuelve null con solo whitespace", () => {
  assert.equal(extractEmailFromText("   \t  \n  "), null);
});

test("extractEmailFromText: NO matchea cosas que parecen email pero no lo son", () => {
  // '@' solo, sin user/domain.
  assert.equal(extractEmailFromText("hola@"), null);
  // Sin TLD.
  assert.equal(extractEmailFromText("foo@bar"), null);
  // Solo dominio.
  assert.equal(extractEmailFromText("@gmail.com"), null);
});

test("extractEmailFromText: NO matchea emails con espacios internos (rechaza formato invalido)", () => {
  // 'foo @ bar.com' NO es un email valido. El regex rechaza.
  assert.equal(extractEmailFromText("foo @ bar.com"), null);
});

/* ─────────────────────────────────────────────────────────────
 * Verificacion de la regresion: flujo completo del bug original
 * ───────────────────────────────────────────────────────────── */

test("REGRESION (caso David): body 'Me equivoqué de correo, es David17891@gmail.com' devuelve SOLO el email", () => {
  // ANTES del fix: el handler hacia body.trim() y se guardaba
  //   leads.email = "me equivoqué de correo, es david17891@gmail.com"
  //   Brevo rechazaba el envio silenciosamente.
  // DESPUES: extractEmailFromText devuelve solo el email.
  const body = "Me equivoqué de correo, es David17891@gmail.com";
  const extracted = extractEmailFromText(body);
  assert.notEqual(extracted, body.trim().toLowerCase(),
    "no debe devolver el body completo (eso era el bug original)");
  assert.equal(extracted, "David17891@gmail.com",
    "debe devolver SOLO el email, no el contexto");
});