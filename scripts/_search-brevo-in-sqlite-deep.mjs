// scripts/_search-brevo-in-sqlite-deep.mjs
// FIX urgente (sesion David 2026-07-07 ~22:10): buscar xkeysib- BREVO_API_KEY
// en sqlite.db últimos 50 MB. Solo reporta, no commitea.

import { openSync, readSync, fstatSync, closeSync } from "node:fs";

const path = process.env.USERPROFILE + "\\.mavis\\sqlite.db";
const fd = openSync(path, "r");
const stat = fstatSync(fd);
const startAt = Math.max(0, stat.size - 50 * 1024 * 1024);
const bufLen = stat.size - startAt;
const buf = Buffer.alloc(bufLen);
readSync(fd, buf, 0, bufLen, startAt);
closeSync(fd);

const xkey = Buffer.from("xkeysib", "utf8");
let idx = -1;
let from = 0;
const hits = [];
while ((idx = buf.indexOf(xkey, from)) !== -1) {
  let ve = idx;
  while (ve < buf.length && ve < idx + 130) {
    const c = buf[ve];
    if (c === 0x00 || c === 0x0a || c === 0x0d) break;
    ve++;
  }
  const slice = buf.subarray(idx, Math.min(ve, idx + 130));
  const s = slice.toString("utf8").replace(/[^\x20-\x7e]/g, "");
  // Brevo keys tienen formato xkeysib-XXXXXXX (40-80 chars típicamente)
  if (s.length > 60 && s.length < 130 && s.includes("-")) {
    hits.push(s);
  }
  from = ve;
  if (hits.length > 30) break;
}

console.log(`xkeysib candidates (50MB tail): ${hits.length}`);
hits.slice(0, 10).forEach((h, i) => {
  const preview = h.length > 25 ? `${h.slice(0, 14)}...${h.slice(-8)}` : h;
  console.log(`  [${i}] len=${h.length}: ${preview}`);
});
