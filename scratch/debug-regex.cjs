const fs = require('fs');
const c = fs.readFileSync('C:/Users/User/Documents/Click/src/types/supabase.ts','utf8');
const re = /(event_status: "draft" \| "published" \| "archived")\n(\s+)(interaction_channel:)/;
const m = c.match(re);
console.log('match:', !!m, 'index:', m?.index);
if (m) console.log('match content:', JSON.stringify(c.substring(m.index, m.index + 200)));