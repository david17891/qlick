const fs = require('fs');
const path = 'C:/Users/User/Documents/Click/src/types/supabase.ts';
let c = fs.readFileSync(path, 'utf8');

// Use \r\n (Windows line endings — the typegen was generated on Windows)
const enumRe = /(event_status: "draft" \| "published" \| "archived")\r\r(\s+)(interaction_channel:)/;
const m = c.match(enumRe);
console.log('match:', !!m);

c = c.replace(enumRe, '$1\r\n$2event_format: "in_person" | "virtual" | "hybrid"\r\n$2event_streaming_provider:\r\n$2  | "youtube_live"\r\n$2  | "facebook_live"\r\n$2  | "zoom"\r\n$2  | "other"\r\n$2$3');

fs.writeFileSync(path, c);
console.log('done');