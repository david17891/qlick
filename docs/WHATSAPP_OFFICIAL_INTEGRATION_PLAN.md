# Plan de integración de WhatsApp oficial — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Estado:** Plan documentado. Sin integración real. El MVP usa click-to-chat
(`wa.me`). Los stubs de la Cloud API y BSP están preparados pero inactivos.

> **No usar métodos no oficiales** (librerías que automatizan la app de WhatsApp,
> "scrapers" de QR, multi-cuenta con números personales). Riesgo de ban de número,
> bloqueo de cuenta y violación de los Términos de WhatsApp. Este plan cubre solo
> la **vía oficial**.

---

## Por qué no basta wa.me (click-to-chat)

`wa.me` abre el chat con un mensaje pre-escrito, pero:

- No envía mensajes salientes automatizados.
- No entrega mensajes entrantes a un sistema.
- No permite plantillas aprobadas ni reportes de entrega.
- No escala a múltiples agentes ni al agente IA.

Para mensajería outbound automatizada, recordatorios de pago y respuestas del
agente IA se necesita la **WhatsApp Business Platform** oficial.

---

## Fases de adopción

### Fase A — Manual (actual) ✅

- `manualWaProvider` (click-to-chat `wa.me`).
- Botones habilitados cuando las env vars `NEXT_PUBLIC_WHATSAPP_*` están definidas.
- El agente IA propone; un humano copia/envía el mensaje desde su WhatsApp.
- **Cero riesgo de ban.** Adecuado mientras hay poco volumen y se valida el flujo.

### Fase B — Cloud API de Meta (recomendada)

WhatsApp Business Cloud API: Meta hostea la API, sin infraestructura propia.

- Completar `metaCloudApiProvider.ts` (hoy stub).
- Crear una **Meta Business App** y un número de WhatsApp Business verificado.
- Implementar `/api/webhooks/whatsapp` con `verify.ts` + `handler.ts`.
- Registrar plantillas (templates) aprobadas por Meta para outbound fuera de la
  ventana de 24h.
- Manejar la **ventana de 24h**: mensajes libres solo dentro de las 24h tras la
  última respuesta del usuario; fuera de ella, solo plantillas aprobadas.
- Opt-in explícito del usuario antes de cualquier mensaje outbound.

### Fase C — BSP (alternativa si se necesita más soporte)

Un Business Solution Provider (360dialog, Twilio, MessageBird, etc.) simplifica
alta, plantillas y facturación a cambio de un margen.

- Completar `bspProvider.ts` (hoy stub).
- Útil si el equipo prefiere no lidiar directo con Meta o quiere soporte local.

> La abstracción `WhatsAppProvider` (D-015) permite cambiar entre manual → Cloud
> API → BSP sin tocar la UI ni el CRM.

---

## Requisitos previos (comunes a B y C)

1. **Número de WhatsApp Business dedicado** (no el personal).
2. **Verificación de negocio** en Meta Business Manager.
3. **Display name** aprobado.
4. **Opt-in del usuario:** el contacto debe aceptar ser contactado por WhatsApp.
   El formulario de `/contacto` ya captura `consentToContact`.
5. **Plantillas aprobadas** para cada intent outbound (sales, payment_reminder,
   follow_up, welcome_student, schedule_call, reactivation).
6. **Aviso de privacidad** publicado.
7. **Cumplimiento:** respetar la ventana de 24h y la política de mensajería de Meta.

---

## Túnel HTTPS local para desarrollo

Los webhooks de Meta exigen una URL pública con HTTPS. Opciones recomendadas:

- **Tailscale Funnel** (preferido): expone el dev server local con HTTPS sin abrir
  puertos ni depender de un túnel de terceros.
- **ngrok / Cloudflare Tunnel**: alternativas válidas; usar solo para desarrollo.

> Nunca exponer el servidor de producción detrás de un túnel temporal. El túnel es
  solo para probar webhooks en desarrollo.

Configuración típica con el dev server en `localhost:3000`:

1. Levantar `npm run dev`.
2. Exponerlo con el túnel elegido → `https://<tu-subdominio>`.
3. Registrar esa URL como webhook en la Meta App (con `WEBHOOK_VERIFY_TOKEN`).
4. Suscribirse a los campos de mensajes.

---

## Riesgos de métodos no oficiales (a evitar)

| Método | Riesgo |
| ------ | ------ |
| Automatizar la app de WhatsApp (Puppeteer/Selenium sobre el web o móvil) | Ban del número, viola Términos, frágil. |
| Librerías "wa-web" no oficiales | Ban, inestabilidad, sin SLA. |
| Reenviar a través de números personales | Mezcla cuenta personal/negocio, ban. |
| Comprar listas de contactos | Spam, viola opt-in, daño reputacional. |

La postura del proyecto: **solo vías oficiales** (Cloud API o BSP). El click-to-chat
actual es seguro porque el envío lo hace un humano desde su propio WhatsApp.

---

## Opt-in y plantillas

- **Opt-in:** registrar `consentToContact` por lead (ya en el formulario). Nunca
  escribir a quien no haya optado in.
- **Plantillas:** redactar y aprobar en Meta antes de usarlas. Una por intent. El
  `WhatsAppSendRequest.templateName`/`templateLanguage` ya está en el contrato.
- **Ventana de 24h:** dentro de ella, texto libre; fuera, solo plantillas.

---

## Mapeo a la abstracción existente

| Concepto oficial | En el código |
| ---------------- | ------------ |
| Cloud API send | `metaCloudApiProvider.send(WhatsAppSendRequest)` |
| Webhook verification | `verifyWebhook()` en `src/lib/whatsapp/webhooks/verify.ts` |
| Mensaje entrante | `handleWebhookPayload()` (handler placeholder) → crea `ConversationMessage` |
| Plantilla aprobada | `templateName` + `templateLanguage` en `WhatsAppSendRequest` |
| Estado activo | `manual_wa` hoy; `meta_cloud_api`/`bsp` cuando se activen |

El handler placeholder aún no crea conversaciones reales: queda para cuando haya
backend (Fase 1) y Cloud API.

---

## Referencias

- `src/lib/whatsapp/` — abstracción y stubs.
- `docs/WHATSAPP_AI_AGENT_STRATEGY.md` — agente IA y mensajería.
- `docs/CONTACT_AND_WHATSAPP_STRATEGY.md` — click-to-chat y env vars.
- `docs/DECISIONS.md` D-015 — abstracción de proveedor de WhatsApp.
- Meta for Developers — WhatsApp Business Platform docs.
