-- Hardening aditivo: las RPC SECURITY DEFINER sensibles son server-only.
-- Las rutas que las utilizan crean el cliente Supabase con service_role.
-- No se modifica la lógica ni se eliminan datos.

revoke all on function public.get_user_id_by_email(text)
  from public, anon, authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;

revoke all on function public.issue_event_certificate(
  uuid, uuid, text, text, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.issue_event_certificate(
  uuid, uuid, text, text, jsonb, uuid
) to service_role;

revoke all on function public.soft_delete_conversation_tx(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.soft_delete_conversation_tx(
  uuid, text, text
) to service_role;

-- Evita que la RPC de borrado dependa del search_path del invocador.
alter function public.soft_delete_conversation_tx(uuid, text, text)
  set search_path = public;
