-- Allow orphan Meta delivery/status rows to be retained in the WhatsApp log.
-- The webhook uses this type only when a status arrives before its original
-- message; regular inbound/outbound rows keep the original message types.

alter table public.lead_whatsapp_conversations
  drop constraint if exists lead_whatsapp_conversations_message_type_check;

alter table public.lead_whatsapp_conversations
  add constraint lead_whatsapp_conversations_message_type_check
  check (
    message_type in (
      'text',
      'template',
      'image',
      'document',
      'audio',
      'interactive',
      'status_update'
    )
  );
