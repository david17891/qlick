// scripts/audit-voseo.mjs
//
// Audita archivos con copy visible al cliente buscando conjugaciones
// voseantes argentinas explícitas. NO busca terminaciones -ás genéricas
// porque esas también aparecen en futuros del indicativo tuteo
// ("lo usarás", "llegarás") que son correctos en MX.
//
// v4 (súper-auditoría 2026-07-24 v3, correccion #11 v3): limites de
// palabra con lookarounds Unicode `(?<!\p{L})` y `(?!\p{L})` + flag `u`,
// porque el `\b` clasico de JS no maneja bien las terminaciones
// acentuadas (ej. "necesitás" — el `\b` despues de la "s" falla porque
// la "s" no es word char clasico en Unicode). Ademas se anade un
// `--self-test` con fixtures que DEBEN detectarse y otras que NO
// deben detectarse, para que el gate pueda demostrar que el detector
// funciona.
//
// Uso: npm run audit:voseo         (escanea src/)
//      node scripts/audit-voseo.mjs --self-test   (corre fixtures)
// Exit 0 = limpio, Exit 1 = matches encontrados o self-test falla.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/* ------------------------------------------------------------------ */
/*  Detector                                                          */
/* ------------------------------------------------------------------ */

// Cada patron esta envuelto en lookarounds Unicode para evitar el
// problema de `\b` con palabras acentuadas (correccion #11 v3).
function wordBoundary(pattern) {
  return String.raw`(?<!\p{L})(?:${pattern})(?!\p{L})`;
}

const VOSE_WORDS = [
  // imperativos voseantes
  "decí", "decime", "decinos",
  "hacé", "hacelo", "mandá", "mandame",
  "andá", "tené", "abrí", "esperá",
  "anotá", "anotame", "avisame", "avisanos",
  "copiá", "pegá", "contestá",
  "fijate", "fijáte", "pará", "sentate",
  "mirá", "miráte", "probá", "probalo",
  "comprá", "comprálo", "completá", "enviá",
  "envialo", "pasá", "pasame",
  // FIX 2026-07-24 v3 (correccion #11 v3): imperativos voseantes
  // adicionales. En MX los equivalentes SIN acento: necesitas,
  // intenta, publica, prueba, haz, pídele. Si el script detecta
  // estos, hay que corregirlos al tuteo MX.
  "necesitás", "intentá", "publicá",
  "probá", "Proba", "hacé",
  "pedile", "Pedile",
  // presente voseante
  "tenés", "querés", "pensás", "decís",
  "hablás", "sabés", "podés", "venís",
  "volvés", "traés", "ponés", "salís",
  "sos",
  "creés",
  // pronombres
  "vos",
  // muletillas
  "che", "boludo", "pibe", "chabón",
  "recontra", "morfar", "copado", "piola",
  "posta", "guita", "faso",
];

// Construimos regex unico con lookarounds Unicode + flag `u`.
const VOSE_REGEX = new RegExp(
  VOSE_WORDS.map(wordBoundary).join("|"),
  "giu",
);

/* ------------------------------------------------------------------ */
/*  ALLOWLIST contra linea completa                                  */
/* ------------------------------------------------------------------ */

// Filtra falsos positivos legitimos:
// - "Parámetros", "diámetro", "kilómetros" (sustantivos tecnicos)
// - "decime" / "pasame" dentro de regex literals (patrones de matching
//   de input del usuario, no copy del bot)
// - Strings dentro de arrays de deteccion (ej. lista de sinónimos del bot)
//
// FIX 2026-07-24 v3 (correccion #11 v3): el ALLOWLIST se aplica a la
// PALABRA matched (con lookarounds Unicode) o al contexto INMEDIATO,
// NO a la línea completa. Antes aplicaba a la línea completa y
// permitia falsos positivos cuando la línea tenia "para" como
// preposicion o "mas" como adverbio (ej. "Necesitás tu clave para
// entrar" se ignoraba por contener "para" como preposicion).
const ALLOWLIST_WORD = [
  // Sustantivos tecnicos con tildes (palabra exacta, NO substring)
  /^(?:par[áa]metros?|di[áa]metros?|kil[óo]metros?|mil[íi]metros?|cent[íi]metros?)$/iu,
  // Plurales y adverbios comunes (palabra exacta)
  /^(?:despu[ée]s|inter[ée]s)$/iu,
  // "deja" / "mira" / "cuenta" sin tilde = tuteo imperativo
  /^(?:deja|mira|cuenta)$/iu,
];

// ALLOWLIST de LINEA completa: se aplica solo cuando la línea es
// claramente codigo tecnico (regex literals, arrays de sinonimos).
// NO se usa para palabras comunes como "para" o "mas" porque dan
// demasiados falsos negativos.
const ALLOWLIST_LINE = [
  // "decime" / "pasame" / "avisame" / "mandame" como parte de regex de matching
  /\/(decime|pasame|avisame|mandame)[^/]*\/i\.test\(/i,
  /\.test\([^)]*(decime|pasame|avisame|mandame)[^)]*\)/i,
  // Arrays de sinonimos del bot (listas para matching de input)
  /["'][^"']*\b(decime|pasame|avisame|mandame|anotáme|anotame|anotá)\b[^"']*["']/i,
];

function isAllowedLine(fullLine) {
  for (const re of ALLOWLIST_LINE) {
    if (re.test(fullLine)) return true;
  }
  return false;
}

function isAllowedWord(word) {
  for (const re of ALLOWLIST_WORD) {
    if (re.test(word)) return true;
  }
  return false;
}

function findVoseInLine(line) {
  const matches = [];
  // Skip si la linea es claramente codigo tecnico (regex literals,
  // arrays de sinonimos).
  if (isAllowedLine(line)) return matches;

  const re = new RegExp(VOSE_REGEX.source, "giu");
  let m;
  while ((m = re.exec(line)) !== null) {
    // Filtrar matches que son palabras tecnicas allowlist (ej.
    // "Parámetros" si el regex lo capturara por substring, aunque
    // no deberia con los lookarounds Unicode).
    if (isAllowedWord(m[0])) continue;
    matches.push({ word: m[0], index: m.index });
  }
  return matches;
}

/* ------------------------------------------------------------------ */
/*  Self-test (correccion #11 v3: validar que el detector funciona)  */
/* ------------------------------------------------------------------ */

const SELF_TEST_POSITIVE = [
  // imperativos voseantes acentuados
  "Necesitás tu clave para entrar.",
  "Intentá de nuevo más tarde.",
  "Publicá el evento hoy mismo.",
  "Probá con otro método de pago.",
  "Hacé click aquí para confirmar.",
  "Pedile al admin que valide el voucher.",
  // variantes con mayuscula
  "Pedile al organizador que confirme.",
  "Proba con otro número.",
  // otros voseos clasicos
  "Tenés que esperar 24h.",
  "Vos podés registrarte ahora.",
  "Hola che, ¿todo bien?",
  "Decime tu nombre completo.",
  "Fijate que el email este bien escrito.",
  "Avisame cuando confirmes el pago.",
];

const SELF_TEST_NEGATIVE = [
  // imperativos tuteo MX correctos (con tilde donde corresponde)
  "Necesitas tu clave para entrar.",
  "Intenta de nuevo más tarde.",
  "Publica el evento hoy mismo.",
  "Prueba con otro método de pago.",
  "Haz click aquí para confirmar.",
  "Pídele al admin que valide el voucher.",
  // futuros del indicativo (correctos en MX, NO voseo)
  "Lo usarás mañana sin problema.",
  "Llegarás a tiempo al evento.",
  "Te avisaremos cuando esté listo.",
  // sustantivos tecnicos
  "Parámetros de configuración.",
  "El diámetro de la rueda es 26 pulgadas.",
  "Necesitas 5 kilómetros más.",
  "Estará aquí en dos días más.",
  // presente tuteo
  "Tienes que esperar 24h.",
  "Tú puedes registrarte ahora.",
  // imperativo tuteo MX con tilde (NO sin tilde — "pasame" sin tilde
  // SI es voseo; "pásame" con tilde es tuteo MX).
  "Mándame el comprobante por WhatsApp.",
  // present voseo es detectado, pero en arrays de sinonimos
  // del bot (allowlist) no se cuenta:
  "const sinonimos = ['decime tu nombre', 'pasame los datos'];",
];

function runSelfTest() {
  let failures = 0;
  console.log("Self-test del detector de voseo (correccion #11 v3):\n");
  for (const str of SELF_TEST_POSITIVE) {
    const matches = findVoseInLine(str);
    if (matches.length === 0) {
      console.log(`  FAIL (debio detectar): "${str}"`);
      failures++;
    } else {
      console.log(`  OK detecto:           "${str}" -> [${matches.map((m) => m.word).join(", ")}]`);
    }
  }
  for (const str of SELF_TEST_NEGATIVE) {
    const matches = findVoseInLine(str);
    if (matches.length > 0) {
      console.log(`  FAIL (no debio detectar): "${str}" -> [${matches.map((m) => m.word).join(", ")}]`);
      failures++;
    } else {
      console.log(`  OK rechazo (correcto):  "${str}"`);
    }
  }
  console.log("");
  if (failures > 0) {
    console.log(`✗ Self-test FALLO: ${failures} caso(s) que el detector no maneja bien.`);
    return false;
  }
  console.log("✓ Self-test OK: todos los fixtures pasan.");
  return true;
}

/* ------------------------------------------------------------------ */
/*  Walkers                                                           */
/* ------------------------------------------------------------------ */

const AUDIT_DIRS = [
  "src/lib/email/templates",
  "src/lib/whatsapp",
  "src/lib/contact",
  "src/components",
  "src/app",
];

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next" || e.name === ".git") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) {
      out.push(p);
    }
  }
}

const files = [];
for (const dir of AUDIT_DIRS) {
  try {
    statSync(dir);
    walk(dir, files);
  } catch {
    // dir doesn't exist, skip
  }
}

let totalMatches = 0;
let cleanFiles = 0;
const issues = [];

for (const f of files) {
  const content = readFileSync(f, "utf-8");
  const lines = content.split("\n");
  let fileHasMatches = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith("//") || line.trim().startsWith("*") || line.trim().startsWith("/*")) {
      continue;
    }
    const matches = findVoseInLine(line);
    if (matches.length === 0) continue;

    fileHasMatches = true;
    totalMatches += matches.length;
    issues.push({
      file: f,
      line: i + 1,
      text: line.trim().slice(0, 150),
      matches: matches.map((m) => m.word),
    });
  }

  if (!fileHasMatches) cleanFiles++;
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

function main() {
  const selfTestMode = process.argv.includes("--self-test");
  if (selfTestMode) {
    if (!runSelfTest()) process.exit(1);
    return;
  }

  console.log(`Audit de copy visible al cliente (v4, lookarounds Unicode, --self-test disponible):`);
  console.log(`  Archivos escaneados: ${files.length}`);
  console.log(`  Archivos limpios: ${cleanFiles}`);
  console.log(`  Archivos con matches: ${files.length - cleanFiles}`);
  console.log(`  Matches totales: ${totalMatches}`);
  console.log("");

  if (issues.length === 0) {
    console.log("✓ Cero voseo detectado en el código visible al cliente.");
    process.exit(0);
  }

  console.log("✗ Matches encontrados:");
  for (const i of issues) {
    console.log(`  ${i.file}:${i.line} → [${i.matches.join(", ")}]`);
    console.log(`    ${i.text}`);
  }
  process.exit(1);
}

main();
