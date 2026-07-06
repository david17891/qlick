# HANDOFF v0.8.0 — Wizard WhatsApp funcional + Español mexicano

> **Release point:** `v0.8.0` — marca el momento en que el wizard de encuesta
> post-evento funciona end-to-end vía WhatsApp Cloud API, el copy es 100%
> español mexicano consistente, y el admin tiene visibilidad real de las
> respuestas y calificaciones en el panel.
>
> **Branch / commit:** `main` @ `<este commit>` (HEAD al tag `v0.8.0`)
> **Tag:** `v0.8.0` (`git tag v0.8.0 -m "..."` + `git push --tags`)
> **Fecha:** 2026-07-06
> **Tests:** 535/535 verde · type-check ✓ · lint ✓ (0 warnings) · build ✓

---

## 🎯 Qué incluye este release

Este release acumula y cierra **cuatro bloques de trabajo** que juntos hacen
que el bot WhatsApp sea finalmente utilizable en producción para cohorts
reales:

### 1. Wizard de encuesta post-evento funcional (G-15 r1-r5)

El path completo del wizard — **Q1 (claridad) → Q2 (aplicabilidad) → Q3 (fuente) →
q_consent → q_business → cierre** — funciona end-to-end por WhatsApp Cloud API.

**Problemas resueltos (todos verificados con logs de Vercel):**

| Iter | Problema | Root cause | Fix |
| --- | --- | --- | --- |
| r1 | "Muy claro no avanza al Q2" | Meta NO manda `buttonId` cuando hay dedupe/retry/button reply reentrega | `synthesizeSurveyOptionFromText` + `buildDynamicButtonIdFromOption` mapean texto crudo (`"Muy claro"`) a `buttonId` cuando Meta omite el field |
| r2 | Wizard se rompe con formato dinámico | El detector solo reconocía buttonIds legacy cortos (`survey_q1_very_clear`); Meta en realidad manda formato dinámico (`survey_q1_clarity_very_clear`) | `detectSurveyButtonAny` unifica legacy + dinámico en una sola función. `bot-engine.ts:3270` ahora detecta ambos formatos |
| r3 | q_consent "Sí" no avanza, salta a LLM | (a) intent caía a `question`, LLM respondía con follow-up bucket; (b) `survey_q4_text` sobreescribía `responses.q_consent` con texto libre posterior; (c) `consent_to_contact` derivado de `businessCaptured` siempre false | Nuevo intent `survey_q_consent_continue` — "Sí" en q_consent avanza a q_business (step 5), "No" cierra; `survey_q4_text/skip` aceptan step 4 OR 5; `consent_to_contact` se deriva de la respuesta explícita |
| r4 | Encuestas tab muestra "(sin respuestas)", Leads promovidos sin info | `detectSurveyShape` solo reconocía formato legacy → formato dinámico caía en `unknown` → placeholder. `mapLeadRowToLead` no incluía `score/qualification/survey_offer_sent_at` | Rama "dynamic" en `detectSurveyShape`, labels legibles para `q_consent: Sí/No`. `mapLeadRowToLead` ahora mapea score/qualification/surveyOfferSentAt. `PipelineCard` renderiza badges (🎯 Score, HOT/WARM/MQL/COLD con tone, ✓ Consent) |
| r5 | "Mensaje extra" en cierre del wizard | El fix F6 (auditoría previa) agregó send del follow-up bucket HOT/MQL/coldWarm al close path para simetría con `/api/submit-survey`. Pero el close YA mandaba thank-you. Y el bucket se enviaba con `provider.send` directo (sin `persistConversation`) → aparecía en WhatsApp pero NO en DB | Removido el follow-up bucket send de `survey_q4_text` y `survey_q_consent_continue`. Solo thank-you de cierre. Si el admin quiere disparar bucket follow-up, usa `/api/events/:id/send-survey-offers` desde el panel |

### 2. Copy 100% español mexicano consistente (G-15 r6-r7)

David reportó (sesión 2026-07-06 ~15:10) que el bot usaba formas rioplatenses
que no se dicen en México: "contanos", "escribinos", "por acá", más voseo
("querés", "tenés", "podés", "necesitás", "decí", "tocá", "Disculpá").

**Scope del fix (consistencia full del product surface):**
- 8 archivos del WhatsApp bot + emails transaccionales (pase 1)
- 12 archivos de páginas web admin/student/staff + LLM system prompt (pase 2)
- **NO tocado:** 9 comentarios de código (no son user copy, cambiarlos sería ruido)

**Mappings aplicados:**
- voseo → tuteo: "querés" → "quieres", "tenés" → "tienes", "podés" → "puedes", etc.
- "escribinos" → "escríbenos", "contanos" → "cuéntanos"
- "por acá" → "por aquí", "Disculpá" → "Disculpa", "respondé" → "responde"

### 3. Name capture + wizard close (Fase name capture, commits previos)

Migración `20260706120000_force_name_capture_and_default.sql` fuerza captura
de nombre cuando `requires_name=true` y aplica defaults razonables.
Commits previos a r1: `e4bd7d3`, `6e9207d`, `e374e04`, `4771ce8`, `1987b00`,
`4a3fd5e`, `5f13028`.

### 4. Stage snapshots pre-deploy (acumulado de auditoría nocturna)

Bloque de fixes nocturnos 2026-07-04 (commits `95c7b64`..`85211e6`):
middleware headers, outbound idempotency, PII compliance en logs, rate limit
per-phone DeepSeek, AbortController 8s a Meta Cloud API, webhook hard-fail
gate (`WHATSAPP_WEBHOOK_SECRET`), etc.

---

## ✅ Lo que funciona end-to-end (production)

### Wizard de encuesta WhatsApp (core de este release)

1. Bot pregunta Q1 (claridad del evento) → lead clickea botón "Muy claro"
   → Meta manda `button.id = "survey_q1_clarity_very_clear"` (formato dinámico)
   → `detectSurveyButtonAny` matchea → wizard avanza a Q2.
2. Q2 (aplicabilidad), Q3 (cómo se enteró), q_consent (¿contactar?) →
   mismo flujo de botones dinámicos.
3. q_consent "Sí" → wizard avanza a q_business (step 5) → lead puede escribir
   texto libre o clickear "Saltar".
4. Cierre: thank-you estándar (sin mensaje duplicado, sin follow-up bucket).
5. Promotion engine: aplica score (HOT/MQL/coldWarm), persiste en `event_surveys`,
   promueve lead si aplica.

### Admin panel `/admin/eventos/[id]`

- **Tab Encuestas:** muestra respuestas con labels legibles (incluye
  "Consentimiento: Sí/No"), formato dinámico soportado.
- **Tab Leads promovidos:** renderiza badges inline con score, calificación
  (HOT/WARM/MQL/COLD con tone según bucket), y ✓ Consent si
  `consent_toContact=true`.

### Bot fallback paths

- **provide_name (nombre muy largo):** "El nombre que mandaste es muy largo.
  ¿Me lo puedes escribir más corto? (máximo 100 caracteres)" — ya en MX.
- **provide_name (parece pregunta):** sigue rechazando inputs no-nombre.
- **LLM fallback (no entiende):** "Disculpa, no pude procesar tu mensaje.
  ¿Me lo puedes reformular? Si necesitas atención personalizada escríbenos
  a hola@qlick.marketing." — ya en MX.
- **opt_out:** "Listo, no te contacto más. Si cambias de opinión, escríbenos." — ya en MX.

### Emails transaccionales

- `event-reminder.ts` (24h/2h antes del evento): "Si no puedes asistir, no hace
  falta que respondas — liberamos tu lugar. Si tienes dudas, responde este
  email." — ya en MX.
- `event-qr-pass.ts` (pase digital con QR): "Si no puedes asistir, no hace
  falta que hagas nada. Si tienes dudas, responde este email y te ayudamos."
  — ya en MX.

### Páginas web user-facing

- `/encuesta/[token]` (lead llena encuesta por web): "Si necesitas modificar
  algo, escríbenos a hola@qlick.marketing."
- `/check-in/[token]`: "¿Cambio de planes? Si no puedes asistir, no hace falta
  que hagas nada — el registro expira solo."
- `/login`: "Útil si no quieres usar tu cuenta de Google."
- `/aprender/[courseSlug]/[lessonSlug]`: "Para acceder a esta lección,
  primero tienes que pagar $X MXN por el curso."
- `/inscripcion/[courseSlug]`: "¿Solo quieres ver el curso?"

---

## ⚠️ Lo que funciona pero es DEMO (no real)

Ver `docs/CRM_MODE_STATUS.md` para detalle. Resumen:

| Sección CRM | Estado | Por qué |
| --- | --- | --- |
| **Conversaciones** | 🟡 Demo | Lee `src/lib/data/crm-data.ts`. Mensajes ficticios. No hay WhatsApp Business API. |
| **Calendario / Citas** | 🟡 Demo | Lee mock. No hay Google Calendar integration. |
| **Agente IA** | 🟢 Real (con switch) | DeepSeek V4-Flash + V4-Pro con escalado automático (commit `1d5131f`). |
| **WhatsApp providers** | 🟡 Parcial | `manual_wa` activo (click-to-chat real), `meta_cloud_api` funcional para inbound/outbound, `bsp` es stub. |
| **Sales Owners** | 🟡 Demo | Asignación a leads es ficticia. |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de links `wa.me` pre-armados. Admin abre cada uno manual. |

---

## 🐛 Issues activos (post-v0.8.0)

### Cerrados en este release

- **G-15 r0 (David 2026-07-06 12:36):** "Muy claro no avanza wizard" — root
  cause = Meta omite buttonId en dedupe/retry. Fixed en r1+r2.
- **G-15 r3 (David 2026-07-06 13:30):** "Encuestas=0, Leads promovidos=0,
  no me da info del lead". Fixed en r3+r4.
- **G-15 r5 (David 2026-07-06 14:55):** "Mensaje extra en cierre wizard".
  Fixed en r5.
- **G-15 r6 (David 2026-07-06 15:10):** "Contanos / escribinos / por acá
  no se dicen en español mexicano". Fixed en r6 (bot+email) + r7 (web).

### Conocidos (no bloquean release v0.8.0)

- **I-2:** CRM híbrido (algunas pestañas real, otras mock) — banner por
  sección pendiente. **Scope: Fase 7+** (necesita migrar Conversations/
  Calendario a Supabase real).
- **I-4:** Re-prompting de auth al cambiar de método (OAuth → magic link →
  loop). **Scope: 1 hora fix.**
- **G-5:** Meta templates (`conf_bienvenida`, `conf_info_evento`,
  `conf_confirmacion_registro`) — necesarias para outreach proactivo.
  **Tiempo Meta: 24-48h aprobación.** David es quien las pide.
- **G-12:** `findLeadByPhone` timeouts intermitentes (5s) — commit `79b32b0`
  aplica 3s timeout + 1 retry pero a veces Supabase se pone lento.
- **G-16:** inconsistencias código/docs (parcialmente cerradas en este release).
- **G-17:** app fantasma Meta `2202427980234937` — probablemente requiere soporte
  Meta directo.

Detalle completo en `docs/OPEN_ITEMS.md`.

---

## 🧪 Cómo verificar (para próxima sesión)

```bash
# 1. Tests verde
npm run type-check   # 0 errores
npm run lint         # 0 warnings
npm test             # 535/535 verde
npm run build        # Compila, ~55 rutas

# 2. Wizard end-to-end vía WhatsApp Cloud API
# Login admin con david17891@gmail.com → /admin/eventos/[id]
# Click "Probar wizard" → manda "Hola" al phone sandbox
# → Bot responde bienvenida
# → Lead clickea "Muy claro" → wizard avanza
# → Verificar DB:
#   - event_surveys.responses tiene q1_clarity="very_clear"
#   - leads.score calculado
#   - lead_whatsapp_conversations: thank-you persistido, sin mensaje extra

# 3. Admin Encuestas tab
# /admin/eventos/[id] → tab Encuestas → debe mostrar respuestas con
# labels legibles (no "(sin respuestas registradas)")

# 4. Admin Leads promovidos
# /admin/eventos/[id] → tab Leads promovidos → debe mostrar badges
# (🎯 Score X, HOT/WARM/MQL/COLD, ✓ Consent)

# 5. Copy MX verificado
# grep -r "querés\|tenés\|escribinos\|contanos\|por acá" src/lib src/app
# → 0 hits en user copy (solo comments defensivos)
```

---

## 📦 Commits incluidos en v0.8.0 (G-15 cluster)

Lista resumida de los commits que cierran este release (no exhaustiva
del full de `main`, solo los del cluster G-15 + Fase name capture + copy MX):

| Commit | Descripción |
| --- | --- |
| `e4bd7d3` | force name capture (Fase name capture) |
| `6e9207d` | force name capture follow-up |
| `e374e04` | name default schema |
| `4771ce8` | name capture tests |
| `1987b00` | force name capture final |
| `4a3fd5e` | name capture docs |
| `5f13028` | name capture final integration |
| `643acf4` | G-15 r1: synthesizeSurveyOptionFromText |
| `bd60916` | G-15 r1: docs |
| `c120c47` | G-15 r2: detectSurveyButtonAny (formato dinámico) |
| `4f1ea7d` | G-15 r2: docs |
| `e4d7988` | G-15 r3: survey_q_consent_continue |
| `bec491c` | G-15 r3: docs |
| `91277c8` | G-15 r4: Encuestas + Leads UI |
| `9f81ce7` | G-15 r4: docs |
| `8f7e60b` | G-15 r5: quitar follow-up bucket close |
| `738839e` | G-15 r5: docs |
| `aef120f` | G-15 r6: español MX en bot+email |
| `a628f50` | G-15 r6: docs |
| `365b620` | G-15 r7: español MX en web pages |
| `560eae5` | G-15 r7: docs |
| `<este commit>` | v0.8.0 handoff + STATUS + ROADMAP + CHANGELOG + tag |

---

## 🚦 Para volver a este punto (rollback)

Si en cualquier momento algo se rompe en producción, el rollback es:

```bash
# Opción A: revertir a v0.8.0 tag (estable)
git checkout v0.8.0

# Opción B: revertir los commits G-15 manteniendo resto
git revert 643acf4..<último-commit-G-15>

# Opción C: branch de fix forward
git checkout -b fix/v0.8.0-hotfix v0.8.0
```

---

## 📚 Docs de referencia (creados/actualizados en este release)

- `docs/HANDOFF_v0.8.0_FUNCIONAL.md` (este doc)
- `docs/STATUS.md` — snapshot vivo
- `docs/ROADMAP.md` — plan + estado v0.8.0
- `CHANGELOG.md` — entrada v0.8.0 agregada
- `data/PROJECT-LOG.md` — entries G-15 r1-r7
- `package.json` — version bump a `0.8.0`

---

## 🎓 Lecciones aprendidas (para futuras sesiones)

### Tests E2E con DB limpia no detectan bugs del path webhook → bot

La trampa del r2: simulé `buttonId` en formato legacy (`survey_q1_very_clear`)
en mi E2E y pasó. Pero Meta en prod usa formato dinámico
(`survey_q1_clarity_very_clear`). El bug pasó.

**Regla:** tests E2E deben usar el formato EXACTO que produce prod,
no uno equivalente que "debería funcionar igual". Para verificar,
capturar el webhook real de Meta y reproducirlo byte-by-byte.

### Anti-invention trap — NO fabricar comportamiento de servicios

Yo dije que "Supabase detecta tokens pegados en chat y los rota
automáticamente". Falso, sin evidencia. La razón válida para no pegar
tokens por chat es solo de seguridad (logs de Mavis son persistentes),
no comportamiento del servicio.

**Regla:** si no verifiqué con doc oficial o fuente primaria, NO afirmar
que un servicio hace X. Si especulo, marcarlo como hipótesis y proponer
verificarlo.

### Fix defensivo (causa raíz desconocida) NO es aceptable cuando el root cause es identificable

David lo dejó claro: "verificar logs de Vercel, no inventar fix defensivo".
En G-15 r0, el fix obvio era agregar fallback defensivo (regex más
permisivo, "ya va a funcionar"). El fix correcto era entender QUE Meta
omite buttonId en dedupe/retry y agregar síntesis explícita.

**Regla:** antes de agregar fallback defensivo, gastar 15 min en leer logs
y reproducir el path real. Si el root cause es identificable, el fix
correcto es mejor que el defensivo, aunque tome más tiempo.

---

## 🎟️ Resumen ejecutivo (para David)

**v0.8.0 es el primer punto estable del producto donde:**
1. El wizard de encuesta WhatsApp funciona end-to-end sin que el LLM "robe"
   turnos del flow conversacional.
2. El admin tiene visibilidad real de respuestas y calificaciones sin
   tener que abrir el drawer del lead.
3. Todo el copy user-facing suena en español mexicano, no rioplatense.
4. No hay mensajes fantasma que aparezcan en WhatsApp pero no en DB.

**Lo que sigue (post-v0.8.0):**
- Meta templates → outreach proactivo (David las pide, 24-48h Meta).
- OAuth loop I-4 (1 hora fix).
- Banner por sección CRM (híbrido real/demo).
- `findLeadByPhone` timeouts (investigar).

**No bloquean v0.8.0 porque:**
- Meta templates: bloqueadas por Meta, no por nosotros.
- I-4: workaround conocido (force-reload funciona).
- Banner: visual, no funcional.
- Timeouts: 3s + retry ya mitiga la mayoría de casos.

**Si algo se rompe, rollback a `v0.8.0`.**