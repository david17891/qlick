-- Permite a un administrador eliminar un lead y sus datos CRM asociados
-- desde Revisión humana. Los registros operativos de eventos y servicios
-- no se eliminan: conservan su historial y quedan desacoplados del lead.
create or replace function public.admin_delete_lead_cascade(
  p_lead_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_snapshot jsonb;
  deletion_counts jsonb;
begin
  if p_actor_email is null or btrim(p_actor_email) = '' then
    raise exception 'actor_email_required';
  end if;

  select to_jsonb(leads.*)
    into lead_snapshot
    from public.leads
   where id = p_lead_id;

  if lead_snapshot is null then
    return jsonb_build_object('ok', false, 'not_found', true);
  end if;

  select jsonb_build_object(
    'lead_whatsapp_conversations', (select count(*) from public.lead_whatsapp_conversations where lead_id = p_lead_id),
    'lead_whatsapp_log', (select count(*) from public.lead_whatsapp_log where lead_id = p_lead_id),
    'lead_recovery_campaigns', (select count(*) from public.lead_recovery_campaigns where lead_id = p_lead_id),
    'crm_notes', (select count(*) from public.crm_notes where lead_id = p_lead_id),
    'crm_tasks', (select count(*) from public.crm_tasks where lead_id = p_lead_id),
    'lead_interactions', (select count(*) from public.lead_interactions where lead_id = p_lead_id),
    'lead_event_links', (select count(*) from public.lead_event_links where lead_id = p_lead_id),
    'lead_consent_log', (select count(*) from public.lead_consent_log where lead_id = p_lead_id),
    'preserved_service_orders', (select count(*) from public.service_orders where lead_id = p_lead_id),
    'preserved_event_attendees', (select count(*) from public.event_attendees where lead_id = p_lead_id),
    'preserved_event_reminders', (select count(*) from public.event_reminder_log_v2 where lead_id = p_lead_id),
    'preserved_handoffs', (select count(*) from public.handoff_requests where lead_id = p_lead_id)
  ) into deletion_counts;

  delete from public.leads where id = p_lead_id;

  insert into public.admin_audit_log (
    actor_email,
    action,
    entity_type,
    entity_id,
    metadata,
    before,
    after
  ) values (
    p_actor_email,
    'lead_hard_deleted',
    'lead',
    p_lead_id::text,
    jsonb_build_object(
      'source', 'crm_human_review',
      'policy', 'crm_cascade_preserve_event_and_service_ledgers',
      'counts', deletion_counts
    ),
    lead_snapshot,
    null
  );

  return jsonb_build_object('ok', true, 'lead_id', p_lead_id, 'counts', deletion_counts);
end;
$$;

revoke all on function public.admin_delete_lead_cascade(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_lead_cascade(uuid, text) to service_role;
