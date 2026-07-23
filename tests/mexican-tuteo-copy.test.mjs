import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const COPY_FILES = [
  "src/lib/ai/agent-prompts.ts",
  "src/lib/ai/prefill-event-rules.ts",
  "src/app/pagar/evento/[slug]/page.tsx",
  "src/app/pagar/evento/[slug]/SimulatorForm.tsx",
  "src/app/pagar/evento/[slug]/CheckoutButton.tsx",
  "src/app/pagar/[courseSlug]/page.tsx",
  "src/app/pagar/[courseSlug]/SimulatorForm.tsx",
  "src/app/pagar/[courseSlug]/CheckoutButton.tsx",
  "src/app/encuesta/[token]/EncuestaClient.tsx",
  "src/app/api/submit-survey/route.ts",
  "src/app/api/payments/create-checkout/route.ts",
  "src/app/api/admin/leads/[id]/route.ts",
  "src/app/api/staff/scan/[token]/route.ts",
  "src/app/api/staff/check-in/mark-paid/route.ts",
  "src/app/aprender/[courseSlug]/[lessonSlug]/error.tsx",
  "src/app/cursos/[slug]/error.tsx",
  "src/app/staff/scan/[eventId]/page.tsx",
  "src/components/admin/OrdersTab.tsx",
  "src/components/admin/OrderDetailDrawer.tsx",
  "src/components/events/EventDrawer.tsx",
  "src/app/admin/eventos/[id]/_components/PipelineLeadsPromovidosBoard.tsx",
  "src/app/cert/[folio]/page.tsx",
  "src/components/crm/LeadDetailDrawer.tsx",
  "src/app/inscripcion/[courseSlug]/page.tsx",
  "src/app/cursos/[slug]/page.tsx",
  "src/app/admin/eventos/[id]/page.tsx",
  "src/lib/events/importer.ts",
];

// Common Argentine voseo forms that must not reach Mexican Spanish copy.
const VOSEO_RE =
  /\b(?:respondé|escribí|pagá|pagás|elegí|probá|usá|tenés|podés|querés|sos|decí|contanos|mandá|volvé|empezá|asegurá|loguéate|disculpá|hacé|mirá|sumá|llamá|avisá|seguí|compartí|cargá|ingresá|invitá|confirmá|reservá|anotá|continuá|devolvé)\b/iu;

test("el copy visible mantiene tuteo mexicano", async () => {
  const offenders = [];
  for (const relativePath of COPY_FILES) {
    const source = await readFile(resolve(ROOT, relativePath), "utf8");
    const match = source.match(VOSEO_RE);
    if (match) offenders.push(`${relativePath}: ${match[0]}`);
  }

  assert.deepEqual(offenders, []);
});

test("las plantillas de WhatsApp no contienen voseo", async () => {
  const source = await readFile(resolve(ROOT, "src/lib/whatsapp/bot-engine.ts"), "utf8");

  assert.match(source, /Toca Inscribirme o escribe tu pregunta/);
  assert.match(source, /Responde con un botón o escribe tu pregunta/);
  assert.match(source, /¿Me confirmas cuál\? Responde con el número/);
  assert.doesNotMatch(source, /Toca Inscribirme o escribí tu pregunta/);
  assert.doesNotMatch(source, /Respondé con un botón o escribí tu pregunta/);
  assert.doesNotMatch(source, /¿Me confirmás cuál\? Respondé/);
});
