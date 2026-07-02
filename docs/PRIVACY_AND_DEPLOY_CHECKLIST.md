# Checklist — Aviso de Privacidad y Deploy Productivo (fase leads)

> **Fuente canónica.** Este doc es el gate de captura de datos reales
> (RLS + aviso de privacidad + consentimiento + deploy). El índice
> cross-cutting para AI agents vive en `.harness/docs/project-standards.md`
> (§3 Datos sintéticos/reales y §4 Env vars / secretos), y el scope del
> rein que opera RLS y migraciones en `.harness/reins/supabase-expert/agent.md`.
> Si hay conflicto, gana este doc.

**Fecha:** 2026-06-23
**Fase:** `feature/privacy-and-production-deploy` (post `v0.4.0-leads-foundation`)
**Audiencia:** operador humano que valida y lanza el deploy productivo del
vertical slice de leads.

Este doc es una **lista de verificación de cierre** para subir a producción el
flujo `ContactForm → Supabase leads`. No duplica la configuración de Vercel
(eso vive en `docs/VERCEL_ENV_SETUP.md`); lo referencia y añade lo específico
de privacidad y validación post-deploy.

---

## 0. Estado de partida (confirmado antes de esta fase)

- ✅ `main` mergeado y sincronizado; tag `v0.4.0-leads-foundation`.
- ✅ Flujo `ContactForm → submitLead → createLead → admin client → tabla leads` verificado E2E.
- ✅ RLS activa; `anon` no lee ni inserta leads; insert solo server-side (service role).
- ✅ `GET /api/admin/leads` inerte (`AUTH_READY=false`) hasta auth admin.
- ✅ Probes de test borrados; lead real `d1bb8d38` preservado.

---

## 1. Variables en Vercel

Configuración detallada: **`docs/VERCEL_ENV_SETUP.md`** (secciones 2 y 3).

Variables requeridas (todas deben estar presentes en **Production**):

| Variable | Sensitiva | Notas |
| -------- | :-------: | ----- |
| `NEXT_PUBLIC_SUPABASE_URL` | no | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | no | formato `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | **sí** | formato `sb_secret_…`; **nunca** con prefijo `NEXT_PUBLIC_` |
| `SUPABASE_PROJECT_REF` | no | ref del proyecto Supabase |
| `NEXT_PUBLIC_APP_URL` | no | URL de producción (ej. `https://qlick-three.vercel.app`) |

- [ ] Las 5 variables existen en Vercel → Production.
- [ ] `SUPABASE_SECRET_KEY` está marcada como **Sensitive** (valor oculto tras guardar).
- [ ] Ninguna variable `SUPABASE_*` lleva prefijo `NEXT_PUBLIC_` salvo URL y publishable key.
- [ ] **Redeploy** realizado tras editar las variables.

> Validación local rápida: `npm run check:supabase` (verifica presencia y
> formato de las env vars, **no** abre conexión remota).

---

## 2. Prueba del panel interno `/admin/system/supabase`

Página de diagnóstico server-side que reporta el estado de Supabase **sin
revelar secretos**.

- [ ] Abrir `https://<prod-url>/admin/system/supabase`.
- [ ] Confirma que dice **"Configurado"** (url + publishable + secret presentes).
- [ ] Confirma que **no** imprime el valor de ninguna clave (solo
      presencia/longitud enmascarada).
- [ ] Si dice "demo" o falta algún componente → revisar sección 1.

---

## 3. Prueba del formulario `/contacto`

- [ ] Abrir `https://<prod-url>/contacto`.
- [ ] El badge del formulario muestra **"Modo real"** (verde) — no "Modo demo".
      - Si dice "Modo demo": faltan `NEXT_PUBLIC_SUPABASE_URL` o
        `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en el entorno del build.
- [ ] El checkbox de consentimiento muestra el texto actualizado y un **link
      clicable a `/privacidad`**.
- [ ] Enviar un mensaje de prueba real con datos tuyos.
- [ ] La pantalla de éxito dice que el lead **se guardó en el CRM**.

---

## 4. Verificación del lead en Supabase

Después del envío de la sección 3:

- [ ] En el Dashboard de Supabase → **Table Editor → `leads`** aparece la fila nueva.
- [ ] `consent_to_contact = true` en esa fila (evidencia del consentimiento).
- [ ] `status = 'new'`, `source = 'website'`.
- [ ] El email y nombre coinciden con lo que enviaste.

> El listado por HTTP aún **no** está disponible (`GET /api/admin/leads`
> devuelve 503). La verificación se hace directo en el Dashboard o por script
> server-side con service role.

---

## 5. Aviso de Privacidad publicado y enlazado

- [ ] `https://<prod-url>/privacidad` carga el aviso.
- [ ] El aviso cubre: formulario de contacto, solicitud de información de
      cursos, seguimiento comercial, gestión de leads, registro de
      consentimiento, derechos ARCO, contacto del responsable y proveedores
      (Supabase/Vercel).
- [ ] Muestra la **nota de validación legal pendiente** de forma visible.
- [ ] El link desde el checkbox de `/contacto` abre correctamente `/privacidad`.
- [ ] Footer u otro punto de navegación enlaza a `/privacidad` (pendiente de
      añadir al `Footer.tsx` — ver sección 8).

### ⚠️ Pendientes legales (bloqueantes para operación formal)

> **Este aviso no es asesoría legal definitiva.** Debe revisarse con asesor
> legal antes de capturar datos de terceros en operación formal.

- [ ] Confirmar/reemplazar el correo de privacidad `privacidad@qlick.mx`
      (placeholder) por el oficial.
- [ ] Añadir domicilio físico del responsable cuando se confirme (hoy
      omitido a propósito; **no** inventar).
- [ ] Definir fecha de entrada en vigor al validar.
- [ ] Revisar si aplican transferencias internacionales (Supabase/Vercel EE. UU.) y
      mencionarlo si la ley lo requiere.

---

## 6. Confirmación de no exposición de secretos

- [ ] Inspeccionar el bundle del navegador (DevTools → Sources / Network):
      **no** aparece `sb_secret_…` ni `SUPABASE_SECRET_KEY` en ningún chunk.
- [ ] `npm run check:supabase` no imprime valores, solo longitud enmascarada.
- [ ] Buscar en el repo histórico: `git log --all -p | grep -i "sb_secret_"`
      no debe mostrar commits con el valor real (si los hay → rotar de inmediato,
      ver `docs/VERCEL_ENV_SETUP.md` §7).
- [ ] `.env.local` **no** está versionado: `git ls-files .env.local` no
      devuelve nada.

---

## 7. Confirmación de que `GET /api/admin/leads` sigue dormido

El endpoint de lectura HTTP permanece **inerte** hasta que exista auth admin.

- [ ] `curl -i https://<prod-url>/api/admin/leads` → **HTTP 503**.
- [ ] El cuerpo responde `{"ok":false,"error":"Lectura de leads requiere
      autenticación admin (Fase 1). El endpoint está inerte.","leads":[]}`.
- [ ] `AUTH_READY` sigue en `false` en
      `src/app/api/admin/leads/route.ts`.

> No activar este endpoint sin auth admin real (Supabase Auth + middleware de
> rol). Es una regla dura de esta fase.

---

## 8. Fuera de alcance de esta fase (no tocar)

- ❌ Auth admin y activación de `GET /api/admin/leads`.
- ❌ Pagos / facturación.
- ❌ WhatsApp Business API (solo click-to-chat wa.me en esta fase).
- ❌ OpenRouter / LLM.
- ❌ Migración del LMS.
- ❌ Cambios de schema en `leads` salvo necesidad estricta.

---

## 9. Pendientes menores trasvalidar (no bloqueantes para deploy)

- Añadir link a `/privacidad` en `src/components/layout/Footer.tsx`
  (hoy solo está enlazado desde el checkbox de `/contacto`).
- Confirmar la URL de ejemplo `qlick-three.vercel.app` vs la real de producción.

---

## Referencias

- Setup de env vars en Vercel: `docs/VERCEL_ENV_SETUP.md`
- Foundation real de leads + hardening RLS: `docs/SUPABASE_REAL_FOUNDATION.md`
- Bootstrap de conexión Supabase: `docs/SUPABASE_CONNECTION_BOOTSTRAP.md`
- Validador local: `npm run check:supabase`
- Auditoría de links: `npm run audit:links`
