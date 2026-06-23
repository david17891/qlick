# Auditoría de dependencias — Qlick Marketing Integral

**Fecha:** 2026-06-23
**Tarea:** P-1 — Actualización controlada de Next.js (parche de seguridad)
**Commit base:** `d85861a` (rama `main`)
**Commit resultante:** el que introduce este documento + el bump.

---

## 1. Versión anterior y nueva

| Paquete | Antes | Después | Notas |
| ------- | ----- | ------- | ----- |
| `next` | `14.2.5` | **`14.2.35`** | Último parche de la línea estable `next-14` (dist-tag `next-14`). |
| `eslint-config-next` | `14.2.5` | **`14.2.35`** | Sincronizado con `next` (misma versión, misma línea). |
| `react` | `18.3.1` | `18.3.1` (sin cambios) | Compatible con Next 14.2.x. |
| `react-dom` | `18.3.1` | `18.3.1` (sin cambios) | Compatible con Next 14.2.x. |

**Línea estable respetada:** `14.2.5 → 14.2.35` es un bump **dentro de la misma
línea menor (14.2.x)**. No hay salto a Next 15 ni 16 (breaking, fuera de alcance).

---

## 2. Motivo de la actualización

`npm audit` sobre `next@14.2.5` reportaba un advisory **crítico** y varios altos:

- **GHSA-gp8f-8m3g-qvj9 — Next.js Cache Poisoning (CRITICAL).** El más relevante:
  afecta al middleware/caché y era el disparador principal de P-1.
- Múltiples advisories altos acumulados en la serie 14.2 previos al `.35`
  (DoS en Server Components / Image Optimization, SSRF en rewrites, XSS en CSP
  nonces, etc.).

`14.2.35` es la versión a la que el propio `npm audit` dirige el fix sin
`--force` para la línea 14.x, y coincide con el dist-tag `next-14` del registro
oficial de Next.js.

---

## 3. Comandos ejecutados (en orden)

```bash
# Diagnóstico previo
git status --short --branch
git log --oneline -5
npm audit
npm outdated next react react-dom eslint-config-next
npm view next dist-tags          # confirma next-14 = 14.2.35

# Actualización controlada (edición manual de package.json + reinstall)
#   next: 14.2.5 -> 14.2.35
#   eslint-config-next: 14.2.5 -> 14.2.35
npm install                      # actualiza package-lock.json

# Validación completa
npm run lint
npm run type-check
npm run build
npm run audit:links
npm audit
```

> **Nota operativa:** la primera instalación falló parcialmente con `EPERM` al
> reemplazar el binario SWC (`next-swc.win32-x64-msvc.node`) porque el servidor
> `next dev` en background lo tenía bloqueado. Se detuvo el proceso (PID 32156)
> y se reinstaló limpio. **Lección:** detener `npm run dev` antes de bump de
> `next` en Windows.

---

## 4. Resultado de la validación

| Comando | Resultado |
| ------- | --------- |
| `npm run lint` | ✅ No ESLint warnings or errors |
| `npm run type-check` | ✅ tsc --noEmit sin errores |
| `npm run build` | ✅ 55 páginas SSG generadas con `Next.js 14.2.35` |
| `npm run audit:links` | ✅ 0 hallazgos (sin anchors vacíos ni forms sin backend) |
| `npm audit` | 5 vulnerabilidades residuales (ver §5) |

El build genera las mismas 55 rutas que antes, con tamaños de bundle equivalentes
(±2 KB por actualización de chunks compartidos). Sin regresiones funcionales.

---

## 5. Estado de `npm audit` (post-actualización)

Pasamos de **8 vulnerabilidades (1 critical, 6 high, 1 moderate)** a
**5 (0 critical, 4 high, 1 moderate)**. El advisory crítico de Cache Poisoning
quedó **resuelto** con `14.2.35`.

### Vulnerabilidades residuales (5)

Todas requieren un salto **breaking** (Next 16 / eslint-config-next 16) que está
**fuera del alcance de P-1** y de la decisión del proyecto de no migrar de línea
mayor. Se documentan como riesgo residual aceptado:

| Paquete | Severidad | Origen | Exposición real en este MVP |
| ------- | --------- | ------ | --------------------------- |
| `next` (varios advisories DoS/XSS/SSRF) | high | runtime | **No aplica**: el MVP no usa Image Optimization API, Middleware proxy, Server Actions, i18n Pages Router ni upgrades WebSocket. Son features no implementadas. |
| `postcss` (XSS stringify) | moderate | build/runtime vía next | Vinculado al bundle de Next; se resuelve al migrar a Next 16. Riesgo de build-time, no explotable en el SSG actual. |
| `glob` (command injection `-c`) | high | **devDep** (eslint) | Solo afecta al toolchain de lint en desarrollo, no al producto. Fix requiere `eslint-config-next@16`. |

### Por qué no se aplicó `npm audit fix --force`

`npm audit fix --force` propondría:

- `next@16.2.9` → **breaking** (cambios en App Router, metadata, caché).
- `eslint-config-next@16.2.9` → **breaking** (requiere ESLint 9).

Ambos violan explícitamente la instrucción del proyecto: *"No migrar a Next 15
salvo que npm audit lo vuelva estrictamente necesario"*. El advisory crítico ya
quedó cubierto dentro de la línea 14.2.x, así que la migración mayor **no es
estrictamente necesaria** para el MVP.

---

## 6. Riesgos pendientes

| ID | Riesgo | Severidad | Mitigación / cuándo abordarlo |
| -- | ------ | --------- | ----------------------------- |
| R-1 | Migración mayor a Next 16 pendiente | Medio | Próximo mantenimiento post-Fase 1; evaluar bloqueo de breaking changes. |
| R-2 | `eslint-config-next@16` + ESLint 9 | Bajo | DevDep; no impacta producción. |
| R-3 | `postcss` vinculado a Next | Bajo | Se resuelve junto con R-1. |

**Ninguno bloquea la demo ni el uso del MVP.**

---

## 7. Archivos modificados

- `package.json` — bump de `next` y `eslint-config-next` a `14.2.35`.
- `package-lock.json` — regenerado por `npm install` (8 añadidos, 5 eliminados,
  13 cambiados).
- `docs/DEPENDENCY_AUDIT.md` — este documento.

**No se tocaron:** diseño, rutas, copy, assets, Supabase, pagos, video providers,
componentes, ni ninguna lógica de aplicación.

---

## 8. Conclusión

P-1 completado. El MVP queda en **Next.js 14.2.35** (línea estable `next-14`),
con el advisory crítico de Cache Poisoning resuelto y la validación completa en
verde (lint, type-check, build de 55 páginas, audit:links). Los 5 advisories
residuales son riesgo aceptado, documentados, y exigen migración breaking fuera
de alcance. **Supabase sigue pendiente para la Fase 1** (sin cambios respecto al
ROADMAP).
