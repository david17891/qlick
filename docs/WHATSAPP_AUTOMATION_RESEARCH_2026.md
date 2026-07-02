# Meta WhatsApp Business — Capacidades de automatización (research 2026-07-01)

## TL;DR

Para Qlick (funnel de cursos/eventos):

1. **Las respuestas del bot dentro de 24h son GRATIS** ("Service conversations"). Es nuestro caso principal y por eso lo construimos así.
2. **Mensajes proactivos (fuera de 24h) requieren templates pre-aprobados** y cuestan por mensaje. Marketing ~$0.025 MXN, Utility ~$0.015 MXN, Authentication ~$0.0135 MXN.
3. **WhatsApp Flows (formularios in-chat)** son gratis dentro de 24h. Útiles para calificación de leads + registro a eventos.
4. **Click-to-WhatsApp Ads abren ventana de 72h gratis.** Si David corre ads de FB/IG, todos los mensajes al lead son gratis por 3 días.
5. **Desde enero 2026, Meta prohíbe "general-purpose AI" (chatbots abiertos).** Solo task-specific agents (atención, ventas, soporte) están permitidos. Nuestro bot de Qlick es task-specific → OK.

## 4 categorías de mensajes (Meta 2026)

| Categoría | Costo MX | Caso de uso Qlick | Estado |
|---|---|---|---|
| **Service** | **GRATIS** | Replies del bot dentro de 24h window | ✅ Ya lo usamos |
| **Utility** | ~$0.015/msg | Confirmaciones de registro, recordatorios de evento, envíos de QR | Por construir |
| **Marketing** | ~$0.025/msg | Newsletters, ofertas, re-engagement de leads inactivos | Por construir |
| **Authentication** | ~$0.0135/msg | OTP para login, 2FA | No aplica a Qlick (no tenemos login por WA) |

## Ventanas gratis (claves para economics)

### 24h Customer Service Window
- Se abre cuando el cliente nos escribe primero
- Replies del bot son **gratis** (incluso utility templates son gratis acá)
- Se resetea con cada nuevo mensaje del cliente
- **Esto es el core de nuestro funnel** — todo el bot opera acá

### 72h Click-to-WhatsApp Ad Window
- Se abre cuando el usuario hace click en un CTWA (Facebook/Instagram ad)
- 72h de mensajes gratis (incluso marketing templates)
- 3x más largo que el window normal → unit economics cambia para paid acquisition

### Reference wa.me / QR codes
- Click en wa.me/QR también abre window (72h en algunos casos)
- Útil para links directos desde email, Instagram bio, etc.

## Pricing (México, 2026)

(Estimado en USD; tarifas reales en https://developers.facebook.com/docs/whatsapp/pricing/)

| Categoría | US | MX (estimado) |
|---|---|---|
| Marketing | $0.025 | ~$0.025-0.05 |
| Utility | $0.005-0.015 | ~$0.015 |
| Authentication | $0.0135 | ~$0.0135 |
| Service | FREE | FREE |

**Cambio importante jul 2025:** Meta movió de per-conversation a per-message para templates. Antes pagabas una "conversation" (24h window) y mandabas todos los templates que quisieras; ahora cada template entregado cuesta individualmente.

## Features de automatización que SÍ podemos usar

### 1. WhatsApp Flows (gratis en 24h)
Formularios interactivos multi-step dentro del chat. Útiles para:
- **Calificación de leads**: "¿Qué te interesa aprender?" (cursos, eventos, mentoría 1:1)
- **Registro a evento**: nombre, email, dietary restrictions → manda QR
- **Encuesta post-evento**: satisfacción + intent de compra de curso

No requiere template pre-aprobado (es interactivo, no un mensaje outbound). **Nuestra mejor opción para lead qualification.**

### 2. Reply Buttons & Lists
Botones pre-definidos (máx 3-10 opciones) en vez de texto libre.
- "¿Quieres info del evento? [Sí] [No] [Quizá después]"
- "Elige curso: [IA Marketing] [Embudos] [Branding]"

Reduce friction + simplifica intent detection.

### 3. Templates (Utility)
Una vez aprobados por Meta (1-24h), podés enviar proactivamente:
- "Hola {{name}}, te recordamos que el evento es mañana a las 18:00. Confirma tu asistencia: [Sí] [No]"
- "Recibimos tu inscripción a {{course_name}}. Tu link de pago: {{url}}"
- "Gracias por asistir al evento. Tu certificado está listo: {{url}}"

Cada template cuesta, pero son baratos. **Útil para follow-ups transaccionales.**

### 4. Templates (Marketing)
- Newsletters a listas segmentadas
- Re-engagement de leads fríos ("Hace 30 días que no hablamos, ¿sigue tu interés?")
- Ofertas personalizadas

Caro, pero el engagement rate es 5-10x email. **Evaluar después de validar el funnel orgánico.**

### 5. Click-to-WhatsApp Ads
Si David corre ads de FB/IG que llevan a WhatsApp, **72h gratis en todo**. Es el canal de paid acquisition más eficiente en costo por lead.

## AI policy (importante — desde 15 ene 2026)

Meta prohíbe "general-purpose AI" (chatbots sin propósito definido). Solo permitido:

✅ Task-specific agents (atención al cliente, venta consultiva, soporte técnico)
❌ Chatbots abiertos tipo "háblame de lo que quieras"
❌ AI que actúa como compañero conversacional sin objetivo

**Nuestro bot de Qlick es task-specific** (consultoría sobre cursos/eventos + lead capture) → cumple política. Pero NO debemos extender el bot a "conversación libre" sin purpose. Cada nueva feature tiene que tener un objetivo de negocio claro.

## Recomendaciones para Qlick (orden de prioridad)

### Ahora (Fase 7 en curso, gratis)
1. **WhatsApp Flows para calificación + registro a eventos.** Reemplaza el actual "mándame tu email" por un Flow interactivo de 3 pasos. Convierte mejor y es gratis.
2. **Reply Buttons en bienvenida y opciones.** "Sí quiero info" / "No por ahora" / "Ver cursos" en vez de texto abierto. Reduce intent misdetection.

### Después (cuando validemos el funnel)
3. **Templates utility** (4-5 templates): confirmación de registro, recordatorio de evento, envío de QR post-pago, encuesta post-evento, follow-up de lead frío.
4. **Click-to-WhatsApp Ads** si David decide invertir en paid acquisition. 72h gratis cambia el ROI.
5. **Templates marketing** solo si tenemos un funnel validado y queremos escalar. Caro pero efectivo.

### NO hacer
- "General purpose chatbot" sin task — Meta lo prohíbe desde enero 2026
- Templates marketing sin opt-in explícito — Meta lo flagea rápido
- Bot que mande mensajes proactivos sin opt-in — calidad rating cae, account puede ser suspendido

## Referencias

- Meta oficial: https://developers.facebook.com/documentation/business-messaging/whatsapp/
- Pricing: https://developers.facebook.com/docs/whatsapp/pricing/
- Templates: https://developers.facebook.com/docs/whatsapp/templates
- AI policy: ver "Since January 15, 2026, Meta prohibits general-purpose AI" en Chatarmin 2026 guide
- Business App vs Platform: https://whatsappbusiness.com/products/platform-pricing/
