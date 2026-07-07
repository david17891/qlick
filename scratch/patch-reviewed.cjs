const fs = require('fs');
const path = 'C:/Users/User/Documents/Click/src/types/supabase.ts';
let c = fs.readFileSync(path, 'utf8');

// Add reviewed_at + reviewed_by to event_surveys.Row
// Pattern: submitted_at: string (NOT nullable, in event_surveys.Row)
const rowRe = /(\s+submitted_at: string\n)(\s+\}\n)/;
c = c.replace(rowRe, '$1          reviewed_at: string | null\n          reviewed_by: string | null\n$2');

// Insert (submitted_at is the LAST field before "}")
const insertRe = /(\s+submitted_at\?: string\n)(\s+\}\n)/;
c = c.replace(insertRe, '$1          reviewed_at?: string | null\n          reviewed_by?: string | null\n$2');

// Update (same pattern)
const updateRe = /(\s+submitted_at\?: string\n)(\s+\}\n)/;
c = c.replace(updateRe, '$1          reviewed_at?: string | null\n          reviewed_by?: string | null\n$2');

fs.writeFileSync(path, c);
console.log('done');