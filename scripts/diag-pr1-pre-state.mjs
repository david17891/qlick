// scripts/diag-pr1-pre-state.mjs
const res = await fetch(
  'https://api.supabase.com/v1/projects/ugpejblymtbwtsoiykyj/database/query',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN
    },
    body: JSON.stringify({
      query: `
        SELECT 'leads.archived_conversations_at' AS what, EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'leads'
            AND column_name = 'archived_conversations_at'
        ) AS ok
        UNION ALL SELECT 'leads.last_read_at', EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'leads'
            AND column_name = 'last_read_at'
        )
        UNION ALL SELECT 'bot_usage_daily', EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'bot_usage_daily'
        )
        UNION ALL SELECT 'soft_delete_conversation_tx', EXISTS (
          SELECT 1 FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = 'public' AND p.proname = 'soft_delete_conversation_tx'
        )
        UNION ALL SELECT 'enum manual_global', EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          JOIN pg_namespace n ON t.typnamespace = n.oid
          WHERE n.nspname = 'public' AND t.typname = 'bot_pause_reason'
            AND e.enumlabel = 'manual_global'
        )
        UNION ALL SELECT 'realtime on lead_whatsapp_conversations', EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = 'public'
            AND tablename = 'lead_whatsapp_conversations'
        );
      `
    })
  }
);
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
