// scripts/seed-lead-interactions.mjs
// Inserta interacciones demo en lead_interactions para que el Bloque 2E
// tenga datos visibles en el drawer del CRM.
// USO: node scripts/seed-lead-interactions.mjs
//
// - Lee .env.local
// - Selecciona el primer lead que existe en la DB
// - Inserta 4 interacciones distribuidas en los últimos 7 días
//   (mix inbound/outbound + whatsapp/email/phone) para que el historial
//   del drawer se vea realista.
// - Idempotente: si ya hay interacciones del sistema (summary empieza con
//   "[seed]"), skip; si no, inserta.
//
// No toca el lead ni otras tablas.

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const envFile = path.join(ROOT, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error(`[seed] No existe .env.local en ${ROOT}`);
  process.exit(1);
}

const env = fs.readFileSync(envFile, 'utf8');
const url = env.match(/SUPABASE_URL=(.+)/)?.[1]?.trim().replace(/['"]/g, '');
const key = env.match(/SUPABASE_SECRET_KEY=(.+)/)?.[1]?.trim().replace(/['"]/g, '');

if (!url || !key) {
  console.error('[seed] SUPABASE_URL o SUPABASE_SECRET_KEY faltan');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const SEED_PREFIX = '[seed]';

console.log('\n[1/3] Buscando lead existente…\n');

const { data: leads, error: leadErr } = await sb
  .from('leads')
  .select('id, name, email')
  .order('created_at', { ascending: false })
  .limit(5);

if (leadErr) {
  console.error('[seed] SELECT leads error:', leadErr.message);
  process.exit(1);
}
if (!leads?.length) {
  console.error('[seed] No hay leads en la DB. Crea uno antes de seedear interacciones.');
  process.exit(1);
}

const lead = leads[0];
console.log(`[seed] Lead target: ${lead.name} (${lead.id})`);
console.log(`[seed] email: ${lead.email}`);

console.log('\n[2/3] Verificando idempotencia…\n');

const { count: existing } = await sb
  .from('lead_interactions')
  .select('*', { count: 'exact', head: true })
  .eq('lead_id', lead.id)
  .like('summary', `${SEED_PREFIX}%`);

if (existing && existing > 0) {
  console.log(`[seed] Ya hay ${existing} interacciones [seed] para este lead. Skip.`);
  console.log('[seed] Para re-seedear: borra las filas con summary LIKE "[seed]%" antes.');
  process.exit(0);
}

console.log('\n[3/3] Insertando 4 interacciones demo…\n');

const now = Date.now();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const seeds = [
  {
    lead_id: lead.id,
    channel: 'whatsapp',
    direction: 'outbound',
    summary: `${SEED_PREFIX} Mensaje inicial de WhatsApp con info del taller de funnels.`,
    created_at: new Date(now - 6 * DAY - 3 * HOUR).toISOString(),
    created_by_email: 'david17891@gmail.com'
  },
  {
    lead_id: lead.id,
    channel: 'whatsapp',
    direction: 'inbound',
    summary: `${SEED_PREFIX} Respondió que le interesa pero todavía no puede pagar.`,
    created_at: new Date(now - 5 * DAY - 1 * HOUR).toISOString(),
    created_by_email: 'david17891@gmail.com'
  },
  {
    lead_id: lead.id,
    channel: 'email',
    direction: 'outbound',
    summary: `${SEED_PREFIX} Email con la liga de pago y el temario detallado.`,
    created_at: new Date(now - 3 * DAY).toISOString(),
    created_by_email: 'david17891@gmail.com'
  },
  {
    lead_id: lead.id,
    channel: 'phone',
    direction: 'inbound',
    summary: `${SEED_PREFIX} Llamó para confirmar horario del taller. Quedó en ir el domingo.`,
    created_at: new Date(now - 8 * HOUR).toISOString(),
    created_by_email: 'david17891@gmail.com'
  }
];

const { data: inserted, error: insErr } = await sb
  .from('lead_interactions')
  .insert(seeds)
  .select('id, channel, direction, summary, created_at');

if (insErr) {
  console.error('[seed] INSERT error:', insErr.message);
  process.exit(1);
}

console.log(`[seed] Insertadas ${inserted.length} interacciones:`);
for (const r of inserted) {
  console.log(`  - ${r.created_at}  ${r.direction.padEnd(8)} ${r.channel.padEnd(8)} ${r.summary}`);
}

console.log('\n[DONE] Abre el drawer del lead en /admin?tab=crm para ver el historial.');
console.log('[next] Test E2E con Playwright MCP.');