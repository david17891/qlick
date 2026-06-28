// scripts/fix-taller-typo.mjs
// Flujo: PREVIEW -> UPDATE -> VERIFY
// Luz verde explicita de David 2026-06-28 (sesion madrugada Click)
// USO: node scripts/fix-taller-typo.mjs
//
// - Lee .env.local
// - SELECT (read-only) del row actual
// - Aplica REPLACE(REPLACE(description, ...))
// - SELECT del row nuevo
// - Imprime delta para inspeccion
//
// Rollback manual si algo sale mal:
//   UPDATE events SET description = '<valor original>' WHERE slug = 'taller-funnels-venta-cdmx';

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const envFile = path.join(ROOT, '.env.local');
if (!fs.existsSync(envFile)) {
  console.error(`[fix-taller-typo] No existe .env.local en ${ROOT}`);
  process.exit(1);
}

const env = fs.readFileSync(envFile, 'utf8');
const url = env.match(/SUPABASE_URL=(.+)/)?.[1]?.trim().replace(/['"]/g, '');
const key = env.match(/SUPABASE_SECRET_KEY=(.+)/)?.[1]?.trim().replace(/['"]/g, '');

if (!url || !key) {
  console.error('[fix-taller-typo] SUPABASE_URL o SUPABASE_SECRET_KEY faltan en .env.local');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const SLUG = 'taller-funnels-venta-cdmx';

console.log('\n[1/3] PREVIEW — SELECT antes del UPDATE\n');

const { data: before, error: e1 } = await sb
  .from('events')
  .select('id, slug, title, description')
  .eq('slug', SLUG)
  .maybeSingle();

if (e1) {
  console.error('[fix-taller-typo] SELECT error:', e1.message);
  process.exit(1);
}
if (!before) {
  console.error(`[fix-taller-typo] No existe row con slug=${SLUG}`);
  process.exit(1);
}

console.log(`id:    ${before.id}`);
console.log(`slug:  ${before.slug}`);
console.log(`title: ${before.title}`);
console.log(`desc:  ${before.description}`);

const hasDisenar = before.description.includes('disenar');
const hasConversion = before.description.includes('conversion');

console.log(`\n[analisis] contiene "disenar" sin acento: ${hasDisenar}`);
console.log(`[analisis] contiene "conversion" sin acento: ${hasConversion}`);

if (!hasDisenar && !hasConversion) {
  console.log('\n[skip] No hay typos que arreglar. Nada que hacer.');
  process.exit(0);
}

console.log('\n[2/3] UPDATE — REPLACE(REPLACE(...))\n');

const oldDesc = before.description;
const newDesc = oldDesc.replace(/disenar/g, 'diseñar').replace(/conversion/g, 'conversión');

console.log(`[diff] old: ${oldDesc.slice(0, 120)}...`);
console.log(`[diff] new: ${newDesc.slice(0, 120)}...`);
console.log(`[diff] delta chars: ${newDesc.length - oldDesc.length} (UTF-8: añadir acentos = +2 bytes)`);

const { data: updated, error: e2 } = await sb
  .from('events')
  .update({ description: newDesc })
  .eq('slug', SLUG)
  .select('id, slug, description')
  .maybeSingle();

if (e2) {
  console.error('[fix-taller-typo] UPDATE error:', e2.message);
  console.error('[fix-taller-typo] ROLLBACK sugerido:');
  console.error(`   UPDATE events SET description = ${JSON.stringify(oldDesc)} WHERE slug = '${SLUG}';`);
  process.exit(1);
}

console.log(`\n[ok] UPDATE aplicado. id=${updated.id}, slug=${updated.slug}`);

console.log('\n[3/3] VERIFY — SELECT final\n');

const { data: after, error: e3 } = await sb
  .from('events')
  .select('id, slug, title, description')
  .eq('slug', SLUG)
  .maybeSingle();

if (e3) {
  console.error('[fix-taller-typo] VERIFY SELECT error:', e3.message);
  process.exit(1);
}

console.log(`desc: ${after.description}`);

const stillHasDisenar = after.description.includes('disenar');
const stillHasConversion = after.description.includes('conversion');
const nowHasDisenar = after.description.includes('diseñar');
const nowHasConversion = after.description.includes('conversión');

console.log(`\n[verify] "disenar" sin acento: ${stillHasDisenar ? 'TODAVIA PRESENTE ❌' : 'eliminado ✅'}`);
console.log(`[verify] "conversion" sin acento: ${stillHasConversion ? 'TODAVIA PRESENTE ❌' : 'eliminado ✅'}`);
console.log(`[verify] "diseñar" con acento: ${nowHasDisenar ? 'presente ✅' : 'NO INSERTADO ❌'}`);
console.log(`[verify] "conversión" con acento: ${nowHasConversion ? 'presente ✅' : 'NO INSERTADO ❌'}`);

if (stillHasDisenar || stillHasConversion || !nowHasDisenar || !nowHasConversion) {
  console.error('\n[FAIL] Alguna verificacion fallo. ROLLBACK sugerido:');
  console.error(`   UPDATE events SET description = ${JSON.stringify(oldDesc)} WHERE slug = '${SLUG}';`);
  process.exit(1);
}

console.log('\n[DONE] Tipos corregidos. Taller desc actualizado.');
console.log('[next] Push del branch feat/admin-eventos y arranca 2E (WhatsApp history en CRM drawer).');