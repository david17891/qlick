# Estrategia de Video — Qlick Marketing Integral

> Estado actual: **MVP** usa YouTube (embed no listado) como proveedor de video.
> La arquitectura ya soporta migrar a Vimeo, Cloudflare Stream, Mux o un host
> privado sin cambiar los componentes de UI.

## ⚠️ Aviso crítico sobre privacidad

**YouTube "no listado" NO es protección real.** Aunque ocultemos los controles
en la interfaz y usemos `youtube-nocookie`, cualquiera con el `videoId` puede:

- Ver el video fuera de la plataforma.
- Descargarlo con herramientas ampliamente disponibles.
- Re-subirlo a otra cuenta.

Esto es aceptable para una **fase inicial o demo**, pero **no protege contenido
de pago real**. Cuando se venda acceso, se debe migrar a un proveedor que ofrezca
restricción real.

## Proveedores soportados (tipo `VideoProvider`)

| Proveedor           | Estado      | Restricción por dominio | Signed URLs | DRM | Costo aprox.        |
| ------------------- | ----------- | ----------------------- | ----------- | --- | ------------------- |
| `youtube`           | ✅ Activo   | ❌ No                   | ❌ No       | ❌  | Gratis              |
| `vimeo`             | 🔜 Stub     | ✅ Sí (plan Pro+)       | ❌ No       | ❌  | Desde ~$20 USD/mes  |
| `cloudflare_stream` | 🔜 Stub     | ✅ Sí                   | ✅ Sí       | ❌  | Pago por uso        |
| `mux`               | 🔜 Stub     | ✅ Sí                   | ✅ Sí       | ❌  | Pago por uso        |
| `custom`            | ✅ Activo   | Depende                 | Depende     | ❌  | Variable            |

## Comparativa de opciones por fase

### 1. YouTube no listado (Fase 0 — actual)

**Ventajas**
- Gratis, sin infraestructura.
- Reproductor robusto, CDN global.
- Sin configuración de almacenamiento.

**Desventajas**
- **Sin protección real** del contenido.
- Branding de YouTube visible (aunque reducido con `modestbranding`).
- Recomendaciones al final del video (`rel=0` no las elimina del todo).
- No apto para cursos de pago con valor alto.

**Cuándo usarlo**
- MVP, demos, contenido de marketing, lecciones gratuitas o de vista previa.

### 2. Vimeo con restricción por dominio (intermedio)

**Ventajas**
- Restricción por dominio desde el panel (solo `qlick.mx` puede reproducir).
- Reproductor más limpio, sin recomendaciones.
- Mejor calidad de imagen.

**Desventajas**
- La restricción por dominio **se puede eludir** con suficiente ingeniería.
- Requiere plan de pago (Pro o superior).
- No es DRM real.

**Cuándo usarlo**
- Fase 1–2, cuando el contenido tenga valor medio y se quiera mejorar la
  experiencia vs. YouTube.

### 3. Cloudflare Stream (profesional, recomendado)

**Ventancias**
- Signed URLs reales (el enlace expira).
- Restricción por IP/dominio.
- CDN propia, sin branding de terceros.
- API simple para subir y firmar videos.
- Analytics de reproducción.

**Desventajas**
- Pago por almacenamiento + tráfico.
- Requiere backend para firmar URLs.

**Cuándo usarlo**
- **Fase 3**, cuando se venda contenido de pago y se necesite protección seria.

### 4. Mux (profesional, alternativa)

**Ventajas**
- Similar a Cloudflare Stream, con énfasis en analíticas y adaptative bitrate.
- Signed URLs y restricción por dominio.
- Excelente para medir QoE (calidad de experiencia).

**Desventajas**
- Pago por uso (más caro que Cloudflare en volúmenes altos).
- Requiere backend.

### 5. DRM (avanzado, futuro)

**Ventajas**
- Protección máxima contra descargas y re-distribución.
- Compatible con Widevine, FairPlay, PlayReady.

**Desventajas**
- Costo y complejidad altos.
- Requiere integración con un DRM provider.

**Cuándo usarlo**
- Solo si se maneja contenido premium de muy alto valor o licencias de terceros.
- No se recomienda para la fase actual.

## Cómo cambiar de proveedor

La abstracción está en `src/lib/video/provider.ts`. Cada proveedor implementa
la interfaz `VideoProvider`. El cambio se hace por curso/lección editando el
campo `video.provider` en `VideoAsset`:

```ts
{
  provider: "cloudflare_stream",   // ← solo cambia esto
  source: "<video-uid>"            // y el identificador correspondiente
}
```

El `VideoPlayer` (`src/components/video/VideoPlayer.tsx`) usa `resolveEmbed()`
que despacha al proveedor correcto. **No hay que tocar los componentes de UI.**

Para activar Cloudflare Stream o Mux, completa el backend que firma URLs:

```ts
// TODO(Fase 3): src/app/api/video-sign/route.ts
// Recibe { provider, source } y devuelve una URL firmada.
```

## Reglas de la interfaz

- El `VideoPlayer` incluye un watermark discreto de marca ("Qlick · clase").
- El watermark **no protege el video**; es solo branding.
- `youtube-nocookie.com` se usa en lugar de `youtube.com` para reducir tracking.
- `rel=0` y `modestbranding=1` reducen pero no eliminan el branding.
- No ocultamos los controles por completo: perjudica la usabilidad sin añadir
  protección real.

## Hoja de ruta de video

- **Fase 0** ✅ YouTube no listado, abstracción de proveedor, 5 proveedores con stub.
- **Fase 3a** → Vimeo con dominio restringido (rápido de activar).
- **Fase 3b** → Cloudflare Stream con signed URLs (recomendado para pago).
- **Fase 3c** → Analíticas de reproducción (Mux Data o Cloudflare Analytics).
- **Fase 4+** → DRM solo si el modelo de negocio lo justifica.
