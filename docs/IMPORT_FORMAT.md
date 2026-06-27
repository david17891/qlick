# Formato esperado de Excel para el Import Wizard

> **TL;DR:** Subí un `.xlsx` con headers claros y datos limpios. Si el Excel
> viene sucio del cliente, pasalo primero por ChatGPT/Gemini con el prompt
> de más abajo. El wizard rechaza filas que no encajan al formato (no inventa
> datos — eso es un constraint legal).

---

## Por qué determinista y no AI integrada

El wizard **NO usa AI** para transformar datos. Razones en
`docs/ARCHITECTURE.md` y `docs/AI_AGENT_GUARDRAILS.md`:

1. **Legal** — GDPR (UE) y LFPDPPP (México) prohíben inventar o inferir PII
   sin base explícita. La AI "arreglando" consent de `"sí plis"` a `Sí`
   sería **fabricar consentimiento**.
2. **Calidad** — Inventar un dígito de phone → mensaje a número quemado →
   Meta banea la cuenta. Inventar email → bounce → dominio quemado en
   Mailgun/Resend. Una fila inventada puede dañar infra seria.
3. **Audit** — Con reglas deterministas sabemos exactamente qué
   transformación aplicó cada fila (audit trail completo). Con AI el
   cambio es opaco.

**La AI SÍ puede usarse afuera del wizard** (en ChatGPT/Gemini del admin)
para limpiar el Excel antes de subirlo. Eso está OK porque el admin revisa
cada cambio antes de impactar producción.

---

## Spec por tipo de import

### `confirmation` — Confirmaciones de asistencia (RSVPs)

| Columna | ¿Requerida? | Formato esperado | Ejemplo |
|---|---|---|---|
| Nombre | ✅ | 2+ palabras, sin números | "Ana Pérez" |
| Email | ✅ (o Phone) | RFC 5322 simplificado | "ana.perez@example.com" |
| Teléfono | ✅ (o Email) | 10 dígitos MX → se prefija `+52` | "6861234567" |
| Fuente | opcional | texto libre, mapeado al enum | "messenger", "whatsapp", "form", "manual" |

**Sin email ni phone = fila rechazada.** Necesitamos al menos un canal.

### `attendee` — Asistentes (check-ins)

| Columna | ¿Requerida? | Formato esperado | Ejemplo |
|---|---|---|---|
| Nombre | opcional* | string no vacío | "Ana Pérez" |
| Email | opcional* | RFC 5322 simplificado | "ana@example.com" |
| Teléfono | opcional* | 10 dígitos MX | "6861234567" |
| Asistió | opcional | Sí/No/Yes/No/✓/✗ | "Sí" |
| Fuente | opcional | texto libre | "check_in", "zoom" |

*Al menos uno de (Nombre, Email, Phone). Asistentes "walk-in" sin nombre
siguen siendo válidos si tenemos cómo contactarlos.

### `survey` — Encuestas post-evento

| Columna | ¿Requerida? | Formato esperado | Ejemplo |
|---|---|---|---|
| Nombre | opcional | string | "Ana Pérez" |
| Email | ✅ (o Phone) | RFC 5322 simplificado | "ana@example.com" |
| Teléfono | ✅ (o Email) | 10 dígitos MX | "6861234567" |
| Consent | opcional** | Sí/No/Yes/No/✓/✗ | "Sí" |
| Interés | opcional | texto libre | "info de curso", "precio" |

**Sin email ni phone = fila rechazada.** Sin consent = fila rechazada
(no se promueve a lead, pero se guarda para visibilidad).

**Sin consent con valor parseable = fila rechazada.** Es el campo más
estricto porque determina si se puede contactar comercialmente al prospecto.

---

## Headers reconocidos (sinónimos)

El importer auto-detecta headers. Si tu Excel tiene alguna variante, la
reconocerá. Si NO la reconoce, te sugerirá la más cercana (fuzzy match).

| Canónico | Variantes aceptadas |
|---|---|
| `name` | nombre, nombres, name, full name, fullname, nombre completo |
| `email` | correo, email, e-mail, mail, correo electronico, email address |
| `phone` | teléfono, telefono, phone, celular, tel, whatsapp, numero |
| `consent` | consent, consentimiento, acepta, contact permission, ok contactar |
| `interest` | interés, interes, interest, comentarios, tema |
| `source` | fuente, source, origen, canal, channel |
| `attended` | asistió, asistio, attended, presente, attendance |

**Headers NO reconocidos** (ej: "Observaciones", "Fecha", "#") se descartan
silenciosamente. Si querés que se preserven, contactá a Mavis — agregamos
el sinónimo al importer.

---

## Transformaciones que el wizard aplica automáticamente

**Estas son deterministas y seguras** (no inventan datos):

- **Phone:** strip de no-dígitos → si quedan 10 dígitos, se prefija `+52`. Si
  quedan 12 y empieza con `52`, se mantiene. Si tiene 9 dígitos → warning
  explícito "fila X · phone: 9 dígitos (esperaba 10)".
- **Nombre:** trim + capitalize cada palabra (`"ana PÉREZ"` → `"Ana Pérez"`).
- **Email:** trim + lowercase (`"Ana@Example.COM  "` → `"ana@example.com"`).
- **Source:** lowercase + match con sinonimos (`"Messenger"` →
  `"imported_excel"`).

**Estas NO se aplican** (por seguridad legal):

- ❌ Inventar dígitos faltantes del phone
- ❌ Inferir email cuando falta
- ❌ Convertir "sí plis" / "ok" a consent=true (si el Excel tiene variantes,
  las agregamos al HEADER_SYNONYMS, pero no inventamos)
- ❌ Corregir typos en nombres (si el admin escribió "Josefina" se queda
  como "Josefina" — que el admin corrija manualmente o lo limpie en el
  Excel antes de subir)

---

## Limpieza con ChatGPT/Gemini antes de subir (opcional)

Si el Excel viene con headers raros o data sucia, podés pasarlo primero por
tu chat de AI favorita. Prompt sugerido:

```
Tengo este Excel de [confirmaciones/asistentes/encuestas] del evento X.
Reformateámelo a la spec de Qlick Marketing:

- Headers exactos (en español, una sola fila): Nombre, Email, Teléfono,
  [Fuente/Consent/Interés según aplique]
- Limpia espacios al inicio/fin
- Teléfonos en formato 10 dígitos sin espacios ni guiones (ej: 6861234567)
- Emails en lowercase
- Nombres con capitalización correcta (cada palabra empieza con mayúscula)
- Eliminá filas vacías
- Si una fila no tiene email NI teléfono, marcala con un # al inicio
  del nombre para que la descarte
- Si una fila tiene consent dudoso (ej: "sí plis"), marcala con
  #CONSENT-AMBIGUOUS al inicio para revisión manual

Devolveme el Excel limpio en la misma estructura.
```

Después subís el Excel limpio al wizard. El importer lo va a aceptar sin
warnings.

---

## ¿Cómo limpio un Excel manualmente?

1. Abrilo en Excel/Google Sheets
2. Fila 1 = headers (en español). Ver la tabla de arriba.
3. Datos empiezan en fila 2.
4. Telefonos sin formato raro (solo dígitos, 10).
5. Guardá como `.xlsx` (no `.csv`).
6. Subilo al wizard.

Si ves warnings raros en el reporte del wizard, el formato no encajó.
Reformateá y volvé a subir.