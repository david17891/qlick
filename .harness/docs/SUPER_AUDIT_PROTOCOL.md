# SUPER_AUDIT_PROTOCOL.md — Protocolo de Súper-Auditoría Integral 360° (Minimax Engine)

> **Audience:** Mavis / Minimax AI Multi-Agent Team (`.harness/`).
> **Goal:** Ejecutar una revisión profunda, exhaustiva y de larga duración sobre la totalidad del repositorio Qlick Marketing LMS, identificando deudas técnicas, vulnerabilidades, cuellos de botella de rendimiento, condiciones de carrera y problemas de UI/UX sin restricciones artificiales de tokens o tiempo, y produciendo un reporte estructurado para revisión y certificación de Antigravity.

---

## 🚀 Instrucción de Lanzamiento (Para Mavis / Minimax)

Cuando se invoque este protocolo (vía `/goal` o comando de delegación), Minimax debe trabajar de manera ininterrumpida y metódica a través de los **6 Pilares Críticos del Sistema**, inspeccionando el código fuente, verificando invariantes y corriendo herramientas de verificación en una rama dedicada `chore/super-audit-2026`.

Al contar con una ventana de contexto masiva, Minimax **puede y debe** profundizar en los archivos clave, comparar implementaciones entre el frontend y el backend, y rastrear flujos completos de datos desde la interfaz de usuario hasta las tablas en Supabase.

---

## 🏛️ Los 6 Pilares de la Súper-Auditoría 360°

### 1. Pilar de Salud del Sistema y Tipado (`Build & Strict Type Health`)
- **Objetivo:** Garantizar 0 errores de compilación, 0 advertencias de linting y tipado estricto impecable.
- **Acciones y Verificaciones:**
  - Ejecutar `npm run type-check`. Escanear todo el directorio `src/` en busca de `as unknown as`, `as any`, o `@ts-ignore` y documentar exactamente qué interfaces o types faltan para eliminarlos.
  - Ejecutar `npm run lint`. Auditar `useEffect` y custom hooks para comprobar dependencias incompletas o variables huérfanas.
  - Ejecutar `npm test`. Confirmar que los **1,262+ tests** pasen al 100% y verificar si existen archivos de test desactualizados o aserciones triviales.
  - Ejecutar `npm run build`. Auditar el bundle de las ~145 rutas de Next.js App Router para detectar páginas que se estén renderizando dinámicamente de forma innecesaria en lugar de usar SSG o ISR con `revalidate`.

### 2. Pilar de Seguridad, Migraciones y RLS (`Supabase & Data Security`)
- **Objetivo:** Blindar la base de datos contra accesos no autorizados y fugas de PII.
- **Acciones y Verificaciones:**
  - Inspeccionar el directorio `supabase/migrations/`. Verificar la secuencia cronológica exacta y confirmar que `20260712044100_event_attendees_guests.sql` (o la migración de `guests JSONB`) esté correctamente alineada con `src/types/supabase.ts`.
  - Auditar exhaustivamente que **todas las tablas públicas que almacenan PII o datos de negocio** (`leads`, `event_attendees`, `crm_interactions`, `user_lesson_progress`, `courses`, `lessons`) tengan `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;` activado.
  - Auditar las políticas RLS (`CREATE POLICY`). Asegurar que los roles `anon` y `authenticated` no tengan permisos de lectura o escritura global donde solo `admin` o el dueño del registro deberían tener acceso.
  - Escanear todo el código bajo `src/app/` y `src/components/` buscando importaciones indebidas del cliente administrativo (`createSupabaseAdminClient` o `src/lib/supabase/admin.ts`). Verificar que las claves secretas (`DEV_ADMIN_SECRET`, tokens de Meta/DeepSeek) jamás lleguen a variables `NEXT_PUBLIC_*`.

### 3. Pilar del Motor de IA, Prompts y Guardrails (`AI Engine & Conversational Flows`)
- **Objetivo:** Maximizar velocidad (`Flash`), evitar alucinaciones, prevenir loops de reintentos y garantizar estabilidad conversacional.
- **Acciones y Verificaciones:**
  - Auditar `src/lib/ai/deepseek-provider.ts` y `simulator.ts`. Verificar que los fallbacks entre motores (`tier: flash` vs `tier: pro`) manejen correctamente timeouts de red y errores 429/500 sin tirar el hilo principal o colgar la solicitud del webhook.
  - Inspeccionar `buildSuperExecutivePrompt` y `buildSystemPrompt` en `agent-prompts.ts`. Auditar la claridad de las instrucciones de brevedad, anti-alucinación, manejo de acompañantes (`add_event_guest`) y cadencia suave. Verificar si hay instrucciones redundantes o contradictorias que puedan confundir al LLM.
  - Auditar `src/lib/ai/tool-executors/`. Confirmar que todos los ejecutores (`extract-contact.ts`, `add-guest.ts`) devuelvan estructuras puramente serializables en JSON y capturen cualquier error SQL (`onConflict`, `check violation`) transformándolo en un mensaje cortés para la IA.

### 4. Pilar del Embudo CRM, Leads y Masterclasses (`CRM, Leads & Event Funnels`)
- **Objetivo:** Asegurar transaccionalidad total, consistencia de datos en caliente y rendimiento óptimo en el panel de administración.
- **Acciones y Verificaciones:**
  - Auditar `src/lib/leads/` y `src/lib/events/attendees-server.ts`. Investigar posibles condiciones de carrera (`race conditions`) cuando un lead envía múltiples mensajes rápidos por WhatsApp al mismo tiempo que el webhook intenta hacer un `findOrCreateLead` o un upsert.
  - Auditar el rendimiento de las consultas en los endpoints administrativos (`/api/admin/leads`, `/api/admin/events`). Comprobar si las consultas utilizan `select('*')` sin paginación o si faltan índices de base de datos en columnas clave (`status`, `created_at`, `phone`).
  - Confirmar que cualquier exportación/importación de Excel (`asistencia_*.xlsx`, `leads_*.xlsx`) o manejo de encuestas guarde sus archivos estrictamente dentro de `private-data/` o fuera de la carpeta `public/`.

### 5. Pilar del LMS, Cursos, Módulos y Pagos (`LMS Platform & Monetization`)
- **Objetivo:** Proteger el contenido premium, auditar el progreso del usuario y asegurar los webhooks financieros.
- **Acciones y Verificaciones:**
  - Auditar la integridad de las relaciones en la capa LMS (`src/lib/lms/`, `scripts/seed-courses.mjs`). Confirmar que los 4 cursos, 12 módulos y 36 lecciones mantengan referencias intactas (`ON DELETE CASCADE` o `RESTRICT` según corresponda).
  - Verificaciones de Seguridad de Cursos (`Guards`): Auditar los endpoints de API y Server Actions que entregan video o contenido de lecciones. Asegurar que un usuario sin compra activa de un curso de pago no pueda acceder directamente a la URL de la lección o alterar su `user_lesson_progress` mediante peticiones falsificadas.
  - Auditar los conectores de pago/checkout en `src/lib/payments/`. Confirmar la validación criptográfica estricta de firmas en los webhooks entrantes para evitar inyecciones de pagos falsos.

### 6. Pilar de UI/UX, Accesibilidad, Voseo y Enlaces (`Frontend & Brand Experience`)
- **Objetivo:** Mantener una estética premium digna de Qlick, español neutro perfecto y 0 enlaces rotos.
- **Acciones y Verificaciones:**
  - Ejecutar `npm run audit:voseo`. Confirmar 0 ocurrencias de conjugaciones rioplatenses (`podés`, `tenés`, `querés`, `ingresá`) en las ~145 páginas de la plataforma.
  - Ejecutar `npm run audit:links`. Confirmar 0 enlaces rotos, anclas vacías inapropiadas o redirecciones infinitas.
  - Inspeccionar los componentes de resiliencia (`loading.tsx`, `error.tsx`, `not-found.tsx`) en las rutas principales (`/admin/dashboard`, `/lms`, `/crm`, `/eventos`, `/admin/bot`). Verificar que los modales y tablas complejas del CRM y LMS sean 100% responsivos en dispositivos móviles (cero desbordamientos horizontales por anchos fijos de Tailwind).

---

## 📄 Contrato del Reporte Estructurado para Revisión de Antigravity

Al concluir la revisión integral de los 6 pilares, Minimax **debe generar obligatoriamente dos entregables en el repositorio**:

1. **Reporte Markdown Canónico (`docs/SUPER_AUDIT_REPORT_2026.md`)**:
   - Resumen ejecutivo con tabla de puntuación/semáforo por cada uno de los 6 Pilares (`🟢 Óptimo`, `🟡 Requiere Atención`, `🔴 Crítico`).
   - Lista detallada de hallazgos ordenados por severidad (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
   - Para cada hallazgo: Archivo, línea exacta, descripción técnica del problema y bloque de código con el diff sugerido para solucionarlo.

2. **Espejo JSON Estructurado (`private-data/reports/super_audit_master.json`)**:
   - Este archivo será consumido e inspeccionado algorítmicamente por **Antigravity** para auditar y certificar la calidad del diagnóstico de Minimax.
   - Debe cumplir exactamente este esquema:
```json
{
  "generated_at": "2026-07-13T00:00:00.000Z",
  "branch": "chore/super-audit-2026",
  "engine": "Minimax-Mavis-LongRunning",
  "build_health": {
    "type_check_errors": 0,
    "lint_errors": 0,
    "total_tests": 1262,
    "passing_tests": 1262,
    "build_status": "SUCCESS | FAILED"
  },
  "pillars_summary": {
    "pillar_1_build_types": { "status": "GREEN | YELLOW | RED", "findings_count": 0 },
    "pillar_2_security_rls": { "status": "GREEN | YELLOW | RED", "findings_count": 0 },
    "pillar_3_ai_guardrails": { "status": "GREEN | YELLOW | RED", "findings_count": 0 },
    "pillar_4_crm_funnel": { "status": "GREEN | YELLOW | RED", "findings_count": 0 },
    "pillar_5_lms_payments": { "status": "GREEN | YELLOW | RED", "findings_count": 0 },
    "pillar_6_ui_ux_voseo": { "status": "GREEN | YELLOW | RED", "findings_count": 0 }
  },
  "findings": [
    {
      "id": "AUDIT-001",
      "pillar": 2,
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "category": "RLS_MISSING | CODE_SMELL | PERF_SLOW_QUERY | RACE_CONDITION | TYPE_SAFETY | SECURITY_EXPOSED | UI_BUG",
      "file_path": "src/lib/leads/example.ts",
      "line_number": 42,
      "description": "Descripción precisa del hallazgo técnico.",
      "recommended_fix": "Explicación exacta y código de cómo refactorizarlo."
    }
  ]
}
```

---

## 🛑 Criterios de Aceptación del Protocolo (`DO NOT STOP UNTIL ALL ARE TRUE`)

1. **Revisión 360° Completa:** Minimax ha inspeccionado a fondo los 6 pilares de manera ininterrumpida, documentando hallazgos reales (sin inventar falsos positivos).
2. **Suite de Pruebas 100% Verde:** Correr `npm test` al concluir la auditoría confirmando que todos los 1,262+ tests pasen en verde en la rama `chore/super-audit-2026`.
3. **Reporte Dual Entregado:** Ambos archivos (`docs/SUPER_AUDIT_REPORT_2026.md` y `private-data/reports/super_audit_master.json`) están creados, formateados y validados.
4. **Commit + PR Abierto:** Se realiza el commit con el mensaje `chore(audit): súper-auditoría integral 360 de 6 pilares por Minimax` y se abre el PR hacia `main`.
5. **Listo para Handoff a Antigravity:** En la descripción del PR o al finalizar, Minimax indica que el archivo `super_audit_master.json` está listo para que Antigravity realice la verificación y certificación final.
