// scripts/_preview-survey-invite-email.mjs
//
// Genera un preview del email "Confirmanos tu asistencia" (survey-invite.ts)
// con datos SINTÉTICOS (evento ficticio, link que no funciona al click).
//
// Uso: node --env-file=.env.local --import ./tests/loader-register.mjs --experimental-strip-types scripts/_preview-survey-invite-email.mjs
//
// Output: scratch/email-survey-invite-preview.html (HTML para abrir en browser)
//
// NO manda email real (no usa Brevo). Solo renderiza el template.
// NO usa DB. No crea tokens. Link ficticio.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const surveyInviteMod = await import(
  "../src/lib/email/templates/survey-invite.ts"
);
const { renderSurveyInviteEmail } = surveyInviteMod;

// Datos SINTÉTICOS — NUNCA datos reales en preview.
const FAKE = {
  attendeeName: "Gabriela Terán", // nombre inventado
  eventTitle: "Conferencia de Marketing IA — Zoom", // evento ficticio
  eventStartsAt: "2026-07-15T17:00:00.000Z", // fecha futura ficticia
  // Link ficticio con un token que NO existe en DB. El click llevaría
  // a /encuesta/... que devolvería 404 "link inválido". Solo es para
  // mostrar la estructura visual del email.
  surveyUrl:
    "https://qlick.digital/encuesta/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
};

const rendered = renderSurveyInviteEmail({
  attendeeName: FAKE.attendeeName,
  eventTitle: FAKE.eventTitle,
  eventStartsAt: FAKE.eventStartsAt,
  surveyUrl: FAKE.surveyUrl,
});

const outDir = "scratch";
mkdirSync(outDir, { recursive: true });
const outPath = `${outDir}/email-survey-invite-preview.html`;
writeFileSync(outPath, rendered.html, "utf-8");

console.log("✓ Preview generado:");
console.log(`  HTML:  ${outPath}`);
console.log(`  Subject: ${rendered.subject}`);
console.log(`  Text (primeros 200 chars):`);
console.log("  ---");
console.log(
  rendered.text
    .split("\n")
    .slice(0, 6)
    .map((l) => `  ${l}`)
    .join("\n"),
);
console.log("  ---");
console.log("");
console.log("Para ver: abre el archivo HTML en tu browser, o");
console.log("  python -m http.server -d scratch 8080");
console.log("  → http://localhost:8080/email-survey-invite-preview.html");
console.log("");
console.log("El link de la encuesta es FICTICIO (token no existe en DB).");
console.log("Si querés el email real, deployar a Vercel preview con BREVO_API_KEY.");
