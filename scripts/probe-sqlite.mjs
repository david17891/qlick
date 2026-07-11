// Probe SQLite tables
import Database from 'better-sqlite3';
const db = new Database('C:/Users/User/.mavis/sqlite.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
for (const t of tables) {
  try {
    const c = db.prepare('SELECT COUNT(*) as c FROM "' + t.name + '"').get();
    console.log(`${t.name}\t${c.c}`);
  } catch (e) {
    console.log(`${t.name}\tERROR ${e.message.slice(0, 80)}`);
  }
}
db.close();
