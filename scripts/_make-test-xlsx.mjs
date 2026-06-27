// scripts/_make-test-xlsx.mjs
//
// Genera un .xlsx de prueba con 5 filas para el wizard de import.
// Mismo formato que esperaría el importer (columnas ES).
//
// Uso: node scripts/_make-test-xlsx.mjs [outPath]
//   outPath default: scripts/_test-import.xlsx

import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const outPath = resolve(process.argv[2] ?? "scripts/_test-import.xlsx");

const rows = [
  // Fila 1: header del evento (debería ser skip'ada por el detector)
  // ... pero el importer solo busca las primeras 20 filas, así que la
  // header row suele estar en 1-3. Vamos a poner metadata en fila 0
  // para probar la auto-detección de headers.
  { "Evento de prueba": "", "": "", "": "" }, // fila 0 vacía
  { "Evento de prueba": "QA Fase 4 — Test Import", "": "", "": "" }, // fila 1 metadata
  { "Fecha": "2026-06-28", "": "", "": "" }, // fila 2 metadata
  { "": "", "": "", "": "" }, // fila 3 vacía
  // Fila 4: headers reales
  { "Nombre": "Email", "Teléfono": "Fuente" },
  // Filas 5-9: data
  { "Nombre": "Ana Pérez", "Email": "ana.perez@example.com", "Teléfono": "6861234567", "Fuente": "messenger" },
  { "Nombre": "Beto López", "Email": "beto.lopez@example.com", "Teléfono": "6862345678", "Fuente": "whatsapp" },
  { "Nombre": "Carla Ruiz", "Email": "carla.ruiz@example.com", "Teléfono": "6863456789", "Fuente": "form" },
  { "Nombre": "David Esparza", "Email": "david.test@example.com", "Teléfono": "6864567890", "Fuente": "manual" },
  { "Nombre": "Elena Vega", "Email": "elena.vega@example.com", "Teléfono": "6865678901", "Fuente": "messenger" },
];

// Convertimos a AOA (array of arrays) preservando solo las primeras 4 cols
const aoa = rows.map((r) => [
  r["Nombre"] ?? r["Evento de prueba"] ?? r["Fecha"] ?? "",
  r["Email"] ?? "",
  r["Teléfono"] ?? "",
  r["Fuente"] ?? "",
]);

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(aoa);
XLSX.utils.book_append_sheet(wb, ws, "Confirmados");

const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
writeFileSync(outPath, buffer);

console.log(`✅ .xlsx de prueba generado: ${outPath}`);
console.log(`   5 filas de datos (Ana, Beto, Carla, David, Elena)`);
console.log(`   4 filas de metadata arriba (header en fila 4)`);
console.log(`   Headers ES: Nombre | Email | Teléfono | Fuente`);
console.log(`   Tipo recomendado para probar: confirmation`);