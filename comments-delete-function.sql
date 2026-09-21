-- Uruchom w Supabase SQL Editor, żeby administrator mógł usuwać komentarze
-- z sekcji „Komentarze i pytania” bez problemów z politykami RLS.

create or replace function public.admin_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_deleted integer;
begin
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Administrator'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Brak uprawnień administratora do usunięcia komentarza.';
  end if;

  delete from public.comments
  where id = p_comment_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

grant execute on function public.admin_delete_comment(uuid) to authenticated;
