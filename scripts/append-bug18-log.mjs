// Append bug 18 entry al PROJECT-LOG (append-only).
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:\\Users\\User\\Documents\\Click\\data\\PROJECT-LOG.md";
const current = readFileSync(path, "utf8");

const entry = `

---

## 2026-07-18 — Bug 18: FALLBACK provide_name guarda body con email embebido en leads.name

**Síntoma (David probando V3 con 2 números, 2026-07-18):** El lead con
phone \`+526531742365\` tenía \`leads.name = "David Antonio y
David17891@gmail.com"\` — concatenación del nombre real con el email
y un " y " (conjunción) entre ellos. La pantalla admin de leads lo
mostraba como "David Antonio y david17891@gmail.com" en el campo
NOMBRE. Y el bot respondía en siguientes turnos con "Gracias David
Antonio y David17891@gmail.com" en el saludo.

**Causa raíz (verificada con el log de conversación):**

1. **17 jul 13:29:25** — David envió: \`"David Antonio y
   David17891@gmail.com"\` (TEXTO LITERAL, con la palabra "y" como
   conector en español).
2. Bot detectó \`implicit_capture\` correctamente y separó:
   - \`name = "David Antonio y"\` (con "y" incluido, sin el email)
   - \`email = "david17891@gmail.com"\`
3. **PERO** el FALLBACK de \`provide_name\` (linea 5751-5772) también
   disparó con \`name = body.trim()\` = \`"David Antonio y
   David17891@gmail.com"\` (el body COMPLETO, sin strip del email).
4. Las validaciones del FALLBACK (looksLikeEmail, wordCount >= 2,
   length <= 100, isValidHumanName) todas pasaron porque el body
   tenía 4 palabras, todas con letras, y NO era SOLO un email (era
   "David Antonio y David17891@gmail.com" — un email embebido, no
   un email puro).
5. El UPDATE a \`leads.name\` se ejecutó con el body completo
   contaminado: \`"David Antonio y David17891@gmail.com"\`.
6. En turnos siguientes, el bot usa \`lead.name\` en el saludo
   (\`interactive_event_inscribir\`) → "Gracias David Antonio y
   David17891@gmail.com" en el log.

**Fix (1 condicion agregada al FALLBACK):**

\`\`\`typescript
const hasEmbeddedEmail = /[^\\s@]+@[^\\s@]+\\.[^\\s@.,;:]+/.test(name);
if (
  !looksLikeEmail &&
  !hasEmbeddedEmail &&  // <-- NUEVO: skip si el body tiene email embebido
  wordCount >= 2 &&
  name.length <= 100 &&
  isValidHumanName(name)
) { ... persistir ... }
\`\`\`

Cuando el body tiene email embebido, el FALLBACK ahora salta el UPDATE
y deja que el bloque \`implicit_capture\` (linea 6978+) maneje la
persistencia con el nombre limpio (sin el email). Mismo regex que
\`extractNameAndEmailTogether\` (linea 697) para consistencia.

**Cleanup de BD:**

Lead con \`phone_normalized = +526531742365\` tenia
\`leads.name = "David Antonio y David17891@gmail.com"\`. Limpiado
a \`leads.name = "David Antonio"\` via SQL directo. Email NO fue
afectado (\`david17891@gmail.com\` ya estaba correcto).

**Verificación del fix:**

Una vez deployado, el bot NO debe pisar \`leads.name\` con el body
completo cuando hay email embebido. Test E2E pendiente para validar
en producción.

**Commit:** \`fix(bot): FALLBACK provide_name skip cuando body tiene email embebido\`
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended bug 18 entry. New size:", (current + entry).length, "chars");
