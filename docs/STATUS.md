# Project Status — Snapshot vivo

> **Addendum 2026-08-14 — auditoría funcional de promoción:** se verificaron
> producción, Supabase, RLS, migraciones, `/promo`, checkout normal, webhooks,
> QR, correo y continuidad de pendientes. La landing y `/promo` responden 200;
> cron sin secreto responde 401; webhook sin firma responde 400; QR inexistente
> responde 404. Producción tiene 19 confirmaciones (1 pagada y 18 pendientes),
> 0 órdenes promocionales y 7 intentos en el ledger (1 aprobado, 1 pendiente,
> 4 cancelados y 1 fallido). Las pruebas promocionales pasan 32/32, `test:ci`
> pasa 1,708/1,708 y la simulación de tres escenarios pasa 34/34. La E2E
> histórica que exige cero QR antes del pago falla porque el despliegue vigente
> es híbrido: puede enviar QR provisional, pero el check-in sigue bloqueado hasta
> pago/apartado verificado. Hallazgos y puertas de salida quedan en
> `docs/AUDIT_PROMO_CANACO_2026-08-14.md`; no se hicieron cargos, envíos ni
> cambios destructivos.

> **Addendum 2026-08-14 — política confirmada para la promoción:** para la
> promoción de dos plazas, el QR y la confirmación se envían únicamente después
> de que Stripe verifique el apartado de $200 MXN o el pago completo. El correo
> y el WhatsApp de captura solo entregan el enlace de pago; no habilitan acceso.
> La atribución del cobro usa `promo_order_id` y `confirmation_id` firmados en la
> metadata de Checkout, no una búsqueda por correo. Antes de lanzar la campaña
> faltan restringir el slug promocional, entregar el pase a la segunda persona
> cuando haya correo, definir el comprobante y completar una E2E Stripe test.

> **Addendum 2026-08-14 — landing CANACO optimizada:** la página del evento
> ahora presenta el temario en cuatro bloques, la promoción de cierre de dos
> personas ($1,500 MXN, apartado $200), la opción individual de $1,000, los
> beneficios y la logística sin párrafo amontonado. El botón de eventos de
> pago dice “Apartar mi lugar” y ya no afirma que el registro es gratis.
> La descripción fuente se compactó mediante la migración aditiva
> `20260813235000_optimize_canaco_event_description.sql`; se conservaron
> `price_mxn=1000`, apartado normal de $500, reglas, pagos, registros y QR.
> Deploy productivo `dpl_C1sStDbz3R8uQPyPnDNFfQQirxin`, estado `READY`, con
> `https://qlick.digital` y `https://www.qlick.digital` respondiendo HTTP 200.
> Se verificaron `/eventos/desarrollo-estructura-curso-canaco` y `/promo`:
> aparecen los bloques nuevos, no aparece el Markdown antiguo y el checkout
> promocional sigue separado del flujo normal.
> La vista responsive móvil compacta quedó activa en el despliegue posterior
> `dpl_AexbX2pYJc3HnNAnqNR9DpnBKTj7`: muestra la oferta y el CTA en la primera
> pantalla, mientras el detalle ampliado se conserva para escritorio.

> **Addendum 2026-08-14 — promoción para pendientes:** se cerró el hueco de
> reactivación de los inscritos con `payment_pending`. En el tab **Pagos** del
> evento, el admin puede preparar enlaces individuales de WhatsApp con la
> promoción de 2 personas ($1,500, apartado $200) y la opción normal de $1,000.
> Solo se incluyen pendientes con teléfono; no se envía nada automáticamente,
> no se cambia su estado y el video se adjunta manualmente si corresponde.

> **Addendum 2026-08-13 — promoción de cierre `/promo`:** se añadió de
> forma aditiva la inscripción de 2 personas por $1,500 MXN, con apartado de
> $200 MXN o pago completo, sin alterar el checkout normal de $1,000 MXN ni
> el pago existente. La orden promocional usa un solo ledger, conserva la
> segunda plaza como `identity_pending` cuando queda en blanco y genera un QR
> compartido con máximo dos check-ins únicamente después de pago/apartado
> verificado. La migración `20260813170000_event_promo_pair_orders.sql` fue
> aplicada y verificada en Supabase `ugpejblymtbwtsoiykyj`; la página `/promo`,
> el correo de pago y la vista administrativa de órdenes quedaron incluidos.
> Validación local: 1,706/1,706 pruebas, type-check, lint y build correctos.
> La campaña con video no se envía automáticamente: requiere lanzamiento
> explícito.

> **Addendum 2026-08-13 — auditoría segura de integración:** se reprodujo y
> corrigió el único fallo del gate estático del PR #76: el fixture de Supabase
> no modelaba `.select().maybeSingle()` y activaba correctamente el fallback
> que evita afirmar un guardado no verificado. `test:ci` local quedó en
> 1,701/1,701, type-check y lint correctos; GitHub está reejecutando el CI.
> La migración aditiva `20260813140000_harden_security_definer_grants.sql`
> se aplicó en producción y dejó `get_user_id_by_email`,
> `issue_event_certificate` y `soft_delete_conversation_tx` ejecutables solo
> por `service_role`; la verificación posterior confirmó esos grants y
> eliminó las tres advertencias correspondientes del advisor. No se tocaron
> datos ni lógica de negocio.

> **Addendum 2026-08-13 — flujo híbrido QR + pago:** se promovió el flujo
> provisional en `dpl_HrgxbViyXEG7ryML3K8CNYseutFR` al proyecto Vercel `qlick`.
> En eventos pagados, el correo de captura incluye el QR provisional y el
> enlace de pago; el QR se conserva estable, pero `/api/check-in` y el gate
> siguen bloqueando el acceso hasta un pago/apartado verificado. La migración
> aditiva `20260813120000_restore_provisional_qr_for_pending_payments.sql`
> reactivó únicamente tokens revocados por `payment_pending_registration`:
> 14 pendientes activos, 1 pagado activo y ninguna revocación ajena alterada.
> Smoke: `www.qlick.digital` 200, QR provisional 200 `image/png`, cron POST sin
> credencial 401. El panel ahora muestra en “Pagos confirmados” solo ledger
> `approved`/`paid_manual`; intentos fallidos o cancelados no se presentan como
> cobros. No se enviaron correos masivos históricos automáticamente.

> **Addendum 2026-08-11 — reparación de sede CANACO:** se corrigieron en
> producción las reglas históricas que decían “dirección por confirmar” y se
> normalizó `events.location` a `CANACO, Av. Álvaro Obregón 14-15, San Luis
> Río Colorado, Sonora`. La resolución de sede desde la descripción quedó
> desplegada selectivamente en Vercel `dpl_HUPgEJ3rwjp6JTSibGUncHfRMr82`,
> estado `READY`, con `https://qlick.digital` y
> `https://www.qlick.digital` respondiendo HTTP 200.

> **Addendum 2026-08-11 — blindaje selectivo del bot:** se promovieron
> `bot-engine`, prompts, provider y executors de persistencia en
> `dpl_BSYX97H3pjhBCq2JeUv1s73fPvZP`, estado `READY`. Ambos dominios y la
> página del evento responden HTTP 200 y contienen CANACO, San Luis Río
> Colorado y Av. Álvaro Obregón.

> **Addendum 2026-08-11 — verificación completa del funnel:** el E2E
> sintético pasó human_first → `payment_pending` sin QR → webhook Stripe
> firmado → pago `approved` → acceso `active` → email/QR activo y WhatsApp
> post-pago. Se corrigió la referencia de jornada para usar el UUID interno
> de conversación y el QR ahora guarda `confirmation_id`. Deploy final:
> `dpl_9MN2dG3RnCvMSBYbL2QhjFMp3tG6`, estado `READY`.

> **Addendum 2026-08-11 — activación human_first:** auditoría final aprobada
> con 117/117 pruebas focalizadas, funnel Stripe/QR 1/1, auditoría voseo,
> type-check y lint correctos. `system_settings.bot_global_mode` quedó en
> `human_first` a las 19:01 UTC. Sin datos sintéticos residuales: leads 0,
> eventos 0 y QR huérfanos 0. Monitoreo inicial: 3 jobs inbound completados,
> sin errores de validación registrados aún.

> **Addendum 2026-08-11 — renombre del evento CANACO:** el evento publicado
> conserva su ID y slug, pero ahora se muestra como `Los 4 Pilares de un
> Negocio que Vende`. También se actualizaron descripción, HTML y PDF públicos.
> Deploy productivo Vercel `dpl_E6EttV4wYwgn6gp2irc3LaC85amE`, estado `READY`,
> aliases `https://qlick.digital` y `https://www.qlick.digital`. La página del
> evento y los 7 HTML públicos responden `200`, muestran el nombre nuevo y no
> contienen `Las 4 Patas`; los 3 PDF publicados fueron verificados igual.

> **Addendum 2026-08-11 — hardening operativo en producción:** se aplicó la
> migración aditiva `20260811120000_bot_operational_safety.sql` en Supabase
> `ugpejblymtbwtsoiykyj` y se habilitó `pg_cron`/`pg_net` con un job cada 15
> minutos. Los nuevos jobs/telemetría tienen RLS y acceso exclusivo de
> `service_role`; no contienen cuerpos ni PII. Los handoffs pendientes dejaron
> el bot pausado de forma reversible. El flujo de QR ahora falla cerrado para
> eventos pagados sin confirmación y no genera pase utilizable antes del pago.
> Deploy productivo Vercel `dpl_Gv7Y9yBkmBqr5j5HNwNaogqRBFAa`, estado `READY`,
> aliases `https://qlick.digital` y `https://www.qlick.digital` verificados
> HTTP 200; el cron sin credencial responde 401. `EVENT_PAYMENT_FOLLOWUP_MODE`
> está en `shadow` hasta que Meta apruebe las plantillas; no se envían
> seguimientos automáticos todavía.

> **Addendum 2026-08-11 — hardening conversacional en producción:** se
> integró `7c65601` en el checkout principal y se desplegó como
> `dpl_kQpUKkLc4rJsdZ7pimTXsgLs1WPR` en el proyecto Vercel `qlick`. El build
> remoto terminó `READY`; `https://qlick.digital`,
> `https://www.qlick.digital` y `/robots.txt` responden HTTP 200. El bot ahora
> bloquea pensamientos internos, evita nombres no verificados en saludos/LLM,
> conserva la regla `confirmed = pago o apartado verificado`, valida copy
> comercial antes de enviar y dispone de kill-switch `BOT_DECISION_ENGINE_MODE=safe`.
> El default productivo permanece `legacy` para activar gradualmente el motor
> estructurado sin poner en riesgo conversaciones existentes. Logs de Vercel
> de la primera hora: sin errores registrados.

> **Addendum 2026-08-10 — confirmado = pago o apartado verificado:** se desplegó
> la separación operativa entre `confirmed` y `payment_pending`. Producción
> Supabase `ugpejblymtbwtsoiykyj` quedó con 32 confirmaciones gratuitas,
> 1 pagada y 13 pendientes de pago; los 10 QR históricos vinculados a esas 13
> filas permanecen en la base, pero están revocados (0 QR activos para
> pendientes). La migración posterior fue aplicada por el script canónico y
> auditada sin tablas/columnas faltantes. El dashboard, QR, check-in, acceso,
> encuestas y broadcasts consumen únicamente `registration_status=confirmed`.
> Deploy Vercel `dpl_J1iCEBGQAe1fpHyuA6tqHKvPeRa8` en `READY`; aliases
> `https://qlick.digital` y `https://www.qlick.digital` responden `200`.
> `EVENT_PAYMENT_FOLLOWUP_MODE` permanece `off` hasta aprobar las dos
> plantillas Meta y guardar el secreto del cron en Vault; no se enviaron
> mensajes automáticos durante la promoción.


> **Addendum 2026-08-09 - enlace de leads de servicios:** las notificaciones nuevas por correo ya no apuntan a `qlick.app/admin/dashboard?tab=servicios`, dominio y ruta que no existen. El enlace canonico ahora es `https://www.qlick.digital/admin?tab=servicios`. Deploy `qlick-5jc3g6r7l-david17891-9351s-projects.vercel.app` en `READY`; smoke `/`, `/admin` y `/admin?tab=servicios` `200`, webhook sin firma `403`. Los correos ya enviados conservan su enlace original y no fueron modificados.

> **Addendum 2026-08-10 - deep-link de leads de servicios:** una solicitud de WhatsApp puede existir como `lead_service_interest` sin ser todavía un `service_order` (faltan variante/correo para cotizar). Las notificaciones nuevas abren directamente `/admin?tab=crm&leadId=...`; el CRM puede cargar el lead por id aunque no esté en la primera página. Deploy `dpl_GGUJMQrxhd2iLsraMotcC32WuH9E` en `READY`; smoke enlace CRM `200`, detalle sin sesión `401` y webhook sin firma `403`.

> **Propósito:** Single source of truth "dónde estamos AHORA". A diferencia de
> `ROADMAP.md` (planes) y `OPEN_ITEMS.md` (deuda histórica), este doc captura
> el estado actual de producción en un momento dado.
>
> **Cuándo actualizarlo:** después de cada deploy, cambio de env var, fix
> crítico, o descubrimiento que invalida lo escrito. NO es append-only —
> se sobreescribe con el nuevo snapshot.

> **Addendum 2026-08-08:** Revisión humana ahora incluye enlace directo a WhatsApp, clasificación automática por evento actual/anterior y borrado permanente auditado de datos CRM. Pagos, confirmaciones y asistencias de eventos se preservan y no se eliminan desde esta vista.

> **Addendum 2026-08-08 — asociación de conversaciones:** `related_event_id` ya se persiste en los nuevos turnos de WhatsApp y la revisión humana también reconoce el evento por el contenido del historial. En producción se reconciliaron 407 filas con su lead mediante teléfono y se asociaron 1,306 conversaciones con evidencia: 318 al evento actual CN26 y 988 al evento anterior AA4E. Quedan 227 mensajes como `Sin evento` por falta de lead o evidencia suficiente; no se asignaron por suposición. Deploy `dpl_3Em9QAQtEp8R8WEDAUXbEkqL2G93` en `READY`; aliases `https://qlick.digital` y `https://www.qlick.digital` verificados.

> **Addendum 2026-08-08 — corte post-registro:** se corrigió un caso real donde Melec tenía confirmación y QR válidos, pero el cron envió dos recordatorios de pago porque el lead no tenía la marca de registro completo. El estado de pago permanece `pending`, pero `next_follow_up_at` quedó en `NULL` y se agregaron marcas global y por evento. El bot ahora cierra el seguimiento automáticamente al crear la confirmación y conserva `related_event_id` al persistir follow-ups. Deploy `dpl_43dPUuLfeTGgnXiYjeo9c8Hjyt75` en `READY`; aliases `https://qlick.digital` y `https://www.qlick.digital` verificados con `/` 200, `/eventos` 200, `/admin` 200 y webhook sin firma 403.

> **Addendum 2026-08-09 — resolver de evento:** se centralizó la asociación de mensajes WhatsApp con niveles de confianza (`explicit`, `contextual`, `fallback`). La auditoría de 228 conversaciones sin evento no encontró base segura para una reasignación masiva: 64 no tienen lead, 226 no tienen evidencia explícita y las dos filas con señales de QR pertenecen al evento anterior. Se conserva `Sin evento` donde la evidencia no alcanza y se deja para revisión humana. Deploy `dpl_7zD4AEKq1QCj5Kq2YSTewnRqfZi2` en `READY`; aliases `https://qlick.digital` y `https://www.qlick.digital` verificados con `/` 200, `/eventos` 200, `/admin` 200 y webhook sin firma 403.

> **Addendum 2026-08-09 — ACK contextual:** el handler de acuses cortos ya distingue confirmación/QR de pago pendiente. Un “Ok”, “Listo” o “Gracias” después de un registro completo devuelve un cierre neutral y no reenvía el enlace de pago; si aún falta un dato, solicita solo ese campo. Deploy `dpl_3YVVhAJvSpMXhUcA9cxv3QgsVv1k` en `READY`; aliases `https://qlick.digital` y `https://www.qlick.digital` verificados con `/` 200, `/eventos` 200, `/admin` 200 y webhook sin firma 403.

> **Addendum 2026-08-09 — duplicados rápidos:** la auditoría de los últimos 14 días encontró 4 grupos de outbound repetidos; 2 fueron el mismo welcome automático enviado dos veces en menos de un segundo. Se agregó un guard idempotente que solo suprime el mismo texto automático de `welcome/greeting` dentro de 15 segundos; no afecta captura, pagos, handoffs ni mensajes manuales. Los mensajes históricos no se borraron ni modificaron. Deploy `dpl_e89DMVj4iDQbdufY7Dmw4Vo7xwCM` en `READY`; alias `https://www.qlick.digital` verificado con `/` 200, `/eventos` 200, `/admin` 200 y webhook sin firma 403. Pendiente: matriz completa de regresión y canary de automatizaciones.

> **Addendum 2026-08-09 — ronda manual de recuperación:** producción tiene el rescate histórico `lead_info_followup_mode=off`. La cola conserva 8 casos `sent`, 11 `duplicate_review`, 43 `blocked_template_required`, 16 `replied` y 27 `excluded`; no hay candidatos `eligible`. Los tres `next_follow_up_at` activos asociados a la cola corresponden a leads con pago pendiente y no se tocaron. La ronda manual debe hacerse desde WhatsApp/Revisión humana antes de reactivar cualquier rescate automático. Deploy de la UI `dpl_3cLcFR4gm37ekG3Sidfhx8oFZbgs` en `READY`; smoke `/`, `/eventos`, `/admin` 200 y webhook sin firma 403.

> **Addendum 2026-08-09 — separación de leads nuevos y horario:** el cron ahora distingue `lead_new_info_followup_mode` del rescate histórico y solo considera leads creados desde `lead_new_info_followup_since`, excluyendo `recovery:info_historical`. Los mensajes proactivos quedan bloqueados fuera de 09:00–19:00 en `America/Phoenix`; las respuestas entrantes del bot no se bloquean por esta regla. B-10 quedó validado con pruebas de alcance y horario, type-check, lint y build.

> **Addendum 2026-08-09 — activación controlada de leads nuevos:** `lead_new_info_followup_mode=live` desde `2026-08-09T09:01:22Z`, con `lead_info_followup_mode=off`. Al activar el corte había 0 leads existentes dentro del alcance, 0 informativos y 0 programados; no se envió ningún mensaje por esta activación. Deploy `dpl_CqBJpq5UitiQrqEYtjXjmYgn31fJ` en `READY`; smoke `/`, `/eventos`, `/admin` 200 y webhook sin firma 403.
>
> **Producción actual 2026-08-08:** merge `674fe32` desplegado como `dpl_2uUzRXeqMLkm6toJ4EkzMLXbkKAn` (`READY`) desde `main`. Aliases verificados: `https://qlick.digital` y `https://www.qlick.digital`. Smoke público: `/`, `/eventos` y `/admin` `200`; `/api/admin/crm/overview` sin sesión `401`; `/api/whatsapp/webhook` sin firma `403`.
>
> **Última actualización:** 2026-08-08 — LMS desactivado: 0 cursos, 0 inscripciones, 0 accesos y 0 pagos LMS. Producción conserva 2 eventos reales (1 publicado y 1 archivado), 6 pagos de eventos (1 aprobado, 2 pendientes y 3 cancelados) y 1 pedido de servicio. El CRM conserva 222 leads: 220 de WhatsApp y 2 manuales; se mantienen los que tienen teléfono real normalizado o evidencia de confirmación en los dos eventos válidos. Se limpiaron 180 correos sintéticos `@placeholder.local` sin borrar leads: quedan 179 leads de WhatsApp con correo pendiente (`NULL`). Los 222 leads están asignados a un responsable autorizado; las 3 tareas de prueba quedaron canceladas y los 28 handoffs huérfanos quedaron cerrados, con 12 handoffs válidos pendientes. Estado CRM: 0 tareas abiertas, 0 vencidas, 0 leads estancados sin tarea, 0 leads sin responsable y 0 duplicados exactos de email/teléfono; permanecen 1,545 conversaciones WhatsApp históricas. La etiqueta `Marketing pendiente (etiqueta interna)` no significa que una persona haya rechazado contacto: indica que no hay captura explícita de consentimiento de marketing. El CRM tiene una sección propia `Revisión humana` que prioriza contextos, propone causa probable de no respuesta y guarda la retroalimentación del bot como nota, interacción y auditoría. No se enviaron mensajes automáticos de rescate. El admin mantiene LMS oculto y `/admin?tab=mantenimiento` ofrece auditoría y limpieza confirmada. Deploy promovido `dpl_8TE6skexetknQRax3NrXdGkA1PbW`, alias `https://www.qlick.digital` verificado con HTTP 200. Ver `docs/CRM_HUMAN_REVIEW.md` y `docs/CRM_OPERATING_MODEL.md`.
>
> **Body del doc (líneas debajo):** es archivo histórico de sprints cerrados. Para estado actual, ver este snapshot.

---

## Snapshot anterior — 2026-07-28 · Producción activa

## Estado actual — 2026-07-30 · Continuidad de inscripciones incompletas desplegada

- **Continuidad de inscripción (PR #69, merge `713a7338`):** el bot ya no abandona el flujo cuando una persona responde con un agradecimiento u otro mensaje corto después de recibir la pregunta de nombre/correo. Recupera el campo pendiente desde el historial, conserva la etapa `interested` y marca `registration:incomplete` para que el scheduler pueda continuar.
- **Política de contacto:** una señal explícita de inscripción permite el seguimiento operativo dentro de la ventana de WhatsApp de 24 horas, aunque `consent_to_contact` siga en `false`. Esto no otorga consentimiento de marketing. La pausa del bot y los opt-out continúan bloqueando el envío.
- **Seguimiento CRM/WhatsApp:** el CRM conserva etapa, consentimiento, pausa y próxima fecha de seguimiento. El job clasifica registros incompletos y pagos pendientes, respeta la ventana de 24 horas y limita la cadencia a dos seguimientos por ventana.
- **Scheduler horario:** `.github/workflows/lead-followup.yml` ejecuta `GET /api/cron/lead-followup` cada hora y permite ejecución manual. La ruta usa `LEAD_FOLLOWUP_CRON_SECRET` estricto y rechaza peticiones sin Bearer con `401`; el secreto está configurado en Vercel Production/Preview y GitHub Actions, sin registrarse en el repositorio.
- **Verificación controlada:** la ejecución `30578750411` terminó en verde. El registro histórico del caso quedó en `status=interested`, `intent=enroll_course`, `registration:incomplete`, con `consent_to_contact=false`; se envió exactamente un recordatorio breve y se persistió como `delivered`, solicitando el nombre completo pendiente.
- **Deployment:** `dpl_G72XruYz4oU5C2bhWUpE3Z2NFKB3`, `READY`, commit `713a7338`, aliases `https://qlick.digital` y `https://www.qlick.digital`. La vista autenticada de Conversaciones en producción muestra `Seguimiento: activo`, `Registro incompleto` y `CRM: Interesado` para el caso rescatado.
- **Validación de código:** `npm test` `1613/1613`, `npm run type-check`, `npm run lint` y `npm run build` verdes. El check E2E de Supabase de GitHub Actions quedó omitido por ausencia de secretos del runner; no invalida los checks locales ni la verificación contra la base de producción. El flag `system_settings.bot_global_rules_enabled` sigue apagado y fuera de este despliegue funcional.

- **Fix de duplicado de QR (PR #62, merge `b7aa90f`):** el registro público continúa enviando el primer pase con instrucciones de pago. Cuando Stripe confirma el pago, el notifier consulta `event_email_log` y solo entrega el QR si no existe un envío exitoso previo para ese evento y correo. El reenvío manual del administrador conserva su comportamiento. Pruebas de idempotencia `4/4`, checks de CI verdes, type-check/lint/build verdes.
- **Deployment de producción:** `dpl_HKFQFrtxMh7yvSxe2arLwtyr6bzt`, estado `READY`, alias `https://www.qlick.digital`, commit `dad5f59`; homepage pública verificada con HTTP 200.
- **Reconciliación:** el checkout local histórico estaba en `b31e467`; GitHub `main` y producción ahora están alineados en `dad5f59`. El fix de refresh token inválido está mergeado y desplegado.

- **Fix crítico del bot (PR #59, merge `edd049f`):** el primer contacto de un evento activo usa un resumen factual compacto (título, fecha, sede, duración, precio/apartado y CTA) en un solo mensaje interactivo; el detalle largo queda para cuando se solicita explícitamente. Las notas de voz sin transcripción ya no pasan al LLM ni generan respuestas basadas en el contexto anterior: el bot pide continuar por texto. Tests dirigidos `8/8`, checks de CI verdes, type-check/lint/build verdes. No se envió un WhatsApp real durante la validación post-deploy.
- **Deployment de producción:** `dpl_3w5ZRFzpqWWARqDeEEkXa4ke3GUB`, estado `READY`, alias `https://www.qlick.digital`; homepage pública `200` y webhook público responde `403` sin el token de verificación, como corresponde.

- **Sprint "activar ai_bot_rules en el bot real" (Mavis, 11:12 + 12:30 GMT-7):** código listo en working tree, **aún NO commiteado a main** (segunda corrección post-revisión de David aplicada a las 12:30). Feature flag `system_settings.bot_global_rules_enabled` en `false` por default (FAIL-CLOSED). El código de inyección de Reglas de Oro Globales al prompt del LLM (Super Ejecutivo, Human First, Socrático) está deployable y probado, pero gateado por el flag. 24 tests nuevos (12 del loader + 12 del prompt) cubren el scope unificado `event:<id>`/`event:<slug>`, rechazo de scopes desconocidos (`course:`, `mode:`), piso de slots para evento en el top-N, y header placeholder duplicado eliminado. `npm run type-check`, `npm run lint` y `npm run build` en verde. Pendiente: commit del working tree + push + merge a main antes de activar el flag. Ver `docs/ACTIVATION_GRADUAL_BOT_GLOBAL_RULES.md` (4 fases) y `docs/PLAN_ROLLBACK_BOT_GLOBAL_RULES.md` (3 opciones: soft/hard/emergency).
- Tarjeta destacada de la home actualizada a una superficie oscura integrada al hero; se conservan la jerarquía del servicio, beneficios, precio y CTA sin el bloque blanco anterior.
- Deployment de producción: `https://www.qlick.digital`; deployment inspectable en `https://vercel.com/david17891-9351s-projects/qlick/3zKMPnrYqNRvf1BhjjpCQm7P5s4L`.

- Rediseño premium de `/`: hero editorial, oferta dinámica destacada, diferenciadores, catálogo de servicios, flujo breve de trabajo, estándar de entrega y CTA final; se eliminó la prueba social no verificada y se actualizó el copy del footer/metadatos para reflejar servicios y eventos reales.
- Deployment de producción: `https://www.qlick.digital` responde con el rediseño; deployment inspectable en `https://vercel.com/david17891-9351s-projects/qlick/DMrn4X7rxvCZuYnGPZMm523aJLyt`.
- Verificación visual: escritorio 1280×720, móvil 390×844, menú móvil, enlaces principales y estado de consola revisados. La home se dejó como `force-dynamic` porque catálogo/eventos dependen de Supabase en runtime.

- Evento publicado: `Desarrollo y estructura del curso CANACO` (`short_code=CN26`, `id=4100ffe3-54c1-45c1-a3a6-515595a646ad`). Título actual en DB: `"Los 4 Pilares de un Negocio que Vende"`. Fecha: 20 de agosto de 2026, 16:00–20:00; sede mostrada: `CANACO` (la dirección exacta sigue pendiente de confirmación).
- Modelo comercial activo: total $1,000 MXN; apartado $500 MXN; saldo $500 MXN el día del evento. `event_rules.payment_mode: "live"`. La ruta pública ofrece botones independientes para apartar o pagar completo.
- Bot de información: cuando una persona escribe `info`, `información` o pregunta por el evento, entrega un resumen del objetivo, las cuatro bases (video, publicidad pagada, inteligencia artificial y seguimiento por WhatsApp), fecha, horario, sede, precio y esquema de apartado; no inventa la dirección pendiente y ofrece el enlace oficial.
- Flujo de inscripción: el bot conserva español mexicano neutro, genera el enlace `payment_option=reservation`, registra la confirmación en `pending` y deja que el webhook de Stripe la marque como pagada. El flujo de nombre + correo crea un solo QR y un solo correo; no duplica efectos secundarios.
- Webhook de Stripe: el checkout de invitados de eventos ya no depende de crear un usuario de Auth antes de registrar el pago. El evento se vincula por `confirmation_id`/correo y los cursos conservan su requisito de usuario autenticado. La idempotencia y las referencias Stripe permanecen activas.
- Release: PR #43 mergeado a `main`; la producción está desplegada y sin errores runtime en la última hora. No se hizo un cargo real durante la validación posterior al fix; el E2E controlado usó Stripe test por $10 MXN y dejó acceso activo correctamente.
- Pendientes no bloqueantes: confirmar la dirección exacta de CANACO, definir cómo se concilia el saldo de $500 y vigilar las primeras conversaciones reales en CRM, `event_email_log`, registros de webhook y Vercel.

- Migración `20260722130000_stripe_session_conflict_targets.sql` aplicada y verificada en Supabase Production; PR34 la versiona para reproducibilidad.
- `npm run test:ci`: 1483/1483 PASS (gate estático portable; las suites E2E con secretos quedan fuera). `npm run test:e2e:funnel`: PASS con WhatsApp/Brevo mock y webhook Stripe test firmado. `npm run type-check`: PASS. `npm run lint`: PASS.
- Suite completa: 1488 PASS y 3 fallos preexistentes de fixtures CRM (aislamiento/duplicado de teléfono); no son fallos del flujo de pagos.
- Smoke Production seguro: Checkout test 200; webhook sin firma 400; firma falsa 401. E2E backend firmado de paid/pending/async/refund/dispute/service validado y cleanup verificado.
- Estado Stripe: **GO validado para eventos** (cargo real + webhook + acceso verificados). El evento QA ya fue archivado (`status=draft`) tras conciliar el cargo; el ledger y el acceso quedan conservados como evidencia. Publicar solo eventos reales con `event_rules.payment_mode=live`. Servicios siguen en test salvo `STRIPE_SERVICE_PAYMENT_MODE=live`; cursos siguen en test por diseño. La entrega de QR/email/WhatsApp quedó verificada en el E2E controlado; las primeras entregas reales quedan bajo monitoreo operativo.
- Producción: deployment Vercel `dpl_F7kRJYrYHrE58y19P5pAFvQM8NeV` en estado `READY`, aliases `qlick.digital` y `www.qlick.digital` responden (200 final tras la redirección canónica).

## Sprint v0.10 — 4 bloques hardening + 4 hotfixes E2E (2026-07-14 02:30 → 04:35)

**Estado actual:** ✅ Cerrado y mergeado a `main` (HEAD `15162fc`). 1362/1362 tests verde, type-check 0, lint 0/0, build OK. 8 commits atómicos consecutivos a main (4 bloques + 4 hotfixes). Sin migrations nuevas.

**BLOQUE 1 — ZWSP hardening** (commit `3c1b454`):
  - `stripInvisibleChars` helper en `src/lib/utils.ts` (+35) que purga `\u200B-\u200D\uFEFF\u2060`.
  - Sanitización de `contactName` en 4 puntos del bot-engine + synthetic-leads.
  - Cierra el MEDIUM del audit PR #10 (deep). 60/60 audit OK.

**BLOQUE 2 — Check-in performance** (commit `a92c4e1`):
  - `Promise.all` en `/api/check-in/[token]` y `/api/staff/check-in` (3 SELECTs paralelos, 2 UPDATEs paralelos).
  - Audit log fire-and-forget (`void + .catch(errorLog)`) en lugar de await.
  - Reduce latencia del check-in ~60%. 1339/1339 tests.

**BLOQUE 3 — CRM paginación + parseLeadName** (commit `7e530e8`):
  - Paginación 1-indexed en `/api/admin/leads` (defaults `page=1`, `limit=50`, max 200, back-compat `pageSize` + `page=0` legacy).
  - `parseLeadName` que separa `firstName/lastName`, preserva tags en medio/final.
  - UI con barra de paginación en `CRMView`. 1359/1359 tests.

**BLOQUE 4 — E2E journey human_first** (commit `09c620d`):
  - Script `scripts/e2e-bot-journey-real-validation.mjs` (591 líneas) con 5 turnos del journey.
  - 38/38 PASS con mock, 39/39 con deepseek real.

**HOTFIX #1 — Cast as-never** (commit `fdbdbff`):
  - `fix(ai): persistencia real de extract_and_save_contact_info`.
  - Removido `as { supabase?: never }` en `deepseek-provider.ts:638`. El cast forzaba el tipo a `never`, runtime `context.supabase` SIEMPRE `undefined` → substituido a `null` → tool corría en MODO DEMO aunque el bot-engine pasara el cliente admin real.
  - Tipado correcto: `SupabaseClient<Database> | null` en `agent-provider.ts:109`.
  - **Lección:** un cast `as never` sobre un campo del context hace que el runtime SIEMPRE reciba `undefined`. SILENCIOSO.

**HOTFIX #2 — jsonb string vs boolean** (commit `901f283`):
  - `fix(ai): aceptar string "true"/"false" en deepseek_tools_enabled (jsonb round-trip)`.
  - El consumer comparaba `v === true` (estricto), pero `setSystemSetting(key, "true", ...)` serializa la string y Supabase guarda como `jsonb` string, NO boolean.
  - **Lección:** jsonb en Supabase hace round-trip y a veces entrega el tipo primitivo equivocado. Asumir que puede llegar como string.

**HOTFIX #3 — Tool dispatch !=extract** (commit `67765f9`):
  - `feat(ai): soporte de add_event_guest en el tool dispatch`.
  - El dispatch era `if (tc.function.name !== "extract") reject`, rechazaba TODA tool != extract, incluyendo `add_event_guest`.
  - **Lección:** cuando se exponen N tools al LLM, el dispatch DEBE tener N branches explícitos, no "reject todo lo != X".
  - Tests CASO 9 con 3 nuevos. Defense in depth `parent_lead_id: parsedArgs.parent_lead_id || context.leadId || ""`.

**HOTFIX #4 — parent_lead_id opcional** (commit `b03c3da`):
  - `fix(ai): parent_lead_id opcional en add_event_guest + E2E con deepseek real`.
  - Tras los 3 hotfixes anteriores, el LLM empezó a recibir el dispatch correcto, pero en el E2E NO emitia `add_event_guest` cuando el titular pedia inscribir a un acompañante. La razón: el schema declaraba `parent_lead_id` como required y el LLM es conservador — prefiere pedir más info al usuario antes que llamar a una tool con un campo obligatorio que no puede resolver.
  - **Fix:** `parent_lead_id` sale del array `required` y la description declara explicitamente que es OPCIONAL, con instrucción de omitirlo si no se conoce. El dispatch ya tenia defense-in-depth desde `67765f9`.
  - Actualizadas las secciones REGISTRO DE ACOMPAÑANTES (super_executive) y HERRAMIENTAS DISPONIBLES (human_first) del prompt.
  - E2E con deepseek real `scripts/e2e-add-guest-real-validation.mjs`: 15/15 PASS. Guest 'Carlos Mendoza' persistido correctamente en `event_attendees.guests` JSONB con id, name, email, added_at.

**Verificación consolidada:**
  - `npm run type-check`: 0 errores.
  - `npm run lint`: 0 warnings.
  - `npm test`: 1362/1362 verde.
  - `scripts/adversarial-audit-sprint-v0.9x.mjs`: 15/15 verde.
  - `scripts/adversarial-audit-pr10-deep.mjs`: 60/60 verde.
  - `scripts/e2e-bot-journey-real-validation.mjs`: 39/39 verde (deepseek real).
  - `scripts/e2e-add-guest-real-validation.mjs`: 15/15 verde (deepseek real).

**Pendiente (fuera de scope del sprint):**
  - Agregar columna `lead_id` a `event_attendees` o cambiar la query del executor `executeAddEventGuest` para buscar por `(event_id, lead_id)` en vez de `id`. Workaround actual: insertar attendee con `id = leadId`. Migration aditiva + update del executor en sprint aparte.
  - **ACCIÓN REQUERIDA DE DAVID:** revocar la API key de DeepSeek en `https://platform.deepseek.com/api_keys` (key quedó en historial de chat de esta sesión, riesgo asumido al pegarla).

**PR / commit chain (8 commits consecutivos a `main`):**
  `3c1b454` → `a92c4e1` → `7e530e8` → `09c620d` → `99d9712` (debug, removido) → `fdbdbff` → `901f283` → `67765f9` → `b03c3da` → `15162fc` (log entry).


## Sprint v0.9.x — `human_first` mode + simulador Real (2026-07-14 00:30 → 02:30)

**Estado actual:** ✅ Cerrado en rama `feat/human-first-mode` (no mergeado a main). 4 PRs atómicos. 1320/1320 tests verde. Migration aplicada a prod. Sprint documentado en `data/PROJECT-LOG.md` y `docs/HANDOFF_v0.9.x_human-first.md`.

**Resumen de los 4 PRs:**

1. **PR #1 — Modo opt-in `human_first` aislado** (commit `e0b07f4`):
   - SSOT (`BotGlobalMode` + `isBotGlobalMode` en `system-settings-server.ts`) extendido con el 4to valor `"human_first"`.
   - System prompt nuevo: `buildHumanFirstPrompt` en `agent-prompts.ts` (~150 líneas) con safeguards completas heredadas del Súper Ejecutivo (NO_ACTIVE_EVENTS_MODE, anti-alucinación, D-025, opt_out `[[OPT_OUT]]`, escalación `[[ESCALATE_HUMAN]]`).
   - Dispatch en `pickSystemPromptForMode` del deepseek-provider.
   - UI admin: 4ta `ModeTarjeta` con badge `🧪 EXPERIMENTO` en `BotConfigTab`.
   - UI simulador: opción `human_first` en `MODE_LABELS`, `MODE_EMOJI`, selector de override.
   - API: validación actualizada en `/api/admin/bot/mode`.
   - 19 tests nuevos en `tests/human-first-mode.test.mjs` (9 type guard + 10 integración del prompt).
   - Auditoría arregló 2 problemas críticos: tool inexistente `send_interactive_button` removida del prompt + `eventRules` y D-025 ahora se inyectan.

2. **PR #2 — Skip de intents cuando `human_first`** (commit `ff3a367`):
   - Helper `resolveIntent(body, isFirstMessage, isHumanFirstMode)` (sync, pure) en `bot-engine.ts`.
   - `human_first=true` → solo `opt_out`, `provide_email`, o `question` (LLM).
   - `human_first=false` → comportamiento IDÉNTICO al de los 3 modos anteriores (regresión 0).
   - 4 call sites de `detectIntent` reemplazados por `resolveIntent`.
   - 8 tests nuevos (regresión + skip welcome/greeting/register + gates mantenidos).

3. **PR #3 — Simulador modo Real con personas sintéticas** (commit `45503f5`):
   - Migration `20260714100000_leads_simulation_source.sql`: 2 columnas nuevas en `leads` (`simulation_source`, `simulation_metadata`) + CHECK + index parcial + NOTIFY pgrst.
   - Helper `src/lib/whatsapp/synthetic-leads.ts`: `createSyntheticLead`, `listSyntheticLeads`, `deleteAllSyntheticLeads`. Phone sintético `+52555555XX` (Meta rechaza), email `qlick.test` (RFC 2606).
   - Endpoint `POST/GET/DELETE /api/admin/bot/synthetic-leads` con auth admin y `{ confirm: true }` obligatorio para DELETE.
   - Endpoint `POST /api/admin/bot/simulate/real` que ejecuta `processInboundMessage` con el lead sintético. Rate limit 100 turnos/lead.
   - UI: toggle Sandbox/Real, banner rojo persistente con auto-timeout 30 min, lista de sintéticos, botones Crear/Limpiar todo.
   - 8 tests nuevos en `tests/synthetic-leads-helper.test.mjs`.

4. **PR #4 — Tests E2E + docs del modo Real** (commit `38128d5`):
   - 11 tests en `tests/api-admin-bot-simulate-real.test.mjs` que validan el contrato del endpoint (auth, validación, shape, rate limit, paridad con producción) y documentan el flujo end-to-end (13 pasos).

**Lo que el admin puede hacer AHORA con este sprint:**

- **Activar el modo `human_first`** desde `/admin/bot` → el bot bypasea los interactive buttons y deja al LLM controlar el flow. Mantiene `opt_out` y `provide_email` como gates.
- **Probar el simulador en modo Real** desde `/admin/bot` (pestaña "Laboratorio") → crear personas sintéticas, mandarles mensajes, ver el flow completo. El provider outbound fallará (esperado, phone no existe en Meta) pero el LLM corre y persiste.
- **Limpiar las personas sintéticas** con un click desde la UI del simulador.

---

## Sprint v0.9.x PR #10 — Hardening `human_first` (2026-07-14 02:20 → 02:30)

**Estado actual:** ✅ Cerrado y mergeado a `main` (commit `edfdea5`). 1327/1327 tests verde, type-check 0, lint 0/0. Sin migrations nuevas (cambios defensivos puro código + tests). 2 audits adversariales en verde.

**3 cambios defensivos:**

1. **Body truncation a 4096 chars** (`MAX_WHATSAPP_BODY_LENGTH`, límite oficial Meta): aplicado en `src/app/api/whatsapp/webhook/route.ts` (antes de persistir en `lead_whatsapp_conversations.body`) y defense-in-depth en `src/lib/whatsapp/bot-engine.ts`. Cierra el gap MEDIUM de DoS body 100k+ chars.

2. **Invariante runtime de `human_first`** en `bot-engine.ts`: si por desvío futuro (nuevo path que setea intent, race condition, refactor) el intent NO está en `{opt_out, provide_email, question}`, se loguea con `errorLog` (incluye `leadId`, `unexpectedIntent`, `bodyPreview`) y se fuerza a `"question"`. Safety net sobre el override existente (PR #9).

3. **Cobertura de `human_first` en massive-matrix-generator**: agregados 3 nuevos `ContextKey` (`human_first+free_masterclass`, `human_first+paid_course`, `human_first+no_active_event`). Matriz ahora 10 × 7 × 5 = 350 situaciones (era 200). Tests `bot-simulator-massive-matrix.test.mjs` actualizados: 350, 7 contextos, 35 por arquetipo.

**Auditoría adversarial profunda (`scripts/adversarial-audit-pr10-deep.mjs`):** 60 tests en 11 categorías. **59/60 OK**, 0 CRITICAL/HIGH. Único MEDIUM documentado: ZWSP (zero-width space) en `leads.name` persiste como TEXT literal en Supabase. Trade-off conocido (el LLM no se confunde, React renderiza como no-op, UI no rompe). Si querés cerrar este gap, agregar `name.replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")` en `createSyntheticLead` y en el path de `provide_name` persistence.

**Categorías de la nueva auditoría (vs. la anterior de 15 tests):**
- 7.1 Prompt injection en body (5 payloads).
- 7.2 Zero-width Unicode smuggling en body y name.
- 7.3 Bypass de `EMAIL_RE` con `@` fullwidth, whitespace, newlines.
- 7.4 Bypass de `OPT_OUT_RE` con STOP fullwidth, whitespace, newlines.
- 7.5 human_first intent drift (7 cuerpos que en modo normal dispararían otros flows).
- 7.6 human_first invariant (12 bodies fuzz → siempre intent ∈ allowed set).
- 7.7 Phone format edge cases (8 variantes: espacios, guiones, newlines, doble `+`, etc.).
- 7.8 Body truncation boundary (5 tamaños: 4095, 4096, 4097, 5000, 50000 → todos ≤ 4096).
- 7.9 Multi-turn prompt injection (ZWSP instruction + trigger en turn 2).
- 7.10 Massive synthetic lead batch (50 leads en paralelo, todos únicos, 538ms total).
- 7.11 Massive matrix ContextKeys (3 nuevos + total 350).

**Riesgos identificados y mitigaciones aplicadas:**
- Personas sintéticas en DB de prod: marcadas con `simulation_source='admin_lab'`, filtro SQL para excluirlas de stats.
- Phone sintético en Meta: rechazado (status 400), loggeado en `lead_whatsapp_conversations.metadata.error_note`.
- DoS body 100k+ chars: truncado a 4096 antes de persistir (PR #10).
- Drift del invariante human_first: loggeado y forzado a `question` (PR #10).
- Auto-desconexión del modo Real: 30 min sin actividad.
- Doble confirmación de limpieza: `window.confirm()` + `{ confirm: true }` en el body.
- Rate limit: 100 turnos/lead sintético.
- Authorization: `requireAdmin` en todos los endpoints.

**Deuda técnica anotada (NO fixée en este sprint):**
- 4 declaraciones duplicadas del type `BotMode`/`BotGlobalMode`. Marcadas con `// FIXME:`. Refactor queda para sprint aparte.
- `massive-matrix-generator.ts` no incluye `human_first` en su `ContextKey`. Documentado con TODO.

**Próximos pasos sugeridos (sprint siguiente):**
- Review + merge a `main` de la rama `feat/human-first-mode`.
- Promover `human_first` a default si los resultados de la experimentación son buenos.
- Implementar la tool `send_interactive_button` (TODOs del prompt `human_first`) si David quiere que el modo también pueda mandar interactive buttons.
- Refactor de la duplicación de types (`src/lib/ai/bot-mode.ts` SSOT).

---

## Sprint v17-4 — v0.9.8 + v0.9.9 (2026-07-12 05:00): mejoras del Súper Ejecutivo + arnés masivo

**Cambios:**

1. **Mejora v0.9.8 #1 — Detección de typos de dominio en `extract-contact.ts`** (commit `2348103`):
   - `DOMAIN_TYPOS` dict con 15 typos frecuentes (gmial.com, hotmial.com, gnmail.com, yaho.com, outlok.com, etc.).
   - `detectDomainTypo()` corre sobre el email parseado antes de validar formato.
   - `executeExtractAndSaveContact()` retorna `status: "needs_domain_confirmation"` con `suggested_domain` y `raw_domain` cuando hay typo.
   - `ExtractContactResult` interface extendida: `needsConfirmation`, `suggestedDomain`, `rawDomain`, `suggestionMessage`.
   - +15 tests en `tests/extract-contact-typo.test.mjs`.

2. **Mejora v0.9.8 #2 — Cadencia suave de cierre (anti-insistencia)** (commit `038b519`):
   - Bloque `CADENCIA SUAVE DE CIERRE (ANTI-INSISTENCIA)` agregado al WhatsApp del Súper Ejecutivo en `buildSuperExecutivePrompt` (`src/lib/ai/agent-prompts.ts`).
   - Regla: máximo 1 mención al enlace de pago/registro por ventana de 4 turnos, 1 pregunta de calificación por ventana de 6 turnos, si el usuario ya mostró resistencia (>0 objeciones) NUNCA insistir con el mismo ángulo.
   - Copy rígido del v0.9.6 reemplazado por directivas flexibles (decidido → CTA inmediato, dudas → cierre conversacional sin CTA duro).
   - +13 tests de tono actualizados en `tests/agent-prompts-tone.test.mjs`.

3. **Mejora v0.9.8 #3 — Tool `add_event_guest` + migración `guests JSONB` + registro de acompañantes** (commit `b91207f`):
   - Migración `supabase/migrations/20260712044100_event_attendees_guests.sql`: columna `guests JSONB NOT NULL DEFAULT '[]'::jsonb` en `event_attendees`. RLS heredada.
   - Nueva tool `add_event_guest` en `getAgentTools()` (`src/lib/ai/agent-tools.ts`): esquema estricto (`parent_lead_id` req, `guest_name` req, `guest_email` opt). Total de tools del Súper Ejecutivo: **2** (`extract_contact` + `add_event_guest`).
   - Executor `src/lib/ai/tool-executors/add-guest.ts`: idempotente por nombre (case-insensitive trim, mismo nombre actualiza email/added_at, preserva id). Helpers `isValidGuestNameLocal`, `validateAndNormalizeGuestEmail`, `findGuestByName`, `upsertGuestInArray`. Cast `as unknown as` para typegen stale.
   - Prompt Súper Ejecutivo: bloque `REGISTRO DE ACOMPAÑANTES (TOOL add_event_guest)` REEMPLAZA el bloque `LÍMITE TÉCNICO DE REGISTRO` del v0.9.7 hotfix. 3 reglas: DISPONIBLE (tool existe, no tiene límite rígido), CONFIRMACIÓN CÁLIDA (registra + confirma con nombre), LIMITACIÓN (si tool falla, NO inventar registro).
   - +12 tests en `tests/add_event_guest.test.mjs` (idempotencia, validación, errores DB).
   - Tests legacy actualizados: `simulate-long-conversation.test.mjs` (copy "Quedas registrado tú y también tu socio Carlos" en t4, `hasGuestTool` branch), `whatsapp-bot-v2-tool-atomic.test.mjs` (invariante de length===2).

4. **v0.9.9 #1 — Arnés de simulación masiva 200 situaciones cartesianas** (commit `f5d6b5f`):
   - `src/lib/ai/simulation/massive-matrix-generator.ts`: 10 arquetipos × 4 contextos × 5 trayectorias = 200 situaciones. Arquetipos: `apresurado`, `desconfiado`, `tecnico`, `fuera_de_horario`, `acompanantes`, `typo_email`, `cadencia_larga`, `asesor_humano`, `monosilabo`, `hostil`. Contextos: `super_executive+free_masterclass`, `super_executive+paid_course`, `socratic_autopilot_v2+lms_course`, `fallback+no_active_event`. Trayectorias: `quick_convert`, `standard_funnel`, `deep_objection`, `abandonment`, `reactivation`.
   - `src/lib/ai/simulation/matrix-auditor.ts`: 5 métricas (`isBrief`, `guestsHandledCorrectly`, `typoIntercepted`, `cadenciaSuaveRespetada`, `toolCalledCorrectly`), `mockBotRespond` determinístico, `auditTurn`, `auditSituation`, `auditMatrix`. Reporte con `byArchetype`, `byMetric`, `situationAudits` detallados.
   - `scripts/generate-massive-report.mjs`: genera reporte ejecutivo (.md commiteable) y reporte completo (.json en `private-data/` gitignored).
   - +8 tests en `tests/bot-simulator-massive-matrix.test.mjs` (cardinalidad 200, unicidad de IDs, distribución cartesiana, presencia de expects en arquetipos clave, duración <5s, agregación correcta, detalles de SituationAudit).

5. **v0.9.9 #2 — Reporte ejecutivo de simulación masiva** (commit `adf6b88`):
   - `docs/BOT_MASSIVE_SIMULATION_200_REPORT.md`: 215 líneas, semáforo por arquetipo, desglose por métrica, listado de fallas detectadas (primeras 20), distribución por contexto.
   - Reporte completo en `private-data/reports/bot_simulation_massive_200.json` (gitignored, ~236KB).

**Rama:** `feat/fase-17-4-improvements-and-massive-harness` (desde main HEAD `aea4b8e`, 5 commits atómicos) → **mergeada a main el 2026-07-12 19:30 Phoenix (PR #26 MERGED, HEAD `89902e8`)**.

**Validación:** type-check ✓ · lint ✓ (0/0) · **1262/1262 tests verde** (+36 desde 1226 baseline) · build ✓ · arnés corre 200 situaciones en 5ms (límite <5s).

**Reporte de la matriz (baseline):**
- Total: 200 situaciones
- Pass rate: **60.0%** (120/200)
- 6 arquetipos 🟢: `desconfiado`, `tecnico`, `acompanantes`, `typo_email`, `monosilabo`, `hostil`
- 4 arquetipos 🔴: `apresurado`, `fuera_de_horario`, `cadencia_larga`, `asesor_humano` (situaciones de stress esperables, documentadas)

**Riesgo operacional:**
- La migración `20260712044100_event_attendees_guests.sql` es ADITIVA (solo `add column if not exists`). RLS heredada de `event_attendees`. Si David la aplica a prod antes del merge, los acompañantes ya existentes serán `[]` y las herramientas `add_event_guest` empezarán a poblarlos idempotentemente.
- El executor `add-guest.ts` usa `as unknown as { guests: GuestRecord[] | null }` por typegen Supabase stale — la columna nueva no está en `database.types.ts` hasta regenerar con `npm run typegen`. La regeneración NO es bloqueante para el PR; el cast asegura type-check verde sin tocar el typegen.
- El script `generate-massive-report.mjs` requiere el loader `tests/loader-register.mjs` para resolver los `.ts` que importa (mismo patrón que los tests del arnés masivo).

---

**Cambios:**

1. **Endpoint dedicado `/api/admin/bot/mode`** (`src/app/api/admin/bot/mode/route.ts`, 95 líneas, patrón idéntico a `/api/admin/bot/global-pause`):
   - `GET` → `{ ok, mode: BotMode | null }` leyendo `system_settings.bot_global_mode`.
   - `POST` con body `{ mode: "socratic_autopilot_v2" | "socratic_no_tools_v1" | "super_executive" }` → UPSERT en system_settings. Idempotente. Valida contra set cerrado de 3 valores; cualquier otro string → 400.
   - `requireAdmin` + `checkSupabaseConfig` (mismo guard que el resto del admin).
2. **SSOT `BotGlobalMode` + type guard `isBotGlobalMode`** en `src/lib/admin/system-settings-server.ts` (32 líneas nuevas). El type guard se usa tanto en lectura (defensivo contra jsonb viejo) como en escritura (rechazo antes del UPSERT).
3. **`onSelectMode` ahora persiste** en `BotConfigTab.tsx` (commit frontend):
   - Optimistic update + POST a `/api/admin/bot/mode` + refetch de `/api/admin/bot/stats` para reconciliar `stats.bot_global_mode` con la SSOT.
   - Si el POST falla → rollback del modo local + `setError` con el mensaje.
   - No-op si ya está activo el modo.
   - Estado `modeSaving` deshabilita las 3 ModeTarjeta durante el POST.
4. **Anti-flicker de carga** en la sección "Modo Global del Bot":
   - Antes: `useState<BotMode>("socratic_autopilot_v2")` inicializaba con Socrático v2 por defecto. Cuando `fetchStats()` terminaba (~500ms después), saltaba a `stats.bot_global_mode`. La UI dibujaba un modo falso por medio segundo.
   - Ahora: mientras `statsLoading && !stats`, muestra 3 placeholders animados con `animate-pulse` + el mensaje *"Cargando configuración activa desde base de datos…"*. Solo cuando llega la primera respuesta de `/api/admin/bot/stats` se pintan las 3 ModeTarjeta con el modo activo real.

**Rama:** `feat/fase-16-6-hotfix-ui-3` (desde main, 2 commits atómicos: backend endpoint+tipo, frontend onSelectMode+skeleton).

**Validación:** type-check ✓ · lint ✓ (0/0) · **1173/1173 tests verde** (mismo baseline que hotfix #2) · build ✓ (endpoint `/api/admin/bot/mode` listado en el build manifest).

**Lo que David puede hacer ya en producción (después del merge + deploy):**
- Cambiar de modo en `/admin` → tab "Bot" → sección "Modo Global del Bot" → click en la tarjeta. El cambio se persiste en `system_settings.bot_global_mode` antes de que el botón vuelva a estar disponible. El provider deepseek lo lee en el siguiente turno (caché 30s invalidado en el `setSystemSetting`).
- Si la base de datos no responde, el modo local hace rollback y aparece un toast rojo con el error. La UI nunca queda en estado inconsistente con la SSOT.
- La carga inicial de la pestaña ya no parpadea: skeleton visible hasta que llega `bot_global_mode` real de la DB.

**Riesgo operacional:**
- El caché 30s en `readSystemSetting` se invalida explícitamente al hacer `setSystemSetting(KEY_BOT_GLOBAL_MODE, ...)`, así que el provider ve el cambio en el siguiente turno (no requiere esperar el TTL). Mismo patrón que `bot_paused_global` (M4) y `bot_daily_outbound_limit` (M2).
- El endpoint dedicado es más estricto que el genérico: el set cerrado de 3 valores es defensa en profundidad contra un bug en la UI que mande strings arbitrarios.
- Sin migraciones (no toca schema). El endpoint vive en `/api/admin/bot/mode` y la SSOT del tipo en `system-settings-server.ts`.

---

## Hotfix #3 (2026-07-08 ~21:00): admin edit confirmed attendee (name/email/phone)

**Cambios:**
- `updateConfirmationFields()` server-side en `confirmations-server.ts`: valida formato (mismas reglas que `updateLeadFields` del CRM — email RFC-lite, phone E.164 via `normalizePhone`, name 1-100), diff contra fila, audit log con before/after JSONB (`action='event_confirmation_edit'`), re-mapea `event_qr_tokens` si cambia email/phone (best-effort — no rompe la op principal si falla).
- `editConfirmationAction()` server action en `_actions.ts`: delega a la lib, `revalidatePath` al éxito.
- `EditConfirmationButton.tsx` client component: modal inline con form (name/email/phone) + Save/Cancel, `useFormState` + `useFormStatus` para feedback de error/éxito en vivo, cierre automático al success. Patrón consistente con el drawer del CRM global.
- +13 tests en `tests/confirmations-admin-edit-fields.test.mjs` cubriendo validación, diff, audit, errores DB, re-mapeo QR, confirmation not found.

**Rama:** `fix/eventos-confirmados-edit-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-confirmados`). Mergeado a main después de "rama principal" de David.

**Validación:** type-check ✓ · lint ✓ · **726/726 tests verde** (713 + 13 nuevos) · build ✓.

**Lo que David puede hacer ya en producción:**
- Ir a `/admin/eventos/[id]?tab=confirmations` → cada fila de confirmado tiene botón "✏️ Editar" → click → modal con form → save.
- Placeholders heredados del bug del bot ("WhatsApp Lead", emails `wa.xxx@placeholder.local`) se identifican fácil y se corrigen en sitio.
- Cada save registra `event_confirmation_edit` en `admin_audit_log` con `before/after` + `metadata.fields_changed` + `metadata.eventId`.
- Si cambia el email/phone, el QR token asociado se re-mapea automáticamente (best-effort) — "Reenviar email" usa los datos nuevos sin re-generar el token.

---

## Feature previa (2026-07-08 ~19:30, mergeada en hotfix #1+#2): admin edit lead fields + bot order-independent

Sesión David pidió: (a) editar los 4 leads "WhatsApp Lead" legacy desde el drawer del CRM (placeholders del bug del bot, ej. `36249ecd` Yesy087, `646bc08f` UK, `a5360d1c`, `fe8ff672`), (b) hacer el bot más inteligente con orden-independiente de nombre+email.

**Feature 1 — Admin edit lead fields (commit `997378f`):**
- `updateLeadFields()` server-side con validación (email RFC-lite, phone E.164, name 1-100), diff contra fila actual (solo persiste lo que cambió), audit log JSONB con before/after snapshots (`action='lead_field_edit'`).
- `PATCH /api/admin/leads/[id]` extendido: acepta status Y/O name/email/phone en cualquier combinación.
- `patchLeadFields()` en ops-client.ts.
- `LeadDetailDrawer`: toggle view/edit inline en "Datos de contacto". Form con 3 inputs + Save/Cancel + optimistic update + rollback. Badge amber "placeholder" en valores heredados del bug (WhatsApp Lead, wa.xxx@placeholder.local) para que David los identifique de un vistazo.
- +15 tests unitarios en `tests/leads-admin-edit-fields.test.mjs`.

**Feature 2 — Bot order-independent name+email (commit `dfb2f8b`):**
- Helper exportado `extractNameAndEmailTogether()`: detecta "nombre + email juntos" en cualquier orden, con/sin coma, múltiples emails (toma primero, limpia resto del nombre).
- Override en `processInboundMessage` catchall: si matchea, fuerza intent=`provide_name` antes que `detectIntent` (que mandaría a welcome/question). El handler `provide_name` ya tenía implicit email capture (FIX 2026-07-07), así que ahora ejecuta update email + generateQrToken + sendEventQrPassEmail + createConfirmation en el mismo turno.
- Casos cubiertos: "Sitlalic Guzmán ramos sitlalic.guzman@uabc.edu.mx" (3 palabras + email) → ambos en 1 turno. "david@x.com David Esparza" (email antes) → ambos en 1 turno. "David david@x.com" (1 palabra) → null (necesita apellido, manejado por otro path).
- +17 tests en `tests/whatsapp-bot-order-independent.test.mjs`.
- `--experimental-test-module-mocks` agregado a `npm test` (Node 22) para que tests puedan mockear módulos ES.

**Rama:** `fix/leads-admin-edit-fields-2026-07-08` (en worktree `C:\Users\User\Documents\Click-fix-leads-edit`). **Mergeada a main** (`1d24561`) → auto-deploy Vercel disparado (`dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY).

**Validación:** type-check ✓ · lint ✓ · 713/713 tests verde (681 anteriores + 15 leads-edit + 17 bot-order) · build ✓ (55+ rutas SSG/SSR).

---

## 🏷️ Release point actual: v0.9.0 (CRM Inteligente v2.0)

**Tag Git de respaldo (HEAD estable):** *(se crea en commit de cierre de gobierno — apunta al commit `ec9eb55`)*
**Commits relevantes en `main`:**
- (HEAD actual: 1d24561 — merge de leads-admin-edit-fields; el merge de eventos-confirmados-edit está pendiente)

**Branch:** `main` (deployado en Vercel)
**Handoff canónico:** `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` ← **leer primero para contexto completo del release**

### Puntos de respaldo (Rollback Tags) disponibles

| Tag | Estado | Devuelve a | Notas |

### Hotfixes mergeados a main este sprint (2026-07-08)

| Commit | Descripción | Branch origen | Vercel deploy |
| --- | --- | --- | --- |
| `1d24561` | Merge fix/leads-admin-edit-fields (admin edit leads + bot order-independent) | `fix/leads-admin-edit-fields-2026-07-08` | `dpl_8PdQHmtctZuDtwsx4FNdfeBrKGEs` READY |
| (pendiente) | Merge fix/eventos-confirmados-edit (edit confirmado en vista Confirmados) | `fix/eventos-confirmados-edit-2026-07-08` | (disparándose) |
| `ce22647` | Merge fix/whatsapp-bot-register-intercept (hotfix #2: register sin nombre + verbos coloquiales) | `fix/whatsapp-bot-register-intercept-2026-07-08` | READY |
| `88e39f7` | Merge fix/whatsapp-bot-name-capture (hotfix #1: saludo + captura nombre) | `fix/whatsapp-bot-name-capture-2026-07-08` | READY |
| `dc74db1` | fix(admin/events): propagar format/streaming/eventRules al POST | (directo) | READY |

### Entorno

- **Producción:** `qlick.digital` / `www.qlick.digital` (Vercel) — auto-deploy en cada push a `main`.
- **Branch alias:** `qlick-git-main-david17891-9351s-projects.vercel.app` (preview del HEAD de main).
- **Supabase:** project `ugpejblymtbwtsoiykyj` (región: aws-us-east-1, plan Free).
- **WhatsApp Business API:** Meta Cloud API. Webhook validando con `WHATSAPP_WEBHOOK_SECRET` (HMAC SHA-256).
- **Email transaccional:** Brevo (sender `noreply@qlick.digital`).
- **Cron jobs Vercel:** 1/día max (Hobby plan): `0 8 * * *` event-reminders, `0 3 * * *` cleanup-qr-tokens, `0 5 * * *` survey-reminders.

### Tests status

**Total actual: 726/726 verde.**
- 110 tests base pre-Fase-7b.
- +32 tests de la sesión 2026-07-08 (15 leads-admin-edit + 17 bot-order-independent + 13 confirmations-admin-edit).
- 583 tests restantes (CRM, eventos, payments, AI agent, QR tokens, etc).

### Decisiones recientes (ADRs en `docs/DECISIONS.md`)

- D-018: Admin client con service role (bypass RLS). actorEmail registrado en audit log.
- D-019 (implícito): confirmation fields edit via server action, re-mapeo QR token best-effort.
- D-020 (implícito): bot order-independent via helper puro + override en processInboundMessage catchall (no LLM intervene).

## 🆕 Fase 1 — Pagos Stripe (integración lista, pendiente deploy)
**Branch:** `feat/pagos-stripe-fase-1` (a crear; no commiteado aún al cierre de esta sesión).
**Handoff planeado:** `docs/HANDOFF_v1.0_STRIPE.md` (post-deploy).

### Schema

| Migration | Cambio | Estado en Supabase |
|---|---|---|
| `20260707100000_event_access.sql` | Tabla `event_access` (espejo de `course_access` para eventos) con RLS `event_access_owner_select` + `event_access_admin_all` (patrón inline `(auth.jwt()->>'app_role') in ('admin','instructor')`). | ✅ Aplicada |
| `20260707110000_payments_course_id_nullable.sql` | `payments.course_id` → NULL (pagos de eventos/masterclass quedan vinculados vía `event_access.payment_id`). | ✅ Aplicada |

> El archivo `20260707100000_event_access.sql` en repo fue sincronizado con el patrón real del repo (corregido de un `public.is_admin()` que no existe a inline `(auth.jwt() ->> 'app_role')` + `coalesce(..., false)` + `to authenticated`).

### Código nuevo

| Archivo | Propósito |
|---|---|
| `src/app/api/payments/create-checkout/route.ts` | Endpoint POST server-side que resuelve el curso por slug, valida auth + `checkCourseAccess`, llama `getPaymentProvider().createCheckout(productRef)`, devuelve `{ flow, redirectUrl, paymentId, ... }`. Idempotente: 409 con `alreadyPaid: true` si ya pagó. |
| `src/app/pagar/[courseSlug]/CheckoutButton.tsx` | Client component que reemplaza al SimulatorForm cuando `NEXT_PUBLIC_PAYMENT_PROVIDER !== 'mock'`. Selector card/oxxo/spei + botón "Pagar ahora" que postea a create-checkout y redirige a Stripe Checkout hosted. |
| `src/app/pagar/[courseSlug]/exito/page.tsx` | Server component que lee `?session_id=XXX`, llama `provider.getStatus()`, verifica `checkCourseAccess` (webhook pudo ya haber corrido), muestra feedback aprobado/pendiente/rechazado según estado. |

### Código modificado

| Archivo | Cambio |
|---|---|
| `src/app/pagar/[courseSlug]/page.tsx` | Branching según `NEXT_PUBLIC_PAYMENT_PROVIDER`: `mock` → SimulatorForm (dev-only), `stripe`/otros → CheckoutButton. Banner de "Pago cancelado" si `?cancelled=1`. **Sigue sin llamar a `checkCourseAccess()` en render** (workaround heredado de 2026-06-26 que evita el render vacío en browser). |
| `src/app/api/webhooks/stripe/route.ts` | Removidos 3 `@ts-ignore` obsoletos sobre `payments.course_id` (el typegen local ya dice nullable desde migración previa). Quedan solo los `@ts-ignore` de `event_access` (la tabla no está en el typegen aún). |

### Tests nuevos

- `tests/payments-registry.test.mjs` (+14 tests, **583/583 verde**): cubre `getActivePaymentProviderName`, `getPaymentProvider`, `listPaymentProviders`, `applyCoupon` (5 escenarios de cupones), y `mockProvider.createCheckout` con `card`/`oxxo`/free.

### Lo que falta para deploy

1. **Pegar `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`** en `.env.local` (David) y Vercel env vars (production).
2. **Setear `NEXT_PUBLIC_PAYMENT_PROVIDER=stripe`** en Vercel (preview + production) para activar el flujo real. Mantener `mock` en dev local.
3. **Registrar webhook endpoint** en Stripe Dashboard: `https://qlick.digital/api/webhooks/stripe` con eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
4. **E2E con test cards** (4242 4242 4242 4242, 4000 0000 0000 9995, 0341) contra un evento publicado → verificar que `course_access` (cursos) o `event_access` (eventos) se crea vía webhook.
5. **Actualizar docs/STATUS.md y CHANGELOG.md** post-deploy con tag `v1.0-stripe-real`.

---

## 🌐 Deploy activo (sin cambios)

| Campo | Valor |
|---|---|
| **Dominio** | `https://www.qlick.digital` (apex redirect www→apex en Vercel) |
| **Dominio Vercel (auto)** | `qlick-three.vercel.app` (legacy, sigue activo) |
| **Branch** | `main` |
| **Último push** | `dc74db1` *(hotfix post-v0.9.0 — propagación de campos nuevos en POST /api/admin/events)* |
| **Commits ahead of origin** | **0** — working tree clean post-hotfix |
| **Build status** | ✅ READY + PROMOTED + aliasAssigned (deployment `qlick-ntjo2dm7i`, 44s) |

### Dominio `qlick.digital` (sin cambios desde sesión 2026-07-02)

- Comprado en Hostinger, renovación $55/yr (considerar migrar a Cloudflare Registrar en 2027-06).
- DNS delegado a Cloudflare, Vercel + SSL OK.
- Email Routing (Brevo + Cloudflare MX) operacional con remitente verificado.

---

## 🔐 Env vars en Vercel (production + preview)

Sin cambios desde v0.8.0. Las env vars críticas del CRM (no nuevas en este release, solo expuestas correctamente a los nuevos endpoints) son las mismas:

| Key relevante | Tipo | Notas |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | plain | `https://qlick-three.vercel.app` |
| `SUPABASE_SECRET_KEY` | sensitive | service role para server libs del CRM (admin only) |
| `ADMIN_EMAIL_ALLOWLIST` | sensitive | gatea `requireAdmin()` en `/api/admin/crm/*` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | sensitive | ya seteadas |

> Los nuevos endpoints `/api/admin/crm/{overview,conversations,ai-suggestions}` usan el cliente Supabase server-side con el JWT del admin en sesión, así que **no requieren env vars nuevas**.

---

## ✅ Lo que funciona end-to-end (production)

### Core v0.9.0: CRM Inteligente v2.0 (NUEVO en este release)

#### Compliance Legal (Fase 1)

| Feature | Estado | Verificación |
|---|---|---|
| **Soft delete (`archiveLead`)** | ✅ | Borrado físico **bloqueado** en código; solo `status='archived'` |
| **Optimistic locking (bulk + individual)** | ✅ | `WHERE status = prevStatus` en `bulkArchiveLeads`, `archiveOneLead`, `bulkUpdateStatus` |
| **Export CSV streaming chunked** | ✅ | `ReadableStream` + `.range(0, 999)` recursivo + BOM UTF-8 (`\uFEFF`) + tope 100k filas |
| **Filtro default `consent_to_contact=true`** | ✅ | CSV exportable sin consentimiento = 0 filas (privacidad por default) |
| **Confirmación textual "ARCHIVAR N"** | ✅ | Guard en UI antes de disparar server action |

#### Inteligencia Comercial (Fase 2)

| Feature | Estado | Verificación |
|---|---|---|
| **Conversaciones reales del bot** | ✅ | `listRealConversations()` une `lead_whatsapp_conversations` + `lead_interactions` con fallback por phone |
| **Lead Velocity Rate (LVR)** | ✅ | `(leads_7d - leads_7d_prev) / leads_7d_prev * 100`, edge case prev=0 → 100% |
| **Radar SLA Overdue (>48h)** | ✅ | Leads `new\|contacted` con `MAX(updated_at, last_interaction) > 48h` Y sin `crm_tasks.done=false` |
| **Distribución de Calor (Hot/Warm/Cold)** | ✅ | Buckets por score (≥60 hot, ≥40 warm, resto cold) |
| **PipelineCard con badges 🔥 + ⚠️** | ✅ | Bordes cálidos para leads hot desatendidos |

#### Agente IA de Ventas (Fase 3)

| Feature | Estado | Verificación |
|---|---|---|
| **Templates dinámicos por score** | ✅ | 3 plantillas (close / value / reactivate) seleccionadas según score + survey |
| **Links `wa.me` pre-armados** | ✅ | `buildWhatsAppLink(phone, message)` con encoding RFC 3986 |
| **Endpoint `/api/admin/crm/ai-suggestions?leadId=X`** | ✅ | Rate limit 30/min, lee lead + `event_surveys`, delega a templates puros |

### Core pre-v0.9.0 (sin cambios)

Ver `docs/HANDOFF_v0.8.0_FUNCIONAL.md` para el detalle completo del wizard WhatsApp + Español MX. Resumen:

- Wizard Q1→Q2→Q3→q_consent→q_business→thank-you (intactos)
- Admin panel `/admin/eventos/[id]` con tabs (Encuestas, Leads promovidos, Pipeline, Resumen)
- Login OAuth Google + magic link, dualidad admin/student
- WhatsApp Cloud API inbound + outbound (texto libre + wizard thank-you)
- Persistencia conversaciones en `lead_whatsapp_conversations` + `lead_interactions`

---

## ⚠️ Lo que funciona pero sigue siendo DEMO (no real)

| Sección CRM | Estado | Por qué | Plan |
|---|---|---|---|
| **Calendario / Citas** | 🟡 Demo | Lee `src/lib/data/crm-data.ts`. No hay Google Calendar integration. | **Fase 4** (con tareas + notificaciones) |
| **Sales Owners** | 🟡 Demo | Asignación de leads sigue siendo ficticia. | **Fase 4** (asignación real + notificaciones) |
| **Broadcast WhatsApp** | 🟡 Demo | Genera lista de `wa.me` pre-armados pero no envía masivo. | Out of scope (requiere templates Meta aprobados) |
| **Concurrencia en tabla de leads UI** | 🟡 Frontend carga todo | La tabla de leads en `CRMView.tsx` carga toda la lista en memoria (sin paginación server-side) | **Fase 4** (cursor pagination) |

| Feature | Estado | Por qué | Plan |
|---|---|---|---|
| **Agente IA (escalado LLM)** | 🟢 Real con switch | DeepSeek V4-Flash (default) + V4-Pro con heurística de escalado | sin cambios |
| **Conversaciones + Inteligência + IA** | 🟢 **REAL** (este release) | Lee Supabase real + cálculo server-side + templates puros | **mantener** |

---

## 🗄️ Database (Supabase `ugpejblymtbwtsoiykyj`)

**Camino de DDL desde Mavis: Management API** (`scripts/apply-migration-management.mjs`). Pooler (`pg` + 6543) y host directo (`db.{ref}.supabase.co:5432`) están rotos (ENOTFOUND/28P01). Ver `docs/AGENT_SUPABASE_PROTOCOL.md` §11 para el flujo canónico.

~24 tablas en `public`. Sin cambios de schema en v0.9.0 (todo es a nivel de `src/lib` + presentación).

Tablas que el CRM Inteligente v2.0 lee intensivamente:
- `leads` — score, qualification, consent_to_contact, last_contacted_at, last_interaction_at
- `lead_whatsapp_conversations` — log inbound/outbound del bot (timestamp, body, direction)
- `lead_interactions` — interacciones manuales del admin (timestamp, kind, notes)
- `lead_event_links` — UNIQUE(link_type, link_id), INSERT-only
- `event_surveys` — respuestas del wizard en JSONB (q1_clarity, q_consent, q_business, etc.)
- `lead_consent_log` — auditoría de consentimientos (LFPDPPP/LGPD compliance)

Detalle completo de schema en `docs/DB_AUDIT_2026-06-30.md` + migrations en `supabase/migrations/`.

---

## 📱 WhatsApp Cloud API — Estado actual (sin cambios)

- **Inbound:** ✅ funcional (webhook + signature verification + bot engine)
- **Outbound:** ✅ funcional (texto libre + wizard thank-you)
- **Bot engine (`bot-engine.ts`):** ✅ **NO MODIFICADO** por este release (política de aislamiento verificada con `git diff v1.1-crm1-stable HEAD`)

---

## 🐛 Issues activos (post-v0.9.0)

### Cerrados en este release

- ~~I-1 (parcial): CRM híbrido tab Conversaciones en demo~~ → **CERRADO**: ahora `listRealConversations()` lee DB real.
- I-2 (CRM híbrido): restantes Calendario + Broadcast siguen demo — **Fase 4**.

### Pendientes (no bloquean, son Fase 4+)

Ver `docs/OPEN_ITEMS.md` + sección **Fase 4** en `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md`:

- **Paginación server-side en tabla de leads UI** (>5k leads saturando navegador)
- **Refactor nombre leads**: separar `name` en `first_name` + `last_name` (resuelve `firstName()` frágil)
- **Calendario real** (Google Calendar integration) + tareas CRM con notificaciones
- **Alertas proactivas SLA**: notificaciones salientes (Email / Slack) cuando un lead entra a SLA Overdue
- **G-5 (Meta templates)** — necesarias para outreach proactivo. Bloqueada por aprobación Meta.
- **G-12, G-17** — intermitencias heredadas, fuera del scope de este release.

---

## 🧪 Cómo verificar (para próxima sesión)

```bash
# 1. Suite verde + audit script
npm run type-check && npm run lint && npm test && npm run build
# → 545/545 ✓, lint ✓, type-check ✓, build ✓

# 2. Audit E2E contra DB real (18 aserciones)
node scratch/qlick-crm-ai-audit.mjs
# → 18 OK / 0 FAIL (I1 conversaciones, I2 LVR/SLA/Heat, I3 AI wa.me, I4 bot intacto)

# 3. CRM conectado en /admin/eventos/[id]
# Login con david17891@gmail.com → /admin/eventos/[id]
# → Tab Conversaciones muestra mensajes reales de WhatsApp
# → Header con badges 🔥 HOT en leads score≥60
# → Cajón del lead → "Acciones Recomendadas" muestra 3 sugerencias IA con link wa.me

# 4. Export CSV streaming
curl -H "Cookie: sb-*-auth-token=..." "https://qlick.digital/api/admin/crm/leads/export?status=active&consent=true" -o /tmp/crm.csv
# → Stream chunked, primeras 3 líneas son BOM + header + lead
# → wc -l /tmp/crm.csv <= 100000 (tope defensivo)

# 5. Bot sigue funcionalmente íntegro
git diff v1.1-crm1-stable HEAD --stat -- src/lib/whatsapp/bot-engine.ts
# → 328 insertions / 13 deletions (esperado, son features/fixes legítimos del bot)
# → Si querés auditar que NO hay intrusión CRM/campaign:
git diff v1.1-crm1-stable HEAD -- src/lib/whatsapp/bot-engine.ts | grep -E '(leads|crm|bulkArchive|conversations)' || echo OK no CRM leakage
```

---

## 🎟️ Releases previos

| Tag | Descripción | Fecha |
| --- | --- | --- |
| `v0.9.0` *(por crear)* | **ESTE RELEASE** — CRM Inteligente v2.0 (Fases 1+2+3) | 2026-07-06 |
| `v0.8.0` | Wizard WhatsApp funcional + Español MX | 2026-07-06 |
| `v0.6.0-masterclass-funnel-foundation` | Masterclass funnel foundation | 2026-06-XX |
| `v0.5.1-crm-truth-layer` | CRM truth layer | 2026-06-XX |
| `v0.4.1-privacy-deploy-ready` | Privacy + deploy ready | 2026-06-XX |
| `v0.4.0-leads-foundation` | Leads foundation | 2026-06-XX |
| `v0.3.0-supabase-bootstrap` | Supabase bootstrap | 2026-06-XX |
| `v0.2.0-qlick-lms-crm-demo` | LMS + CRM demo | 2026-06-XX |
| `v0.1.0-qlick-lms-demo` | LMS demo | 2026-06-XX |

Detalle completo en `CHANGELOG.md`.

---

## 📚 Docs de referencia

- `docs/HANDOFF_v0.9.2_CERT_EMAIL.md` — **handoff del sprint Cert Email (envío batch + email Brevo + WhatsApp fallback)** ← nuevo, E2E validado
- `docs/HANDOFF_v0.9.1_CERT_CONCEPT_C.md` — handoff del sprint Certificados Concept C (cert HTML imprimible)
- `docs/HANDOFF_v0.9.0_CRM_INTELIGENTE.md` — handoff del release CRM Inteligente v2.0
- `docs/HANDOFF_v0.8.0_FUNCIONAL.md` — handoff previo (wizard WhatsApp + Español MX)
- `docs/HANDOFF_v0.7.1_FASE_7A_REMINDERS.md` — recordatorios evento
- `docs/ROADMAP.md` — fases, decisiones, prioridades (Fase 4 detallada)
- `docs/OPEN_ITEMS.md` — deuda técnica append-only con severidades
- `CHANGELOG.md` — release notes consolidadas (Keep a Changelog en español)
- `data/PROJECT-LOG.md` — registro append-only de cambios puntuales
- `docs/CRM_MODE_STATUS.md` — qué parte del CRM es real vs demo (actualizado: solo Calendario + Broadcast)
- `scratch/qlick-crm-ai-audit.mjs` — script de auditoría E2E (18 aserciones)
- `docs/EVENTS_ADMIN_GUIDE.md` — manual operativo del panel admin
- `docs/VERCEL_ENV_SETUP.md` — setup de env vars en Vercel
- `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` — setup inicial de Supabase
- `docs/GITHUB_WORKFLOW.md` — convenciones de branch + commit + PR

---

## Sprint cierre-eventos-virtuales (2026-07-11 10:30 — 11:50 Phoenix)

**Motivación:** cerrar el ciclo "confirmado → asistencia real" en eventos Zoom/virtuales/hybrid. Antes del sprint, los confirmados que solo respondían la Q0 de la encuesta post-evento por email/WhatsApp (sin haber abierto el gate virtual ni escaneado el QR) NO quedaban como asistentes en el funnel. El CRM tampoco reflejaba la asistencia.

### Commits mergeados a main (5 commits + 2 hotfixes)

| SHA | Mensaje | Archivos |
|---|---|---|
| `bd5a27d` | `feat(eventos): agregar envio de link de encuesta post-evento y lookup de respuestas` | 5 nuevos (template email, orquestador, mensaje WhatsApp, botón, helper) |
| `ba461ba` | `merge: feat/certificados-concept-c into feat/survey-link-confirmations` | merge de certs v0.9.2 |
| `8d39437` | `test: add tests for send-survey-link-confirmations` | 1 test nuevo (194 líneas) |
| `1e97849` | `fix(eventos): upsert attendee + promote lead en Q0 attendance check` | 6 archivos (1 migration + helper + types + server) |
| `6f2a294` | `merge: cierre-eventos-virtuales UPSERT attendee + promote lead` | merge a main |
| `089300f` | `docs(log): entrada sprint cierre-eventos-virtuales UPSERT + promote lead` | PROJECT-LOG |
| `827b32b` | `fix(email): voseo -> tutéo en template survey-invite` | 1 archivo (5 strings) |
| `d858f9c` | `fix(copy): voseo -> tutéo en todos los copy visibles al cliente (audit completo)` | 10 archivos + 2 scripts |

### Fix aplicado: UPSERT attendee + promote lead (`surveys-server.ts:295-494`)

**Gap #1 (CRÍTICO):** cuando el confirmado respondía Q0=Yes por email, el lead NO se promovía a `event_attended` en el CRM.

**Gap #2 (CRÍTICO):** si el confirmado NUNCA había abierto el gate virtual NI escaneado el QR (camino email-only), el UPDATE sobre `event_attendees` no aplicaba → `checked_in_at` quedaba NULL → el funnel NO lo contaba.

**Fix:** el bloque ahora hace UPSERT en lugar de UPDATE. Si no existe row con `(event_id, email)` o `(event_id, phone_normalized)`, crea uno al vuelo con `source='survey_attended'` (nuevo valor del enum, ver migration abajo) + `checked_in_at=now()`. Si el row ya existía (gate click o check-in previo), preserva el `source` original y solo actualiza `checked_in_at` (idempotente). Race condition con UNIQUE constraint manejada: si `23505` (unique violation) entre el lookup y el INSERT, re-lee el row ganador y hace UPDATE.

Después del UPSERT, busca el lead por email o phone, y si existe + no está en `event_attended` ni cerrado (`lost`/`archived`), UPDATE leads SET `status='event_attended'`, `tags+=[event:{slug}:attended]`, `last_contacted_at=now()`. Mismo patrón que `api/check-in/route.ts:409-437`.

### Refactor: helper puro `detectAttendanceCheck`

La decisión booleana "el confirmado respondió Sí en la Q0" se extrajo de `surveys-server.ts:271-340` a un helper puro en `src/lib/events/survey-attendance-check.ts`. Razón: poder testearla sin mockear Supabase. 10 tests unitarios en `tests/survey-attendance-check.test.mjs` (sin Q0, con Q0, edge cases, score negativo).

### Migration aplicada por David

`supabase/migrations/20260711100000_event_attendee_source_survey_attended.sql` — `ALTER TYPE event_attendee_source ADD VALUE 'survey_attended'`. Aplicada en Supabase antes del merge.

### Audit de voseo (completado en 2 commits)

David detectó conjugaciones voseantes argentinas en el template `survey-invite.ts` (Tardás, decinos, copiá, pegá). El audit se extendió a TODO el copy visible al cliente (212 archivos: `src/lib/email/templates`, `src/lib/whatsapp`, `src/lib/contact`, `src/components`, `src/app`).

**Resultado:** 17 voseos reales corregidos en 11 archivos (4 del email + 13 en otros). Falsos positivos documentados: regex detectors de input del usuario, "deja" tuteo sin tilde, "parámetros" sustantivo.

**Nuevo script:** `scripts/_audit-voseo-templates.mjs` — escanea verbos voseantes (presente + imperativo), pronombres ("vos"), muletillas rioplatenses. Allowlist para falsos positivos conocidos. Exit 0 = cero voseo, exit 1 = lista de matches.

### Validación (corro yo mismo, no me fío del reporte)

| Check | Resultado |
|---|---|
| `npm run type-check` | ✓ 0 errores |
| `npm run lint` | ✓ 0 warnings, 0 errors |
| `npm test` | ✓ **1066/1066 pass** (de 1056 → +10 del nuevo helper; voseo no rompió tests) |
| `npm run build` | ✓ compila, todas las rutas SSG/SSR |
| `node scripts/_audit-voseo-templates.mjs` | ✓ 209/212 archivos limpios, 3 falsos positivos documentados |
| `node scripts/_preview-survey-invite-email.mjs` | ✓ genera `scratch/email-survey-invite-preview.html` |

### Estado del ciclo "confirmado → asistencia real"

**Antes del sprint:**
- Confirmado email-only → `checked_in_at` NULL, no contaba como asistente, lead no avanzaba en CRM.

**Después del sprint:**
- Confirmado email-only → `event_attendees` con `source='survey_attended'` + `checked_in_at=now()`, lead promovido a `event_attended` con tag.
- Confirmado con gate click previo → solo `checked_in_at` (source preservado, idempotente).
- Confirmado con check-in presencial previo → solo `checked_in_at` (source preservado, idempotente).
- Si lead ya en `event_attended` o cerrado → no-op (idempotente + respeta manual).

### Lo que NO está automatizado (deuda viva)

1. **Cron de recordatorio automático a no-respondieron** (24/48h post-evento) — requiere Cloudflare Workers / Supabase pg_cron (Vercel Hobby limita a 1/día). Hoy el admin tiene que mandar manual via `SendSurveyLinkButton`.
2. **Importador de Zoom Attendee Report** (CSV nativo) — el camino más "duro" para asistencia Zoom. Hoy depende del survey email.
3. **Modal detalle del envío** (Gap #3) — el botón actual no muestra los `wa.me` pre-armados para confirmados con phone sin email. David los tiene que copiar del log o reconstruir.

### Trazabilidad

- `data/PROJECT-LOG.md` entrada `2026-07-11 ~10:40 — Sprint cierre-eventos-virtuales: UPSERT attendee + promote lead en Q0` + entrada implícita del audit voseo.
- `docs/ROADMAP.md` actualizado con el sprint (verificar entrada en próxima pasada).
- `docs/OPEN_ITEMS.md` gaps a cerrar (verificar).
- `MEMORY.md` (Mavis global) sección "Voseo/vos en emails visibles al cliente final (HOT, 2026-07-11)" con la regla endurecida.

## Sprint security G-18 — RLS en ot_usage_daily (2026-07-14 14:00 → 14:35)

**Trigger:** email CRITICAL de Supabase notificando 
ls_disabled_in_public en
ot_usage_daily. Diagnóstico confirmó que SOLO esta tabla de las 27 en
public estaba sin RLS (escrita por 
ecordDeepseekUsage en
src/lib/ai/deepseek-cost.ts y leída por /api/admin/bot/stats/route.ts).

**Fix aplicado (commit 95a7398):**
- Migration 20260714140000_rls_bot_usage_daily.sql: ENABLE ROW LEVEL
  SECURITY + 2 policies USING(false) WITH CHECK(false) para roles
  non y uthenticated. NO policy para service_role (bypassa RLS por
  diseño).
- 4 scripts de verificación: erify-rls-bot-usage-daily.mjs,
  	est-service-role-write.mjs, check-bot-usage-checks.mjs,
  check-bot-usage-write.mjs.

**Verificación end-to-end (post-aplicación):**
- pg_class.relrowsecurity = true en ot_usage_daily.
- 2 policies creadas (ot_usage_daily_block_anon,
  ot_usage_daily_block_authenticated).
- service_role: INSERT 201 + SELECT 200 + DELETE 204. Backend intacto.
- anon: SELECT 200 con array vacío. Bloqueado.
- 1365/1365 tests verde. Push OK a origin/main.

**Lección operativa:** "Cuando Supabase envía email CRITICAL de RLS, el camino
canónico es: (1) audit-script para confirmar que SOLO esa tabla está
afectada, (2) migration ENABLE RLS + policies USING(false) WITH CHECK(false)
para roles no service_role, (3) verificar que el backend sigue funcionando
con service_role. El CHECK constraint del modelo (model IN ('deepseek-chat',
'deepseek-reasoner')) fue surprise en la primera pasada — validar schema
con information_schema.columns + pg_constraint antes de culpar al fix."

### Trazabilidad

- data/PROJECT-LOG.md entrada 2026-07-14 ~14:30 — Sprint security: RLS en
  bot_usage_daily (G-18).
- docs/OPEN_ITEMS.md: G-18 nuevo en sección Críticos, ya cerrado.
  Resumen actualizado a 14 gaps cerrados.
- Migration supabase/migrations/20260714140000_rls_bot_usage_daily.sql
  aplicada via Management API.

## 2026-08-11 — Reparación de captura nombre → email en human_first

- Se corrigió el caso observado en producción donde, después de capturar
  `David Martinez`, el bot volvía a pedir el nombre al recibir el correo.
- El motor ahora recupera únicamente el mensaje exacto de nombre del historial
  cuando fue seguido por un outbound que esperaba el email; no usa perfil de
  Meta, ubicaciones ni frases comerciales como nombre.
- El paso posterior para eventos pagados ya no promete QR antes del pago: indica
  que se compartirá el enlace de pago/apartado y que el QR se envía al verificarlo.
- Validación: 68/68 pruebas de captura de nombre, pruebas de pagos enfocadas,
  type-check, lint y build correctos.
- Deploy selectivo Vercel `BcJCn1HP492onXo1ws3hAoWAeW3o` (`READY`) en proyecto
  `qlick`; `qlick.digital` redirige a `www.qlick.digital` y ambos responden 200.

## 2026-08-11 — Atención manual prioritaria de prospecto

- El modo global se revirtió a `super_executive_v2` por decisión operativa.
- Se verificó un registro de evento en `payment_pending`, sin pagos y sin QR
  activo; el QR revocado se conserva como histórico.
- Se normalizó el nombre capturado y se envió un aviso transaccional con el
  enlace oficial de apartado de $500 MXN. Meta reportó el mensaje como
  `delivered`.
- El registro se completará y el QR se habilitará automáticamente cuando el
  webhook confirme el pago/apartado.

## 2026-08-11 — Auditoría y reparación de secuencia de captura

- La conversación de Cindy mostró que el primer nombre (`Cindy Jiménez`) se
  clasificaba como pregunta porque el outbound anterior no persistía el campo
  esperado; por eso el correo siguiente volvió a disparar la solicitud de
  nombre. También se detectó una promesa incorrecta de QR antes de pago y el
  cierre prematuro del seguimiento comercial en `payment_pending`.
- El motor ahora recupera el campo esperado desde el último mensaje saliente,
  reconoce la solicitud combinada de nombre + correo y solo cierra el
  seguimiento cuando la confirmación está realmente pagada, apartada o es
  gratuita. Los pendientes permanecen elegibles para seguimiento.
- Se corrigió el lead real afectado: conserva `payment_pending` y
  `name:user_verified`, sin la etiqueta contradictoria `registration:complete`.
- Validación: 79/79 pruebas focalizadas, type-check, lint y build correctos.
- Deploy selectivo posterior `dpl_CmM1oKPpthKqunUh1udcKNV2haBJ` en Vercel
  `qlick`, con smoke 200 en
  `www.qlick.digital`; el modo global continúa en `super_executive_v2`.

## 2026-08-12 — Reparación Armando: aislamiento evento/servicio

- Incidente reproducido: Armando Salazar entregó nombre y correo, pero un
  interés histórico en servicios (`kickstart-meta-ads`) forzó el turno a
  `question`; no se creó la confirmación y el follow-up volvió a pedir nombre.
- El motor ahora da prioridad al contexto explícito del evento sobre intereses
  históricos de servicios. La confirmación del evento ya no depende de que se
  haya generado un QR previamente.
- Se reparó el registro real sin emitir QR: `payment_pending`, pago pendiente,
  prioridad de 24 horas y seguimiento orientado a pago. El modo global sigue
  siendo `super_executive_v2`.
- Validación: 164/164 pruebas focalizadas, type-check, lint y build correctos.
  La suite completa quedó en 1697/1707; los 10 fallos restantes son pruebas
  históricas conocidas fuera de este incidente.
- Publicación selectiva en el proyecto Vercel `qlick`; smoke 308 canónico en
  `qlick.digital` y 200 en `www.qlick.digital`.

## 2026-08-13 — Reparación definitiva del bucle de nombre

- Incidente reproducido: después de capturar nombre y correo, una actualización
  concurrente podía conservar el nombre pero perder `name:user_verified`;
  el siguiente turno volvía a pedir el nombre.
- El motor ahora rehidrata el nombre desde el turno exacto de captura cuando el
  historial muestra que ya se respondió el nombre, y persiste atómicamente
  `name_status=user_verified`, etiqueta y origen. No confía en el nombre de
  perfil ni en texto comercial.
- Deploy selectivo en Vercel `dpl_8xFDu9U3jaSNEdbPiDWiWmVjdxo6`; build remoto
  verde. Smoke: `www.qlick.digital` 200 y cron sin credencial 401.
- Validación: prueba focalizada de captura 72/72, type-check y lint correctos.

## 2026-08-13 — Reparación del scheduler de seguimiento

- El workflow de GitHub Actions estaba enviando `LEAD_FOLLOWUP_CRON_SECRET`,
  pero la ruta validaba por error `CRON_SECRET`; cada ejecución terminaba en
  `401 Unauthorized` antes de procesar cualquier lead.
- La ruta ahora usa validación estricta con `LEAD_FOLLOWUP_CRON_SECRET` y
  permanece cerrada si falta la credencial.
- Deploy selectivo `dpl_8EDo27mEcFkCh6zmWXkbDWYcAad4`; build remoto verde.
  Smoke: sitio 200 y `/api/cron/lead-followup` sin credencial 401.

## 2026-08-13 — Respuesta contextual al recordatorio de pago

- Incidente reproducido en producción: el follow-up preguntó si debía explicar
  cómo apartar; ante `explícame`, el motor cayó en `question` y el modelo volvió
  a describir el taller en lugar de explicar el pago.
- El motor ahora conserva el dominio `payment_pending` y responde de forma
  determinista con pasos de apartado, monto, saldo y enlace oficial. Si falta
  una confirmación histórica, usa el enlace genérico del evento sin inventar un
  registro ni confirmar acceso.
- Deploy selectivo `dpl_8XAzuFygH8oWoiiRGbX91Z4sXYcZ`; build remoto verde.
- Validación: 3/3 pruebas focalizadas, type-check y lint correctos.

## 2026-08-13 — Pregunta de pago después del registro

- Incidente reproducido: después de recibir el enlace de apartado en el mismo
  flujo de registro, `¿Cómo pago?` se clasificaba como escalación humana y el
  bot respondía que un asesor contactaría al prospecto.
- El motor ahora reconoce el enlace oficial del turno anterior y responde con
  los pasos deterministas de apartado. Las incidencias reales (`pagué y no
  aparece`, rechazo, error, reembolso o devolución) conservan el handoff.
- Deploy selectivo `dpl_3m6vUPg4WcpNcQobwHgTaSansFEU`; build remoto verde y
  aliases `qlick.digital`/`www.qlick.digital` activos. Smoke Node: sitio 200,
  cron sin credencial 401.
- Validación: 4/4 pruebas focalizadas, type-check y lint correctos.

## 2026-08-13 — Orden del repositorio y ramas

- Se consolidó el trabajo versionable en `codex/production-hardening-20260813`
  con commits separados para producto, documentación/materiales y Reels
  protegido. La rama tiene upstream en GitHub y no modifica `main`.
- Se retiraron ramas locales/remotas demostrablemente integradas o
  reemplazadas. Se conservaron las ramas y worktrees con trabajo no integrado.
- CSV de contactos movido a `private-data/` ignorado; previews generados y
  paquetes de marca de revisión quedan ignorados.
- Validación del checkout: type-check, lint, build y `audit:voseo` correctos;
  suite completa 1708/1715. Los 7 restantes son escenarios históricos/E2E que
  requieren Supabase/Stripe o fixtures antiguas y quedan como deuda explícita.
## Addendum 2026-08-14 — conciliación OXXO/SPEI y comprobantes de promoción

- Producción desplegada en Vercel: `dpl_8kaPJbZXGQ12ejNmQqLzsP6Dpucp` (`qlick.digital` / `www.qlick.digital`).
- La promoción está restringida en servidor al slug `desarrollo-estructura-curso-canaco`; el checkout normal de una persona permanece disponible.
- El cron de Supabase `event-payment-followups-every-15m` sigue activo y ahora ejecuta primero una reconciliación de sesiones Stripe pendientes. OXXO/SPEI se confirma solo cuando Stripe devuelve `payment_status=paid`; no se otorga QR por crear el voucher.
- Tras el pago/apartado verificado, la orden promocional entrega un QR compartido de dos accesos y envía a cada participante con correo válido: pase QR + comprobante propio Qlick. Stripe también recibe `receipt_email` para su recibo automático.
- Migración aditiva aplicada por Management API: `20260814123000_promo_receipt_email_type.sql`.
- E2E sintética pasada: dos participantes, webhook firmado de apartado $200, dos confirmaciones `partial/confirmed`, QR `max_check_ins=2`, cuatro correos y webhook duplicado sin reenvíos. No creó cargos reales y limpió sus datos.

## 2026-08-14 — Reparación de correo con dominio espaciado

- Se corrigió una inscripción pendiente cuyo correo llegó como
  `usuario@gmail com`: la confirmación y el lead quedaron normalizados, sin
  duplicar registro ni emitir QR antes del pago.
- El extractor compartido repara únicamente proveedores comunes con un espacio
  obvio antes del TLD (`gmail com` → `gmail.com`); dominios empresariales o
  errores ambiguos siguen requiriendo confirmación.
- Aplica al flujo determinista, `human_first`, ciclo de vida y herramienta del
  agente. Producción: `dpl_H8SXo5TuZXgESzVWBykQhGrYYEAE`; aliases activos.
- Validación: 71 pruebas focalizadas, type-check, lint, build y smoke público
  del landing/checkout correctos.
