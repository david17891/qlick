// Appendea entrada del audit 2 (XSS + rate limit) a data/PROJECT-LOG.md.
import { readFileSync, writeFileSync } from "node:fs";

const path = "C:/Users/User/Documents/Click/data/PROJECT-LOG.md";
const current = readFileSync(path, "utf8");
const stamp = new Date().toISOString();
const entry = `
## 2026-07-18 — Reauditoria: XSS en templates de email + rate limit en payments

**Commit:** (en este push)

**Cambios:**

### XSS en subjects de email (severidad media)
2 templates interpolaban \`input.eventTitle\` directo en \`<title>${'$'}{subject}</title>\`
sin \`esc()\`. Si el admin creaba un evento con titulo tipo
\`</title><script>alert(1)</script>\`, el email al cliente ejecutaba JS en
el cliente de correo (Outlook, etc.).

- \`src/lib/email/templates/payment-confirmed.ts:115\` — subject con
  \`${'$'}{esc(input.eventTitle)}\` (antes: \`${'$'}{input.eventTitle}\`).
- \`src/lib/email/templates/survey-invite.ts:74\` — mismo fix.

Inconsistencia detectada: \`event-certificate.ts\`, \`event-qr-pass.ts\`,
\`event-reminder.ts\`, \`survey-with-consent.ts\` ya usaban \`esc()\`
correctamente. Los 2 arreglados son los que se quedaron atras.

### XSS potencial en methodLabel default (severidad baja)
\`payment-confirmed.ts:79\` tenia \`default: return method;\` que devolvia
el input raw. Si paymentMethod tenia HTML/JS (no esperado pero defense
in depth), XSS en linea 158. Cambiado a \`return "Otro";\`.

### Defense-in-depth en event-reminder (severidad muy baja)
- \`event-reminder.ts:165\` — \`${'$'}{headline}\` ahora con \`esc()\`. Safe porque
  headline viene de codigo (hoursLabel literal + reminderKind enum).
- \`event-reminder.ts:176\` — \`${'$'}{body}\` NO se escapea porque
  romperia titleSafe/locSafe con doble escape. Agregado JSDoc explicito
  en \`buildReminderCopy\` documentando que subject/headline/body son
  HTML safe por construccion.

### Rate limit en /api/payments/create-checkout (severidad baja)
El endpoint publico creaba checkout sessions sin rate limit. Un atacante
podia spammear para inflar metricas del dashboard admin o tirar la quota
de Stripe. Agregado rate limit 5 req/min por IP usando
\`recordAndCheckRateLimit\` (mismo helper que submit-survey).

- \`src/app/api/payments/create-checkout/route.ts:127-156\`

### Tests de regression (11 nuevos)
- \`tests/email-payment-confirmed-template.test.mjs\` (7 tests):
  XSS en eventTitle (subject + body), XSS en notes, methodLabel default
  seguro, sin PII en subject, location/notes null se omiten.
- \`tests/email-survey-invite-template.test.mjs\` (4 tests):
  XSS en eventTitle (subject + body), URL escapada en href, sin PII en
  subject.

**Verificacion:**
- npm run type-check: OK
- npm test: 1432/1432 passing (era 1421, +11 nuevos)
- npm run lint: OK
- npm run build: OK

**Verificaciones de seguridad que PASARON (sin bug):**
- 38/38 admin routes con requireAdmin() ✓
- 3/3 cron routes con CRON_SECRET ✓
- 3/3 webhooks (Stripe, Conekta, MercadoPago) verifican firma ✓
- 1/1 whatsapp webhook verifica firma ✓
- 1/1 submit-survey con rate limit ✓
- 4 staff routes: 3 by-design (staff link token 192 bits), 1 ADMIN ✓
- 3 rutas con token publico (check-in, event-gate, event-qr): token
  192 bits, expira, inadivinable ✓
- .env.local* en .gitignore, no commiteados ✓
- .env.example sin secretos reales ✓
- Cero secrets (STRIPE/SUPABASE/VERCEL) en codigo de cliente ✓

**Deuda tecnica no urgente:**
- No hay Zod en API routes (validaciones manuales). Refactor > sprint
  dedicado.
- 100+ \`as never\` en query builder de Supabase (legitimos, NO limpiar
  a ciegas).

**Memorable porque:**
1. Defense-in-depth: los \`as any\` originales y el \`default: return method\`
   permitian que campos user-input llegaran al HTML. El \`as any\` silencia
   TS pero el bug esta en runtime, no en tipos.
2. XSS en \`<title>\` no se ve en testing visual (los email clients no
   muestran el <title>), pero algunos clientes (Outlook) SÍ ejecutan
   scripts en \`<title>\` y \`<body>\`. El bug es invisible al QA manual.
3. El \`<title>\` de un email NO es seguro aunque no se renderice
   visualmente. Si el cliente de email tiene preview pane, el <title>
   puede afectar la UI.
`;

writeFileSync(path, current + entry, "utf8");
console.log("Appended entry. New size:", (current + entry).length, "bytes");
