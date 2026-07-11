// scripts/_extract-brevo-key-from-wal.mjs
// FIX urgente (sesion David 2026-07-07 ~22:10): David pidio buscar BREVO_API_KEY
// "por ahi". Search exhaustivo.

import { openSync, readSync, fstatSync, closeSync } from "node:fs";

const paths = [
  process.env.USERPROFILE + "\\.mavis\\sqlite.db-wal",
  process.env.USERPROFILE + "\\.mavis\\sqlite.db",
];

const XKEY = Buffer.from("xkeysib-", "utf8");

for (const path of paths) {
  let fd;
  try {
    fd = openSync(path, "r");
  } catch {
    continue;
  }
  const stat = fstatSync(fd);
  const buf = Buffer.alloc(stat.size);
  readSync(fd, buf, 0, stat.size, 0);
  closeSync(fd);

  const hits = [];
  let idx = -1;
  let from = 0;
  while ((idx = buf.indexOf(XKEY, from)) !== -1) {
    let end = idx;
    while (end < buf.length && end < idx + 200) {
      const c = buf[end];
      if (c === 0x00 || c === 0x0a || c === 0x0d) break;
      end++;
    }
    const slice = buf.subarray(idx, end);
    const s = slice.toString("utf8").replace(/[^\x20-\x7e]/g, "");
    if (s.length > 30 && s.length < 120) {
      hits.push(s);
    }
    from = end;
  }

  console.log(`\n=== ${path.replace(process.env.USERPROFILE, "~")} (${hits.length} hits) ===`);
  hits.slice(0, 20).forEach((h, i) => {
    const preview = h.length > 20 ? `${h.slice(0, 14)}...${h.slice(-8)}` : h;
    console.log(`  [${i}] len=${h.length}: ${preview}`);
  });
}
