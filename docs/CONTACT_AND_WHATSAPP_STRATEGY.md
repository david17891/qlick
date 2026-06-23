# Estrategia de contacto y WhatsApp — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Estado:** MVP funcional con proveedor `mock`. Lista para activar Resend/CRM sin
tocar la UI.

---

## Resumen ejecutivo

La plataforma expone cuatro canales de contacto (formulario web, WhatsApp de
ventas, WhatsApp de soporte, grupo de alumnos) a través de **dos abstracciones**:
una capa de proveedor de contacto (`ContactProvider`) y un helper de WhatsApp
(`getWhatsAppLink`). El MVP funciona sin configuración: cuando faltan las env vars,
la UI muestra estados explícitos ("próximamente", badge "demo") en lugar de links
falsos o botones que parecen funcionar pero no hacen nada.

---

## Arquitectura

### 1. Capa de contacto — `src/lib/contact/`

```
src/lib/contact/
├── contact-provider.ts        # Interfaz ContactProvider + validateContactMessage
├── mock-contact-provider.ts   # Activo en el MVP (registra en consola)
├── resend-contact-provider.ts # Stub para email transaccional (futura fase)
├── crm-contact-provider.ts    # Stub para CRM (HubSpot/propio, fase 4)
├── whatsapp.ts                # Helper getWhatsAppLink + intents
└── index.ts                   # getContactProvider() con registry + fallback
```

**Contrato (`ContactProvider`):**

```ts
interface ContactProvider {
  sendMessage(msg: ContactMessage): Promise<ContactResult>;
}
```

Mismo patrón que `PaymentProvider` y `VideoProvider` (ver D-005): hoy hay un
proveedor activo (`mock`) y dos stubs listos. Cambiar de proveedor es una env var,
no un refactor.

### 2. Helper de WhatsApp — `getWhatsAppLink(intent, options?)`

Devuelve `{ href, configured, label }`. Si no hay número/grupo configurado,
`configured: false` y la UI **debe** mostrar fallback. Cuatro intents:

| Intent | Cuándo | Env var |
| ------ | ------ | ------- |
| `sales` | Info / compra de cursos | `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` |
| `support` | Problemas con acceso a la plataforma | `NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER` (cae a sales si falta) |
| `enroll` | Inscripción a un curso concreto (personaliza el mensaje) | `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` |
| `group` | Acceso al grupo de alumnos | `NEXT_PUBLIC_WHATSAPP_GROUP_URL` (o sales como fallback) |

El link se construye con `https://wa.me/<número>?text=<mensaje>` (formato
internacional, solo dígitos). El helper normaliza el input quitando `+` y espacios.

---

## Variables de entorno

Definidas en `.env.example`. **Todas opcionales en el MVP.**

| Variable | Default | Descripción |
| -------- | ------- | ----------- |
| `NEXT_PUBLIC_CONTACT_PROVIDER` | `mock` | `mock` (demo) \| `resend` \| `crm` |
| `NEXT_PUBLIC_CONTACT_TO_EMAIL` | `hola@qlick.mx` | Destino real de los mensajes |
| `NEXT_PUBLIC_WHATSAPP_SALES_NUMBER` | (vacío) | Número en formato internacional |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER` | (vacío) | Cae a sales si no se define |
| `NEXT_PUBLIC_WHATSAPP_GROUP_URL` | (vacío) | URL `chat.whatsapp.com/...` |
| `RESEND_API_KEY` | (vacío) | Fase futura: email transaccional |
| `CRM_API_KEY` | (vacío) | Fase 4: integración CRM |

---

## Comportamiento del MVP (modo demo)

Sin configurar nada, esto es lo que ve el usuario:

- **Formulario de contacto (`/contacto`)**: funciona, valida y muestra mensaje de
  éxito. El mensaje se registra en la consola del servidor vía
  `mockContactProvider`. Hay un badge "demo" visible que aclara que no llega a un
  inbox real todavía.
- **Botones de WhatsApp**: aparecen **deshabilitados** con la etiqueta
  "próximamente" cuando `configured === false`. No son links a `#`.
- **Email / teléfono** en la página de contacto: son links reales (`mailto:` /
  `tel:`) apuntando a los valores de marca.

### Dónde aparecen los botones de WhatsApp

| Página / componente | Intent | Rol |
| ------------------- | ------ | --- |
| Home (CTA) | `sales` | Conversión comercial |
| `/contacto` (sidebar) | `sales` + `support` | Contacto directo |
| `/cursos/[slug]` (inscripción) | `enroll` | Cierre de compra |
| `/dashboard` (soporte) | `support` | Ayuda a alumnos |
| `LessonView` (acceso restringido ×2) | `enroll` | Upsell cuando no hay acceso |

---

## Cómo activar WhatsApp real (cuando Qlick dé los números)

1. Añadir a `.env.local`:
   ```
   NEXT_PUBLIC_WHATSAPP_SALES_NUMBER=5212222222222
   NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER=5212222222222
   NEXT_PUBLIC_WHATSAPP_GROUP_URL=https://chat.whatsapp.com/xxxxxxxx
   ```
2. Reiniciar `npm run dev`. **No se toca código**: los `<WhatsAppButton>` leen
   `configured` y se habilitan automáticamente con el link `wa.me` correcto.

> **Importante:** el número de grupo (`NEXT_PUBLIC_WHATSAPP_GROUP_URL`) **no se
> inventa**. Debe ser proporcionado manualmente por Qlick.

---

## Cómo activar el envío real del formulario

### Opción A — Resend (recomendado para email transaccional)

1. Crear cuenta en [resend.com](https://resend.com), verificar dominio.
2. `NEXT_PUBLIC_CONTACT_PROVIDER=resend` y `RESEND_API_KEY=re_xxx`.
3. Completar `resendContactProvider.ts` (actualmente stub).

### Opción B — CRM (Fase 4)

Cuando se integre HubSpot o un CRM propio, `NEXT_PUBLIC_CONTACT_PROVIDER=crm`
 enruta a `crmContactProvider.ts` para crear leads automáticamente.

---

## Limitaciones conocidas del MVP

- El `mockContactProvider` no persiste mensajes: solo loggea. Si el servidor se
  reinicia, el mensaje "se pierde" (no llega a ningún inbox).
- No hay anti-spam real (reCAPTCHA/hCaptcha). La validación es de formato + un
  throttle anti-doble-envío en el cliente (`ContactForm`).
- WhatsApp usa `wa.me` (API pública de click-to-chat). **No** es la WhatsApp
  Business API: no envía mensajes salientes automatizados, solo abre el chat.
  Para mensajería outbound / plantillas se necesitará la Cloud API oficial
  (documentado en ROADMAP, Fase 4).

---

## Referencias

- `src/lib/contact/` — implementación.
- `src/components/contact/ContactForm.tsx` — formulario cliente.
- `src/components/contact/WhatsAppButton.tsx` — botón reutilizable.
- `docs/DECISIONS.md` D-013 — abstracción de contacto.
