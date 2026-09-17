-- Globally ordered ownership epochs; endpoint generation retains its original scope.
create sequence if not exists private.push_context_epoch_seq;
alter table public.push_subscriptions add column if not exists context_epoch bigint;
update public.push_subscriptions set context_epoch=nextval('private.push_context_epoch_seq') where context_epoch is null;
alter table public.push_subscriptions alter column context_epoch set not null;
create or replace function private.assign_push_context_epoch()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    new.context_epoch := nextval('private.push_context_epoch_seq');
  elsif old.user_id is distinct from new.user_id
     or old.lifecycle_token is distinct from new.lifecycle_token
     or (not old.is_active and new.is_active) then
    new.context_epoch := nextval('private.push_context_epoch_seq');
  else
    new.context_epoch := old.context_epoch;
  end if;
  return new;
end;$$;
revoke all on sequence private.push_context_epoch_seq from public, anon, authenticated;
revoke all on function private.assign_push_context_epoch() from public, anon, authenticated;
drop trigger if exists push_context_epoch on public.push_subscriptions;
create trigger push_context_epoch before insert or update on public.push_subscriptions
for each row execute function private.assign_push_context_epoch();
