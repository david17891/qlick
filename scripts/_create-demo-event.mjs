// scripts/_create-demo-event.mjs
//
// Crea un evento de ejemplo con datos limpios para validar el catalogo
// publico /eventos. Replicable: correlo otra vez si quieres regenerar el
// evento (el script hace upsert por slug, asi que es idempotente).
//
// Uso:
//   node scripts/_create-demo-event.mjs
//
// Lee credenciales de .env.local (NEXT_PUBLIC_SUPABASE_URL +
// SUPABASE_SERVICE_ROLE_KEY). El service role bypasea RLS.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const env = {};
if (existsSync(".env.local")) {
  for (const raw of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Faltan env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Evento de ejemplo. Fechas: sabado 5 de julio 2026, 10:00-13:00 hora de
// Mexico Centro (UTC-6). Cubrimos un taller presencial en CDMX con cupo
// limitado. Cover null para que el catalogo use el fallback de gradiente
// (consistente con la decision de B-5: "solo colores, sin imagenes").
const demoEvent = {
  slug: "taller-funnels-venta-cdmx",
  title: "Taller: Funnels de Venta que Convierten",
  description:
    "Taller presencial de 3 horas en CDMX. Aprende a disenar funnels de venta B2C paso a paso: captura, nurturing, conversion. Cupo limitado a 20 personas. Incluye material y coffee break.",
  // 2026-07-05 10:00 hora Mexico Centro (UTC-6) = 2026-07-05 16:00 UTC
  // 2026-07-05 13:00 hora Mexico Centro (UTC-6) = 2026-07-05 19:00 UTC
  starts_at: "2026-07-05T16:00:00+00:00",
  ends_at: "2026-07-05T19:00:00+00:00",
  location: "Ciudad de Mexico (CDMX) · presencial",
  cover_image_url: null,
  status: "published",
};

// Upsert por slug para que el script sea idempotente.
const { data, error } = await sb
  .from("events")
  .upsert(demoEvent, { onConflict: "slug" })
  .select()
  .single();

if (error) {
  console.error("ERR:", error.message);
  process.exit(1);
}

console.log("OK. Evento creado/actualizado:");
console.log(JSON.stringify(
  {
    id: data.id,
    slug: data.slug,
    title: data.title,
    status: data.status,
    starts_at: data.starts_at,
    ends_at: data.ends_at,
    location: data.location,
    public_url: `http://localhost:3000/eventos/${data.slug}`,
    catalog_url: "http://localhost:3000/eventos",
  },
  null,
  2,
));