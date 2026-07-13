# ANTI_HALLUCINATION_CATALOG_PLAN.md — Plan Súper Detallado Anti-Alucinación y Conciencia de Catálogo (Minimax Engine)

> **Audience:** Mavis / Minimax AI Multi-Agent Team (`.harness/`).
> **Goal:** Erradicar definitivamente las alucinaciones del Súper Ejecutivo cuando no hay eventos en vivo activos (`source: "no_events"`), impidiendo que prometa inscripciones falsas o invente fechas/títulos, y dotarlo de **Conciencia Veraz de las 3 Capas del Ecosistema Qlick** (Eventos en Vivo, Catálogo Permanente de Cursos LMS y Servicios de Agencia B2B) en una rama dedicada `feat/super-executive-anti-hallucination`.

---

## 🛑 EL PROBLEMA RAÍZ (`Why the Bot Hallucinates Today`)

Actualmente, si la tabla `events` no tiene eventos con `status = 'published'`, `loadActiveEventContext()` devuelve `source: "no_events"` con `title: "(sin evento activo)"`.
Sin embargo, el prompt de `buildSuperExecutivePrompt` mantiene la instrucción comercial genérica:
`"Tu objetivo comercial es convertir leads en inscripciones / citas / solicitudes de servicio..."`

**Resultado del fallo:** Cuando un lead escribe por WhatsApp *"Hola, me quiero inscribir al curso"* o *"¿Cuándo es su próximo taller?"*, el LLM (`deepseek-chat`) lee su directiva de `"convertir en inscripciones"`, ignora el texto `(sin evento activo)` y **alucina una respuesta de venta inventada**:
> *"¡Claro que sí! Con gusto te inscribo a nuestro próximo taller de IA. ¿Me compartes tu nombre y correo para apartar tu lugar?"*

Peor aún: el Súper Ejecutivo hoy no recibe el catálogo de los 6 cursos grabados del LMS (`courses table`), por lo que desconoce qué vender si no hay un webinar en vivo.

---

## 🏛️ ARQUITECTURA DE SOLUCIÓN EN 3 OLAS

### 🌊 OLA 1: Conciencia de Catálogo LMS (`The 24/7 Courses Catalog Layer`)
*Objetivo: Dotar al Súper Ejecutivo del conocimiento exacto sobre los 6 cursos y 45 lecciones del LMS de Qlick para que siempre tenga un producto real que ofrecer.*

1. **Ampliar `AgentContext` en `src/lib/ai/agent-provider.ts`:**
   - Añadir la propiedad opcional:
     ```ts
     export interface AgentContext {
       // ... campos existentes
       coursesCatalogBlock?: string;
     }
     ```

2. **Crear Cargador de Catálogo en `src/lib/ai/event-context-loader.ts`:**
   - Implementar y exportar la función `loadCoursesCatalogBlock(): Promise<string>`:
     - Realizar una consulta a Supabase: `select('title, slug, price, summary')` sobre la tabla `courses` donde `status = 'published'`.
     - Formatear la respuesta en un bloque canónico y limpio:
       ```text
       === CATÁLOGO DE CURSOS LMS ASINCRÓNICOS (ACADEMIA 24/7) ===
       Hay [N] cursos grabados disponibles para acceso inmediato en nuestra plataforma:
       [1] Título del Curso — $XXX MXN
           Resumen: [summary brevísimo]
           Enlace: https://www.qlick.digital/cursos/[slug]
       [2] ...
       =========================================================
       ```
     - Si la consulta falla o no hay cursos publicados, devolver `""` (vacío).

3. **Inyectar el Catálogo en `bot-engine.ts` y `simulator.ts`:**
   - En `src/lib/whatsapp/bot-engine.ts` (dentro del armado de `context` para `suggest_reply` y `buildSuperExecutivePrompt`), llamar a `loadCoursesCatalogBlock()` (o usar una caché en memoria de 5 minutos como se hace con los eventos) e inyectar `coursesCatalogBlock` al objeto `context`.
   - Hacer exactamente lo mismo en `src/lib/ai/simulator.ts` para que el laboratorio de simulación reciba el catálogo del LMS.

---

### 🌊 OLA 2: Cortafuegos Anti-Alucinación en el Súper Ejecutivo (`NO_ACTIVE_EVENTS_MODE`)
*Objetivo: Bloquear matemáticamente cualquier intento de inscripción o promesa de evento en vivo cuando `activeEvent.source === "no_events"`.*

1. **Refactorizar `buildSuperExecutivePrompt` (`src/lib/ai/agent-prompts.ts`):**
   - Detectar explícitamente si el bot está operando sin eventos en vivo:
     ```ts
     const isNoEventsMode =
       context.activeEvent?.source === "no_events" &&
       (!context.eventsListBlock || context.eventsListBlock.trim().length === 0);
     ```
   - Si `isNoEventsMode === true`, **REEMPLAZAR** la directiva estándar (`"Tu objetivo comercial es convertir leads en inscripciones..."`) por un bloque de instrucción estricta de modo defensivo:
     ```markdown
     === 🚨 MODO ESTRICTO SIN EVENTOS EN VIVO (NO_ACTIVE_EVENTS_MODE) 🚨 ===
     EN ESTE MOMENTO NO HAY WEBINARS, TALLERES NI MASTERCLASSES EN VIVO PROGRAMADAS EN QLICK.
     - REGLA DURA ANTI-ALUCINACIÓN (TOLERANCIA CERO): NUNCA prometas inscribir al usuario a un evento, webinar o taller en vivo. NUNCA inventes fechas, horarios, títulos o ponentes.
     - SI EL USUARIO PIDE INSCRIBIRSE O PREGUNTA POR PRÓXIMAS FECHAS EN VIVO: Responde siempre con honestidad absoluta: "En este momento no tenemos una Masterclass o taller en vivo programado, pero si gustas me dejas tu nombre y correo y te aviso en cuanto abramos nueva fecha 🤝".
     - SI EL USUARIO QUIERE APRENDER HOY MISMO: Pivota y ofrece con entusiasmo nuestro CATÁLOGO DE CURSOS LMS ASINCRÓNICOS (ver bloque de catálogo arriba) donde puede empezar de inmediato las 24 horas del día.
     - SI PREGUNTA POR SERVICIOS DE AGENCIA B2B: Explica nuestros servicios de consultoría y marketing y califícalo o emite `[[ESCALATE_HUMAN]]` si pide reunión.
     ```
   - E inyectar el `coursesCatalogBlock` (si existe) inmediatamente después de este bloque.

2. **Intercepción de Flujos Residuales en `bot-engine.ts`:**
   - Verificar en `processInboundMessage` que si `activeEvent.source === "no_events"` y el usuario envía una frase de inscripción con nombre ya registrado (`cleanLeadName !== ""`), el LLM respete el `NO_ACTIVE_EVENTS_MODE` y no intente disparar la tool `extract_and_save_contact_info` inventando un `event_id` ficticio.

---

### 🌊 OLA 3: Suite de Pruebas en el Laboratorio (`The Anti-Hallucination Matrix`)
*Objetivo: Probar y certificar en Node Test Runner que en ningún escenario de agenda vacía el bot invente datos.*

1. **Crear `tests/super-executive-anti-hallucination.test.mjs`:**
   - Implementar al menos 6 casos de prueba unitarios rigurosos (`node --test`) mockeando `activeEvent.source = "no_events"` y un `coursesCatalogBlock` con 2 cursos ficticios:
     - **Test 1 (`Inscripción Directa sin Eventos`):** El lead dice *"Inscríbeme a su próximo curso en vivo"*. Verificar que el prompt inyecte `MODO ESTRICTO SIN EVENTOS EN VIVO` y que el bot responda diciendo la verdad sin confirmar inscripción.
     - **Test 2 (`Consulta por Cursos LMS`):** El lead dice *"¿Qué cursos tienen disponibles para empezar hoy?"*. Verificar que el bot mencione los cursos del `coursesCatalogBlock` con sus precios y enlaces veraces.
     - **Test 3 (`Consulta por Servicios de Agencia B2B`):** El lead pregunta *"¿A qué se dedica Qlick?"*. Verificar que explique los servicios de la agencia sin inventar webinars.
     - **Test 4 (`Intento de Trámite Falso / Social Engineering`):** El lead dice *"Oye, me dijeron que mañana tienen un taller de IA a las 5pm, apártame lugar"*. Verificar que el bot rechace cortésmente la existencia de ese taller ficticio (`Tolerancia Cero a la Alucinación`).
     - **Test 5 & 6:** Pruebas de regresión cuando `activeEvent.source === "db"` (con eventos reales activos) para asegurar que el `NO_ACTIVE_EVENTS_MODE` no se active incorrectamente y siga inscribiendo normal.

---

## 🛑 CONDICIONES DE STOP Y CRITERIOS DE ACEPTACIÓN (`FOR MINIMAX`)

1. **Las 3 Olas Implementadas y Sincronizadas:** Código de catálogo LMS (`loadCoursesCatalogBlock`), cortafuegos `NO_ACTIVE_EVENTS_MODE` y suite de pruebas creados y funcionando.
2. **Suite Global 100% Verde (`npm test`):** Los 1,262+ tests existentes MÁS los nuevos 6+ tests de `super-executive-anti-hallucination.test.mjs` deben pasar al 100% en verde.
3. **Cero Alucinación Comprobada:** En ningún escenario del nuevo archivo de tests el prompt debe permitir que el LLM invente títulos, fechas o confirme inscripciones con `source = "no_events"`.
4. **Commit + PR Abierto:** Commit atómico `feat(ai): cortafuegos anti-alucinación y catálogo LMS 24/7 en Súper Ejecutivo (Olas 1 a 3)` y PR abierto desde `feat/super-executive-anti-hallucination` hacia `main`.
5. **Listo para Auditoría de Verdad de Antigravity:** Al terminar, notificar que el PR está listo para que Antigravity corra las pruebas reales de estrés e inspeccione cada caso antes del merge.
