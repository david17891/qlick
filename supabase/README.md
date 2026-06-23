# Supabase — Qlick Marketing Integral

Carpeta para la **base de datos y configuración Supabase** del proyecto.

> **Estado:** bootstrap de conexión. **Sin proyecto Supabase creado todavía.**
> No hay migraciones reales ni seed aplicado. Ver
> `docs/SUPABASE_CONNECTION_BOOTSTRAP.md`.

---

## Estructura

```
supabase/
├── README.md              # Este archivo.
├── config.example.toml    # Plantilla de config para la CLI de Supabase.
├── migrations/            # Migraciones SQL versionadas (placeholders por ahora).
│   └── .gitkeep
└── seed.sql               # Datos de desarrollo (placeholders por ahora).
```

---

## Reglas de uso

1. **No ejecutar migraciones reales sin aprobación** del usuario
   (`docs/AGENT_SUPABASE_PROTOCOL.md`).
2. Toda nueva migración va en `supabase/migrations/` con timestamp:
   `YYYYMMDDHHMMSS_descripcion.sql`.
3. **RLS obligatorio** en cada tabla que contenga datos de usuario/cliente.
4. **No meter claves** aquí. Las env vars viven en `.env.local` y Vercel.
5. El `seed.sql` es para **desarrollo local** únicamente, nunca para producción.

---

## Próximos pasos (Fase 1 — Supabase Real Foundation)

Ver `docs/SUPABASE_CONNECTION_BOOTSTRAP.md` §8. Resumen:

1. Crear proyecto Supabase (con aprobación de costo).
2. Volcar env vars (`.env.local` y Vercel).
3. Escribir migraciones iniciales (LMS + CRM, mapeadas a `src/types/`).
4. Activar RLS en cada tabla.
5. Publicar aviso de privacidad antes de capturar datos reales.
6. Generar TypeScript types: `supabase gen types typescript`.
7. Migrar `src/lib/data/*` a queries Supabase (misma firma pública).
8. Auth: reemplazar `mock-auth` por Supabase Auth (D-004).

---

## CLI de Supabase (referencia)

Esta carpeta está pensada para usarse con la [CLI de Supabase](https://supabase.com/docs/guides/cli).

```bash
# Instalar (una vez)
npm install -D supabase   # o via brew/scoop

# Login
npx supabase login

# Vincular este proyecto local a un proyecto remoto
npx supabase link --project-ref <SUPABASE_PROJECT_REF>

# Crear una nueva migración
npx supabase migration new nombre_descriptivo

# Aplicar migraciones a la DB remota (CON APROBACIÓN)
npx supabase db push

# Generar tipos TS a partir del schema
npx supabase gen types typescript --linked > src/types/supabase.ts
```

> ⚠️ Cualquier `db push`, `db reset` o `migration repair` requiere aprobación
> explícita del usuario (`docs/AGENT_SUPABASE_PROTOCOL.md`).
