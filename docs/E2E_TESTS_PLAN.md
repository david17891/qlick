# Plan: Tests E2E con Playwright (pieza #7 del ROADMAP)

> Documento de planeación. David lo aprobó como idea general; falta definir el alcance exacto y arrancar.

---

## Por qué Playwright

Ya tenemos **Playwright como MCP server** registrado localmente (visible en la lista de tools al inicio de cada sesión). Eso significa que puedo:

- **Navegar** la app levantada en `localhost:3000` como si fuera un browser real.
- **Tomar screenshots** de cada paso de los flujos.
- **Hacer assertions** simples (URL, contenido de texto, visibilidad de elementos).
- **No necesito** instalar `@playwright/test` framework para esto — el MCP alcanza.

Para CI/CD real (cuando lo necesitemos) sí agregamos `@playwright/test`. Pero para **validar visualmente y dejar evidencia** ahora, el MCP es suficiente y más rápido.

---

## Alcance — qué cubrimos

### Fase 1 (esta vuelta de David, si aprueba): Tour con screenshots

Tour manual-grabado de los flujos críticos. Sin assertions duras, con screenshots como evidencia.

| Flujo | Páginas | Screenshots |
|---|---|---|
| **Home público** | `/` | hero, CTAs |
| **Catálogo** | `/cursos` | grid de 4 cursos desde DB |
| **Detalle curso** | `/cursos/fundamentos-marketing-digital` | módulos + lecciones desde DB |
| **QR endpoint** | `/api/qr/fundamentos-marketing-digital` | QR como PNG |
| **Landing inscripción** | `/inscripcion/fundamentos-marketing-digital?ref=qr` | preview + botón Google + badge "vía QR" |
| **Login** | `/login` | botón "Continuar con Google" |
| **Dashboard demo** | `/dashboard` (sin sesión) | redirige o muestra demo state |

**Limitación conocida**: el flujo OAuth con Google real **no se puede automatizar** (Google bloquea bots en el consent screen). El tour se detiene en `/login` o usa `NEXT_PUBLIC_AUTH_MODE=mock` para simular.

### Fase 2 (después, con `@playwright/test`): Tests automatizados

Si David decide que quiere CI, instalamos `@playwright/test` y escribimos tests que:

- Corran en cada PR.
- Fallen si algo se rompe.
- Cubran happy paths + edge cases.

Pero esto es alcance para después. Por ahora, **screenshots como evidencia**.

---

## Cómo lo voy a ejecutar (cuando David apruebe)

### Pre-requisitos
- `npm run dev` corriendo en `localhost:3000` (David lo levanta, o yo lo levanto en background).
- App funcionando con los datos del seed (ya están ✅).

### Pasos
1. Levantar `npm run dev` en background (si David no lo tiene ya).
2. Cargar Playwright MCP si no está activo.
3. Hacer tour:
   - Para cada URL del alcance: navegar, esperar a que cargue, screenshot.
   - Guardar screenshots en `docs/screenshots/YYYY-MM-DD-e2e-tour/` con nombre descriptivo.
4. Generar mini-reporte Markdown (`docs/screenshots/.../README.md`) con:
   - Lista de screenshots
   - Para cada uno: URL + qué valida + ✅/⚠️/❌ según se vea bien
5. Commitear la carpeta de screenshots.

### Naming convention para screenshots
```
docs/screenshots/2026-06-25-e2e-tour/
├── 01-home.png
├── 02-cursos-grid.png
├── 03-curso-detalle.png
├── 04-qr-endpoint.png
├── 05-inscripcion-preview.png
├── 06-login.png
└── README.md  ← reporte con evaluación
```

---

## Limitaciones que David debe conocer

1. **OAuth real no se automatiza**: el tour puede llegar al botón "Continuar con Google" pero no hacer clic y completar el flujo. Para validar el flujo post-OAuth, hace falta `AUTH_MODE=mock` o los tests E2E con `@playwright/test` (que mockean Supabase).
2. **Datos dinámicos**: si la DB tiene datos diferentes a los esperados (ej: otro seed), las screenshots pueden mostrar cosas distintas. Para CI, los tests deberían ser deterministas.
3. **Tiempo de cómputo**: navegar + screenshot de 6-7 páginas toma ~2-5 minutos de cómputo. No es gratis en mi budget.
4. **CSS / responsive**: el MCP renderiza a un viewport fijo. Para validar mobile habría que cambiar el viewport explícitamente (Playwright lo permite, pero agregaría tiempo).

---

## Decisión que David tiene que tomar cuando vuelva

**Pregunta simple**: ¿arranco el tour ahora o lo dejamos para la próxima sesión?

- **Sí, arranco**: yo levanto `npm run dev` y hago el tour. Cuando vuelvas tenés los screenshots + reporte.
- **Lo dejamos para después**: lo agendamos como arranque de la próxima sesión. Mientras, seguimos con onboarding (#6) o lo que prefieras.

---

## Por qué NO mezclar con `@playwright/test` ahora

Si David quiere CI/CD desde el día 1, podemos instalar `@playwright/test`. Pero:

- Costo de setup: 30-60 min (config + tests + fixtures + CI workflow).
- Beneficio inmediato: bajo (no hay CI todavía, no hay PRs automatizados).
- Beneficio a mediano plazo: alto (regresiones prevenidos).

**Recomendación**: empezar con screenshots (Fase 1) ahora, instalar `@playwright/test` cuando haya CI real (Fase 2). Es el orden costo/beneficio correcto.

---

## Próximo paso concreto

1. David vuelve del descanso.
2. Confirma si quiere arrancar el tour.
3. Si sí: yo levanto `npm run dev` y hago el tour.
4. Si no: este plan queda como referencia, y arrancamos onboarding (#6) o lo que David prefiera.

---

## Fase 0 — smoke E2E backend del funnel de eventos (implementada)

El comando `npm run test:e2e:funnel` valida de forma reproducible el recorrido
crítico sin cargos ni proveedores externos:

`WhatsApp entrante → registro del lead → confirmación → email/QR → webhook Stripe test firmado → pago aprobado → acceso activo`.

El caso usa un evento, teléfono y correo sintéticos; mockea WhatsApp/Brevo y
restaura el modo global del bot y elimina sus registros al terminar. El pago es
un payload `checkout.session.completed` firmado con `STRIPE_WEBHOOK_SECRET` en
modo test; no crea un cargo real ni requiere tarjeta.

Resultado esperado: 1 test aprobado, `event_payments.status=approved`,
`event_confirmations.payment_status=paid` y `event_access.access_status=active`.
