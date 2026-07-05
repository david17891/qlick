import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canDeleteEventWith,
  deleteEventInputPlaceholder,
} from "../src/lib/events/delete-confirm.ts";

/**
 * Validación de la confirmación destructiva de evento. Fricción alta:
 * admin debe escribir las primeras 3 letras del título (o el título
 * completo si tiene < 3 chars). Comparación case-insensitive y
 * trim'eada.
 */

test("canDeleteEventWith: acepta las primeras 3 letras lowercase", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "hol"), true);
});

test("canDeleteEventWith: acepta las primeras 3 letras mixed-case", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "HOLA"), true);
  assert.equal(canDeleteEventWith("Hola Mundo", "Hol"), true);
});

test("canDeleteEventWith: rechaza con menos de 3 letras en título normal", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "ho"), false);
  assert.equal(canDeleteEventWith("Hola Mundo", "h"), false);
});

test("canDeleteEventWith: rechaza con letras que no son el prefijo", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "mundo"), false);
  assert.equal(canDeleteEventWith("Hola Mundo", "ola"), false);
});

test("canDeleteEventWith: trim antes de comparar", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "  hol  "), true);
  assert.equal(canDeleteEventWith("  Hola Mundo  ", "hol"), true);
});

test("canDeleteEventWith: título corto (< 3) requiere el título completo", () => {
  // Título "AB" → solo se acepta "ab" (o "AB", etc), nunca "a" suelto.
  assert.equal(canDeleteEventWith("AB", "AB"), true);
  assert.equal(canDeleteEventWith("AB", "ab"), true);
  assert.equal(canDeleteEventWith("AB", "a"), false);
});

test("canDeleteEventWith: edge case título de exactamente 3 letras", () => {
  assert.equal(canDeleteEventWith("ABC", "abc"), true);
  assert.equal(canDeleteEventWith("ABC", "ab"), false);
});

test("canDeleteEventWith: rechaza con input vacío", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", ""), false);
  assert.equal(canDeleteEventWith("Hola Mundo", "   "), false);
});

test("canDeleteEventWith: rechaza con título vacío", () => {
  assert.equal(canDeleteEventWith("", "hol"), false);
  assert.equal(canDeleteEventWith("   ", "hol"), false);
});

test("canDeleteEventWith: maneja acentos y ñ sin problema", () => {
  // ñ = 1 char en JS (UTF-16 code unit). El prefijo es case-insensitive
  // y trim'eado. No se aplica normalización Unicode — los títulos del
  // admin suelen respetar el case.
  assert.equal(canDeleteEventWith("Año Nuevo 2026", "año"), true);
  assert.equal(canDeleteEventWith("Año Nuevo 2026", "AÑO"), true);
  assert.equal(canDeleteEventWith("Año Nuevo 2026", "aÑo"), true);
});

test("canDeleteEventWith: 2 letras con acentos NO alcanza (regla de 3)", () => {
  // "añ" son 2 chars → no alcanza aunque sea prefijo.
  assert.equal(canDeleteEventWith("Año Nuevo 2026", "añ"), false);
});

test("canDeleteEventWith: admin puede escribir el título completo (≥3 letras)", () => {
  assert.equal(canDeleteEventWith("Hola Mundo", "hola mundo"), true);
});

test("deleteEventInputPlaceholder: muestra las primeras 3 letras en lowercase", () => {
  assert.equal(deleteEventInputPlaceholder("Hola Mundo"), "hol…");
  assert.equal(deleteEventInputPlaceholder("Masterclass Email"), "mas…");
});

test("deleteEventInputPlaceholder: para título < 3 letras muestra el título completo", () => {
  assert.equal(deleteEventInputPlaceholder("AB"), "ab…");
  assert.equal(deleteEventInputPlaceholder("X"), "x…");
});

test("deleteEventInputPlaceholder: trim antes de slice", () => {
  assert.equal(deleteEventInputPlaceholder("  Hola Mundo  "), "hol…");
});

test("deleteEventInputPlaceholder: vacío si no hay título", () => {
  assert.equal(deleteEventInputPlaceholder(""), "");
  assert.equal(deleteEventInputPlaceholder("   "), "");
});
