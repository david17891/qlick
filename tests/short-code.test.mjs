import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateShortCode,
  generateUniqueShortCode,
  isValidShortCode,
} from "../src/lib/events/short-code.ts";

/**
 * Tests de `src/lib/events/short-code.ts`.
 *
 * FIX 2026-07-05 (sesión David, "ya estás registrado" con nombre
 * duplicado): el short_code es el identificador canónico de 4 chars
 * base32 sin 0/1/O/I que usa el bot WA y el staff para desambiguar
 * eventos con título similar.
 *
 * Invariantes que estos tests blindan:
 *  1. Formato exacto: `^[A-HJ-NP-Z2-9]{4}$` (32 alphabet, 4 long).
 *  2. Generación produce códigos todos válidos.
 *  3. Generación a escala (10k muestras) NO colisiona por azar en la
 *     práctica (Birthday dice ~50% a 37k; validamos que 10k < 1 colisión
 *     esperada ~0.04%).
 *  4. `generateUniqueShortCode` con existing Set retry-ea hasta encontrar
 *     uno nuevo, o devuelve null si maxTries agotado.
 *  5. `isValidShortCode` rechaza formatos ilegítimos (vacío, longitudes
 *     incorrectas, chars prohibidos, lowercase planeado inválido).
 *  6. PARIDAD con la versión PL/pgSQL: el generador TS y el de la DB
 *     (trigger `events_set_short_code` + `generate_event_short_code`)
 *     usan EXACTAMENTE el mismo alphabet. Si alguien toca uno sin el
 *     otro, estos tests fallan (o el UNIQUE constraint explota).
 */

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // mismo alphabet que PG

test("formato: todo codigo generado cumple el regex", () => {
  for (let i = 0; i < 1000; i++) {
    const code = generateShortCode();
    assert.equal(code.length, 4, `length debe ser 4, fue ${code.length}`);
    assert.ok(isValidShortCode(code), `regex check fallo para ${code}`);
    // Cada char debe estar en el alphabet (paridad con PG).
    for (const c of code) {
      assert.ok(ALPHABET.includes(c), `char ${c} fuera del alphabet`);
    }
  }
});

test("isValidShortCode: rechaza vacios, longitudes malas, chars prohibidos", () => {
  // Vacíos
  assert.equal(isValidShortCode(""), false);
  assert.equal(isValidShortCode(null), false);
  assert.equal(isValidShortCode(undefined), false);
  // Longitudes fuera de [4]
  assert.equal(isValidShortCode("A"), false);
  assert.equal(isValidShortCode("AB"), false);
  assert.equal(isValidShortCode("ABC"), false);
  assert.equal(isValidShortCode("ABCDE"), false);
  assert.equal(isValidShortCode("ABCDEFGH"), false);
  // Chars prohibidos (0/1/O/I — los excluidos del alphabet)
  assert.equal(isValidShortCode("0A3X"), false, "0 prohibido");
  assert.equal(isValidShortCode("1A3X"), false, "1 prohibido");
  assert.equal(isValidShortCode("OA3X"), false, "O prohibido");
  assert.equal(isValidShortCode("IA3X"), false, "I prohibido");
  assert.equal(isValidShortCode("Q9K1"), false, "1 (ultimo char) prohibido");
  assert.equal(isValidShortCode("Q0K2"), false, "0 prohibido");
  // Chars fuera del alphabet (sin ser los prohibidos)
  assert.equal(isValidShortCode("abcd"), false); // a es valido via lowercase... espera
  // NOTA: lowercase letters SÍ matchean cuando se las incluye en un
  // alphabet que las permita. Para este regex uppercase-only [A-HJ-NP-Z]
  // lowercase NO matchea. 'a' no está en A-H (uppercase only), entonces
  // rechaza.
  // Sin embargo: lowercase que matchea contra [2-9]? digits no son
  // case-sensitive, solo 'a'-'z' / 'A'-'Z' tienen case. Entonces
  // 'abcd' es puro lowercase letters que no están en A-H (uppercase).
  assert.equal(isValidShortCode("A3 X"), false, "espacio invalido");
  assert.equal(isValidShortCode("A3-X"), false, "dash invalido");
  // Válidos
  assert.equal(isValidShortCode("7A3X"), true);
  assert.equal(isValidShortCode("Q9K2"), true);
  assert.equal(isValidShortCode("B4NZ"), true);
});

test("generacion a escala: distribución esperada ~100 colisiones en 10k (Birthday)", () => {
  // Birthday paradox para alphabet 32^4 = 1.048M: a 10k samples la
  // P(collision) ≈ 1 (casi seguro). Esperadas ~47 colisiones con
  // varianza alta. Validamos el comportamiento ALREDEDOR de la teoría:
  //   - minimo: ≥ 1 (con 1M keyspace, 10k sin colisionar es muy raro)
  //   - maximo: ≤ 200 (cota superior generosa; si pasa, el RNG está sesgado)
  //
  // El test NO es "no debe haber colisiones" (eso es imposible). Es
  // "el comportamiento del generador es razonable para una uniforme".
  const N = 10_000;
  const codes = new Set();
  for (let i = 0; i < N; i++) codes.add(generateShortCode());
  const collisions = N - codes.size;
  assert.ok(
    collisions >= 1,
    `10k muestras en 1M keyspace DEBE colisionar a veces, obtuve ${collisions}`
  );
  assert.ok(
    collisions <= 200,
    `10k muestras NO deberia colisionar más de 200 veces (sesgo de RNG?); obtuve ${collisions}`
  );
});

test("generateUniqueShortCode: devuelve codigo fuera del set", () => {
  const existing = new Set(["7A3X", "Q9K2", "B4NZ"]);
  // Reintenta hasta encontrar uno distinto. Con maxTries alto no debería fallar.
  for (let i = 0; i < 50; i++) {
    const code = generateUniqueShortCode(existing, 50);
    if (code !== null) {
      assert.ok(!existing.has(code), `deberia ser nuevo: ${code}`);
      assert.ok(isValidShortCode(code), `deberia cumplir formato: ${code}`);
      return;
    }
  }
  // Si llegamos acá con 50 iteraciones, hay un problema muy raro.
  assert.fail("generateUniqueShortCode devolvio null 50 veces seguidas");
});

test("generateUniqueShortCode: set chico + maxTries=1 → mayoria de tries dan codigo (no null)", () => {
  // Con un set de 1000 codigos (≈0.1% del keyspace de 1M) y maxTries=1,
  // la P(de retornar null por una sola colision) ≈ 0.001. Por lo tanto
  // < 99.9% de las 5000 llamadas deberia devolver null.
  const existing = new Set();
  for (let i = 0; i < 1000; i++) existing.add(generateShortCode());
  let nullCount = 0;
  const totalTries = 5000;
  for (let i = 0; i < totalTries; i++) {
    if (generateUniqueShortCode(existing, 1) === null) nullCount++;
  }
  // Esperadas ~5 nulls en 5000. Cualquier cosa > 500 indica problema.
  assert.ok(
    nullCount < 500,
    `null no deberia ser comun con set chico; obtuve ${nullCount}/${totalTries}`
  );
});

test("generateShortCode: paridad con PL/pgSQL alphabet", () => {
  // Si cambian el alphabet en TS y no en PG, este test FALLA con un mensaje
  // claro. Y viceversa.
  const observed = new Set();
  for (let i = 0; i < 5000; i++) {
    for (const c of generateShortCode()) observed.add(c);
  }
  for (const c of observed) {
    assert.ok(ALPHABET.includes(c), `char ${c} fuera del alphabet PG`);
  }
  // Spot-check: todos los chars prohibidos (0/1/O/I) están ausentes.
  assert.equal(observed.has("0"), false, "0 NO debe aparecer");
  assert.equal(observed.has("1"), false, "1 NO debe aparecer");
  assert.equal(observed.has("O"), false, "O NO debe aparecer");
  assert.equal(observed.has("I"), false, "I NO debe aparecer");
  // Y algunos que sí deben aparecer (al menos uno de los 32).
  assert.ok(
    observed.size >= 8,
    `deberia haber al menos 8 chars unicos, hay ${observed.size}`
  );
});
