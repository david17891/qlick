# Seed de datos demo

Script: `scripts/seed-demo.mjs`

Crea data sintética realista para que el panel admin se vea "vivo" sin esperar
tráfico real. Útil para demos a socios, capturas de pantalla, y validación
visual del flujo end-to-end.

## Lo que crea

| Entidad | Cantidad aprox | Detalle |
|---|---|---|
| **Eventos** | 3 | 2 pasados (abril, junio) + 1 próximo (julio) |
| **Confirmados** | ~28 | Repartidos entre los 3 eventos, distintos `source` |
| **Asistentes** | ~16 | Solo en eventos pasados. 75% matcheados + 25% walk-in |
| **Encuestas** | ~12 | Solo en eventos pasados. ~70% con consent |
| **Leads promovidos** | ~9 | Desde encuestas con consent |
| **Leads sueltos** | ~20 | Mezcla website / whatsapp / facebook_ads / organic / manual |
| **WhatsApp log** | ~20 | Cambios de status de `no_contactado → contactado / interested / lost` |
| **Audit log** | ~25 | Acciones admin recientes (event_*, lead_*, survey_*) |

Todos los datos llevan un **tag único** (`seed:demo` o `seed:demo:lead`) para
limpieza fácil sin tocar data real.

## Privacidad

**Cero PII real.** Todo es sintético:

- Emails: `@example.com` o `@seed-demo.test`
- Phones: `+52 686/664/667 XXX XXXX` (formato Mexicali/Tijuana/Culiacán)
- Nombres: nombres comunes ficticios en español

**Nunca** usar este seed en producción.

## Cómo usarlo

```bash
# Crear (idempotente — agrega a lo existente, no duplica)
npm run seed:demo

# Limpiar todo lo del seed + crear de nuevo
npm run seed:demo:reset

# Solo limpiar (sin crear)
npm run seed:demo:cleanup

# O directo con node:
node scripts/seed-demo.mjs           # crea
node scripts/seed-demo.mjs --reset   # limpia + crea
node scripts/seed-demo.mjs --cleanup # solo limpia
node scripts/seed-demo.mjs --dry-run # muestra plan sin escribir
```

## Después de correr

Hard refresh en:

- `/admin/eventos` → 3 cards con métricas
- `/admin/eventos/[id]` → cada evento con confirmados/asistentes/encuestas/leads
- `/admin/system/audit-log` → log con ~25 entries
- `/admin?tab=crm` → leads promovidos (los demás tabs siguen en modo mock)

## Cómo funciona la idempotencia

El script usa `upsert` con `onConflict` apropiado para cada tabla:

- **events**: por `slug`
- **event_confirmations**: por `(event_id, email)`
- **event_attendees**: por `(event_id, email)`
- **event_surveys**: por `(event_id, respondent_email)`
- **leads**: por `email` (los del seed usan dominio `@seed-demo.test`)

Si corrés `seed:demo` dos veces sin `--reset`, no duplica. Si querés reset
completo (recomendado cuando cambiás la estructura del seed), usá `--reset`.

## Estructura interna

El script está dividido en:

1. **Env loader** — parsea `.env.local` (mismo patrón que `_seed-event-demo.mjs`)
2. **Cleanup** — borra data marcada con seed tag (con `--reset` o `--cleanup`)
3. **Fixtures** — 3 eventos hardcoded + datos derivados determinísticamente
4. **Seed** — inserta en orden: events → confirmations → attendees → surveys
   → leads promovidos → leads sueltos → WhatsApp log → audit log

## Troubleshooting

### "Faltan SUPABASE_URL / SUPABASE_SECRET_KEY en .env.local"

Asegurate de tener `.env.local` con:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxx
```

### "permission denied" al insertar

El script usa `SUPABASE_SECRET_KEY` (service role, bypass RLS). Si te da
error de permisos, verificá que la key sea la **secret** (no la publishable /
anon key).

### Los emails no aparecen en el admin

Las policies RLS para `event_confirmations` y `event_attendees` son
default-deny — el admin las lee vía server libs que usan service role. Si no
ves nada, hard refresh (Ctrl+Shift+R) o abrí en pestaña nueva.

## Cuándo NO usar este seed

- En producción (jamás)
- En staging con datos reales de clientes
- Cuando estés validando flujos de privacidad/consent (los datos sintéticos
  son todos `consent_to_contact=true` salvo los que explícitamente son `false`)

## Próximos pasos

Cuando se integre el **agente IA** (Fase 7+) que clasifica leads automáticamente,
podemos agregar:

- Leads con clasificaciones del agente (campo `ai_classification`)
- Interacciones generadas por el agente (campo `interaction_source = "ai_agent"`)
- Estados más diversos en el pipeline (qualified, nurture, etc.)

## Migraciones pendientes (opcionales)

El script detecta el schema y se adapta. Si aplicás estas migrations, el seed
se enriquece automáticamente:

| Migration | Qué agrega | Impacto en el seed |
|---|---|---|
| `20260627010000_funnel_hardening.sql` | UNIQUE indexes en `leads.email` y `leads.phone_normalized` | Upserts más rápidos (no hay verificación manual) |
| `20260628000000_whatsapp_followup.sql` | `leads.whatsapp_status`, `leads.last_contacted_at`, tabla `lead_whatsapp_log` | Seed puebla status de WhatsApp y crea entries del log |
| `20260629000000_admin_audit_log_diff.sql` | `admin_audit_log.before` y `.after` (jsonb) | Diff snapshots nativos en lugar de guardarlos en metadata |

Para aplicarlas: desde Supabase Dashboard > SQL Editor, copiar el contenido
del archivo y ejecutar. No rompen nada (todas son `add column if not exists`
o `create unique index if not exists`).