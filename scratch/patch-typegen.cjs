const fs = require('fs');
const path = 'C:/Users/User/Documents/Click/src/types/supabase.ts';
let c = fs.readFileSync(path, 'utf8');

// 1) Add enums after event_status
const enumRe = /(\s+event_status: "draft" \| "published" \| "archived"\n)/;
c = c.replace(enumRe, '$1      event_format: "in_person" | "virtual" | "hybrid"\n      event_streaming_provider:\n        | "youtube_live"\n        | "facebook_live"\n        | "zoom"\n        | "other"\n');

// 2) Add columns to events.Row (after "location: string | null")
const rowRe = /(\s+location: string \| null\n)(\s+slug: string\n)/;
c = c.replace(rowRe, '$1          short_code: string | null\n          requires_name: boolean\n          survey_config: Json | null\n          format: Database\["public"\]\["Enums"\]\["event_format"\]\n          streaming_url: string | null\n          streaming_provider: Database\["public"\]\["Enums"\]\["event_streaming_provider"\] | null\n          streaming_access_note: string | null\n$2');

// 3) Add columns to events.Insert (after "location?: string | null")
const insertRe = /(\s+location\?: string \| null\n)(\s+slug: string\n)/;
c = c.replace(insertRe, '$1          short_code?: string | null\n          requires_name?: boolean\n          survey_config?: Json | null\n          format?: Database\["public"\]\["Enums"\]\["event_format"\]\n          streaming_url?: string | null\n          streaming_provider?: Database\["public"\]\["Enums"\]\["event_streaming_provider"\] | null\n          streaming_access_note?: string | null\n$2');

// 4) Add columns to events.Update (after "location?: string | null")
const updateRe = /(\s+location\?: string \| null\n)(\s+slug\?: string\n)/;
c = c.replace(updateRe, '$1          short_code?: string | null\n          requires_name?: boolean\n          survey_config?: Json | null\n          format?: Database\["public"\]\["Enums"\]\["event_format"\]\n          streaming_url?: string | null\n          streaming_provider?: Database\["public"\]\["Enums"\]\["event_streaming_provider"\] | null\n          streaming_access_note?: string | null\n$2');

fs.writeFileSync(path, c);
console.log('done');