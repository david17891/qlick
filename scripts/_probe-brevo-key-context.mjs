// scripts/_probe-brevo-key-context.mjs
// FIX urgente (sesion David 2026-07-07 ~22:10): descubrir si los hits de xkeysib-
// en sqlite son keys reales (Brevo) o codigo/logs referenciando el patron.
// Sin enmascarar para inspeccion, pero solo corre localmente.

import { openSync, readSync, fstatSync, closeSync } from "node:fs";

const path = process.env.USERPROFILE + "\\.mavis\\sqlite.db-wal";
const fd = openSync(path, "r");
const stat = fstatSync(fd);
const buf = Buffer.alloc(stat.size);
readSync(fd, buf, 0, stat.size, 0);
closeSync(fd);

// Buscar todos los xkeysib- y capturar CONTEXTO alrededor (60 chars antes y despues).
const xkey = Buffer.from("xkeysib-", "utf8");
const CONTEXT = 80;
const hits = [];
let idx = -1;
let from = 0;
while ((idx = buf.indexOf(xkey, from)) !== -1) {
  const start = Math.max(0, idx - CONTEXT);
  const end = Math.min(buf.length, idx + CONTEXT + 130);
  const contextBuf = buf.subarray(start, end);
  const ctx = contextBuf.toString("utf8").replace(/[^\x20-\x7e]/g, "");
  // Edge brackets
  hits.push({ idx, context: ctx });
  from = idx + xkey.length;
  if (hits.length > 30) break;
}

console.log(`Hits xkeysib- en sqlite-wal: ${hits.length}`);
hits.forEach((h, i) => {
  console.log(`\n--- hit [${i}] at byte ${h.idx} ---`);
  console.log(`  CONTEXT: ${h.context}`);
});
