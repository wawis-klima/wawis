-- v12.36 — jednorazowe uporządkowanie historycznej listy „Niewysłane”.
-- Użytkownik poprosił o hurtowe usunięcie wszystkich starych wpisów not_sent.
-- Stan deleted jest końcowy i generator kolejki nie odtwarza takiego wpisu.

update public.sms_log
set
  status = 'deleted',
  approved_at = coalesce(approved_at, now()),
  approved_by = coalesce(
    approved_by,
    (
      select p.id
      from public.profiles p
      where lower(coalesce(p.role, '')) in ('administrator', 'admin')
      order by p.created_at nulls last, p.id
      limit 1
    )
  )
where lower(btrim(coalesce(status, ''))) = 'not_sent'
  and provider_message_id is null
  and sent_at is null
  and delivered_at is null;
