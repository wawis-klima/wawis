create or replace function public.save_job_contractor_nip(
  p_contractor_id uuid,
  p_nip text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_current text;
  v_next text := nullif(regexp_replace(coalesce(p_nip, ''), '[^0-9]', '', 'g'), '');
begin
  if auth.uid() is null then
    raise exception 'Brak aktywnej sesji.';
  end if;

  select p.role
  into v_role
  from public.profiles p
  where p.id = auth.uid();

  if coalesce(v_role, '') not in ('Pracownik', 'Administrator', 'admin') then
    raise exception 'Brak uprawnień do zapisu NIP klienta.';
  end if;

  if p_contractor_id is null then
    raise exception 'Brak identyfikatora klienta.';
  end if;

  select nullif(regexp_replace(coalesce(c.nip, ''), '[^0-9]', '', 'g'), '')
  into v_current
  from public.contractors c
  where c.id = p_contractor_id
  for update;

  if not found then
    raise exception 'Nie znaleziono klienta.';
  end if;

  if v_role = 'Pracownik' then
    if not exists (
      select 1
      from public.jobs j
      where j.contractor_id = p_contractor_id
    ) then
      raise exception 'Pracownik może uzupełnić NIP tylko klienta powiązanego z montażem.';
    end if;

    if v_next is null then
      return v_current;
    end if;

    if v_current is not null and v_current <> v_next then
      raise exception 'NIP klienta jest już zapisany inaczej. Zmianę może wykonać administrator.';
    end if;
  end if;

  update public.contractors
  set nip = v_next,
      updated_at = timezone('utc', now())
  where id = p_contractor_id
  returning nullif(regexp_replace(coalesce(nip, ''), '[^0-9]', '', 'g'), '')
  into v_current;

  return v_current;
end;
$$;

revoke all on function public.save_job_contractor_nip(uuid, text) from public;
revoke execute on function public.save_job_contractor_nip(uuid, text) from anon;
grant execute on function public.save_job_contractor_nip(uuid, text) to authenticated, service_role;
