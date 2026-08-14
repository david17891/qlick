-- Supabase is the durable scheduler for payment follow-ups. Vercel Hobby
-- only supports one daily cron, so the HTTP invocation is scheduled in
-- pg_cron/pg_net after these extensions are enabled. The secret itself is
-- stored in Vault and is never committed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;
