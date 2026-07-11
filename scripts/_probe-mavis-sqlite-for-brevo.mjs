// scripts/_probe-mavis-sqlite-for-brevo.mjs
// FIX urgente (sesion David 2026-07-07 ~22:10): David pidio buscar BREVO_API_KEY
// "por ahi". El state del daemon Mavis puede tenerla en sqlite.db.
//
// Estrategia: leer el FINAL del archivo (donde las inserciones recientes estan
// tipicamente). Tambien probar el -wal file si existe.
// 626MB total es demasiado para buscar en todo, solo leemos los ultimos 30 MB.

import { openSync, readSync, fstatSync, closeSync, existsSync } from "node:fs";

const candidates = [
  process.env.USERPROFILE + "\\.mavis\\sqlite.db",
  process.env.USERPROFILE + "\\.mavis\\sqlite.db-wal",
];

const NEEDLE = Buffer.from("BREVO_API_KEY=", "utf8");
const XKEY = Buffer.from("xkeysib-", "utf8");
const MAX_SCAN = 30 * 1024 * 1024; // 30 MiB desde el final

for (const path of candidates) {
  if (!existsSync(path)) continue;
  console.log(`\n=== ${path.replace(process.env.USERPROFILE, "~")} ===`);
  let fd;
  try {
    fd = openSync(path, "r");
  } catch (e) {
    console.log("  open falló:", e.message);
    continue;
  }
  const stat = fstatSync(fd);
  console.log(`  Tamaño: ${(stat.size / 1_048_576).toFixed(1)} MiB`);
  const startAt = Math.max(0, stat.size - MAX_SCAN);

  const CHUNK = 1024 * 1024;
  let pos = startAt;
  const buffer = Buffer.alloc(CHUNK);
  let hits = [];
  let xhits = [];

  while (pos < stat.size) {
    const toRead = Math.min(CHUNK, stat.size - pos);
    readSync(fd, buffer, 0, toRead, pos);

    // Search BREVO_API_KEY=
    let idx = -1;
    let from = 0;
    while ((idx = buffer.indexOf(NEEDLE, from)) !== -1 && idx < toRead) {
      const vs = idx + NEEDLE.length;
      let ve = vs;
      while (ve < toRead && ve < vs + 250) {
        const c = buffer[ve];
        if (c === 0x0a || c === 0x0d || c === 0x00) break;
        ve++;
      }
      const slice = buffer.subarray(vs, ve);
      const s = slice.toString("utf8").replace(/[^\x20-\x7e]/g, "");
      if (s.length > 8) hits.push(s);
      from = ve;
      if (hits.length > 30) break;
    }
    // Search xkeysib-
    let xidx = -1;
    let xfrom = 0;
    while ((xidx = buffer.indexOf(XKEY, xfrom)) !== -1 && xidx < toRead) {
      let ve = xidx;
      while (ve < toRead && ve < xidx + 250) {
        const c = buffer[ve];
        if (c === 0x0a || c === 0x0d || c === 0x00 || c === 0x22 || c === 0x27) break;
        ve++;
      }
      const slice = buffer.subarray(xidx, ve);
      const s = slice.toString("utf8").replace(/[^\x20-\x7e]/g, "");
      if (s.length > 30) xhits.push(s);
      xfrom = ve;
      if (xhits.length > 20) break;
    }

    if (hits.length > 30 && xhits.length > 20) break;
    pos += CHUNK;
  }
  closeSync(fd);

  const mask = (s) => (s.length > 12 ? `${s.slice(0, 5)}...${s.slice(-4)} (len=${s.length})` : `(len=${s.length})`);
  console.log(`  BREVO_API_KEY= hits: ${hits.length}`);
  hits.slice(0, 5).forEach((h, i) => console.log(`    [${i}]`, mask(h)));
  console.log(`  xkeysib- hits: ${xhits.length}`);
  xhits.slice(0, 5).forEach((h, i) => console.log(`    [${i}]`, mask(h)));
}
