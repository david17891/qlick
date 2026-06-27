# Formato esperado de Excel para el Import Wizard

> **TL;DR:** El wizard NO usa AI para transformar datos (constraint legal
> GDPR/LFPDPPP — no inventamos PII). Cada tipo de import tiene su **prompt
> específico copy-paste ready** dentro del wizard (`/admin/eventos/[id]/import`),
> abajo de cada card de tipo. Pegalo en ChatGPT/Gemini, dejá que la AI limpie
> el Excel, descargalo limpio y subilo.

Este doc es **referencia conceptual**. Para los prompts operativos, mirá
el wizard.

---

## Por qué NO AI integrada en el wizard

Tres razones duras (en orden de severidad):

1. **Legal** — GDPR (UE) y LFPDPPP (México) prohíben inventar o inferir PII
   sin base explícita. La AI "arreglando" consent de `"sí plis"` a `Sí` sería
   **fabricar consentimiento**. Inventar un dígito faltante de phone es
   **crear PII falsa** (multas GDPR hasta 4% revenue global).
2. **Calidad** — Inventar un phone → mensaje a número quemado → Meta banea
   la cuenta. Inventar email → bounce → dominio quemado en Mailgun/Resend.
   Una fila inventada daña infra seria.
3. **Audit** — Con reglas deterministas sabemos exactamente qué transformación
   aplicó cada fila. Con AI el cambio es opaco ("AI dijo que probablemente
   es X"). Imposible defender ante auditoría.

**Lo que la AI SÍ puede hacer** (y la hacemos afuera del wizard, en el
chat del admin): limpiar Excels sucios siguiendo el prompt específico del
tipo. El admin revisa cada cambio antes de impactar producción.

---

## Spec por tipo (resumen)

Para la spec detallada, mirá el wizard. Pero el resumen:

### `confirmation`
- **Nombre** (requerido), Email o Teléfono (al menos uno), Fuente (opcional)
- Teléfono: 10 dígitos MX → se prefija `+52` automáticamente

### `attendee`
- Al menos uno de (Nombre, Email, Phone). Walk-ins válidos sin nombre.
- Asistió: Sí/No/✓/✗

### `survey`
- Email o Teléfono (al menos uno)
- **Consent** (Sí/No) — el más delicado, determina promoción a lead
- Interés: texto libre

---

## Headers reconocidos (sinónimos + fuzzy match)

El importer auto-detecta headers. Fuzzy match (Levenshtein ≤ 2) para tolerar
typos menores.

| Canónico | Variantes |
|---|---|
| `name` | nombre, nombres, name, full name, fullname, nombre completo |
| `email` | correo, email, e-mail, mail, correo electronico, email address |
| `phone` | teléfono, telefono, phone, celular, tel, whatsapp, numero |
| `consent` | consent, consentimiento, acepta, contact permission, ok contactar |
| `interest` | interés, interes, interest, comentarios, tema |
| `source` | fuente, source, origen, canal, channel |
| `attended` | asistió, asistio, attended, presente, attendance |

Headers no reconocidos (ej: "Observaciones", "Fecha", "#") se descartan.

---

## Transformaciones automáticas (deterministas, seguras)

- **Phone**: strip no-dígitos → 10 dígitos se prefijan `+52`; 12 dígitos
  empezando con `52` se mantienen.
- **Nombre**: trim + capitalize cada palabra (`"ana PÉREZ"` → `"Ana Pérez"`).
- **Email**: trim + lowercase.
- **Source**: lowercase + match con sinonimos (`"Messenger"` →
  `"imported_excel"`).

**No se hace (constraint legal):**
- ❌ Inventar dígitos faltantes de phone
- ❌ Inferir email faltante
- ❌ Convertir consent ambiguo (`"sí plis"`, `"ok"`) a Sí — agregalo al
  sinonimos manualmente si querés que pase, no por inferencia
- ❌ Corregir typos en nombres

---

## ¿Cómo usar el wizard?

1. Andá a `/admin/eventos/[id]/import`
2. Mirá el panel "Formato esperado" arriba — resaltá la card del tipo
   que vas a usar
3. Click en **"📋 Prompt para ChatGPT/Gemini"** dentro de la card →
   click **"Copiar"** → pegalo en tu chat de IA favorita
4. La IA te devuelve un Excel limpio. Descargalo.
5. En el wizard: elegí el archivo + tipo + (opcional) marcá Dry-run
6. Click "Parsear (dry-run)" → revisá el reporte
7. Si OK, desmarcá Dry-run → click "Importar de verdad"

Si ves warnings raros en el reporte, el Excel no encajó al formato.
Reformateá y volvé a subir.