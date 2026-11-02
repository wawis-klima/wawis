-- WAWIS 14.08 — naklejki QR urządzeń (decyzja właściciela 02.11.2026).
-- Naklejka przypisana do URZĄDZENIA (public.devices); instalacja multi = jedno urządzenie = jedna naklejka.
-- Pracownik przypisuje przy montażu (opcjonalnie, tylko zlecenie, które może edytować);
-- administrator także w serwisie, a tylko on może przepisać naklejkę lub ją zwolnić.
-- Tabele bez bezpośredniego dostępu klientów API — wyłącznie przez funkcje poniżej.
-- Bez zmian istniejących tabel, danych klientów, RLS innych tabel i Storage.

create table if not exists public.qr_stickers (
  code text primary key check (code ~ '^[2-9A-HJKMNP-Z]{8}$'),
  batch text not null,
  device_id uuid unique references public.devices(id) on delete set null,
  assigned_by uuid,
  assigned_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.qr_sticker_events (
  id bigserial primary key,
  code text not null references public.qr_stickers(code) on delete cascade,
  action text not null check (action in ('assign', 'reassign', 'unassign')),
  device_id uuid,
  previous_device_id uuid,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists qr_sticker_events_code_idx on public.qr_sticker_events(code, created_at desc);

alter table public.qr_stickers enable row level security;
alter table public.qr_sticker_events enable row level security;
revoke all on table public.qr_stickers, public.qr_sticker_events from public, anon, authenticated;
grant select on table public.qr_stickers, public.qr_sticker_events to service_role;
revoke all on sequence public.qr_sticker_events_id_seq from public, anon, authenticated;

insert into public.qr_stickers(code, batch) values
  ('UYE8EYCQ','partia-1'),
  ('BNKJXZDY','partia-1'),
  ('CXFBEHEP','partia-1'),
  ('S2A7KTAV','partia-1'),
  ('EGNBZQ2N','partia-1'),
  ('P6PM8JBE','partia-1'),
  ('HCU2W92K','partia-1'),
  ('Z7JNJWSG','partia-1'),
  ('PUB4BG8U','partia-1'),
  ('ZRMKBTQN','partia-1'),
  ('A7GKKETT','partia-1'),
  ('N9UTB877','partia-1'),
  ('XHZN7Z9A','partia-1'),
  ('FCZC5U6N','partia-1'),
  ('STAAJJ86','partia-1'),
  ('UYKVE76Q','partia-1'),
  ('5QGDDWZC','partia-1'),
  ('VQC36BXG','partia-1'),
  ('6U9SD7AN','partia-1'),
  ('28Z33VKQ','partia-1'),
  ('WCXYP24T','partia-1'),
  ('HQHEAF98','partia-1'),
  ('2EKWQS4B','partia-1'),
  ('TCBNXSZ8','partia-1'),
  ('HZHTM36R','partia-1'),
  ('NHYTTSZT','partia-1'),
  ('T5MGSWDN','partia-1'),
  ('2DC95VNX','partia-1'),
  ('XSHWQ9RK','partia-1'),
  ('3536WH5H','partia-1'),
  ('VRS4CERE','partia-1'),
  ('FXDUGEJV','partia-1'),
  ('24TVV9NF','partia-1'),
  ('5DXNQWVZ','partia-1'),
  ('53DCS2VZ','partia-1'),
  ('4WRYMM7F','partia-1'),
  ('74K6YW5Y','partia-1'),
  ('TRXKRDXB','partia-1'),
  ('QCUSKXSW','partia-1'),
  ('8C6HSER9','partia-1'),
  ('Y5FEPN5W','partia-1'),
  ('ZMKGKRHY','partia-1'),
  ('K8Q86JUT','partia-1'),
  ('VYG8ES78','partia-1'),
  ('JEXZ2EAX','partia-1'),
  ('GZB7ZG6E','partia-1'),
  ('RUHR44AP','partia-1'),
  ('QCHS5M49','partia-1'),
  ('NDXHE5EQ','partia-1'),
  ('UNUTKS48','partia-1'),
  ('XAHXDUM5','partia-1'),
  ('T82ASWRD','partia-1'),
  ('9WJBB7Y4','partia-1'),
  ('DZGKM2Z3','partia-1'),
  ('W4EGUTH9','partia-1'),
  ('QE2UZP5H','partia-1'),
  ('399ZQHDD','partia-1'),
  ('8G442AB3','partia-1'),
  ('82H52DFK','partia-1'),
  ('UJPHHCAR','partia-1'),
  ('D6YHB3EV','partia-1'),
  ('3NCY8BVP','partia-1'),
  ('GRAA87ZP','partia-1'),
  ('WYH6MCEH','partia-1'),
  ('RNPQAC9E','partia-1'),
  ('NSK2HBJ8','partia-1'),
  ('7FESNR4N','partia-1'),
  ('TGWP4D94','partia-1'),
  ('56SYWE2G','partia-1'),
  ('QVB8XD56','partia-1'),
  ('CZ42B8B9','partia-1'),
  ('ECJGMUR2','partia-1'),
  ('BNG4Y827','partia-1'),
  ('58QQH7YD','partia-1'),
  ('2M39C5G2','partia-1'),
  ('52CXG9KB','partia-1'),
  ('D4JX4RMX','partia-1'),
  ('HGXQYXVK','partia-1'),
  ('X9PMRDGR','partia-1'),
  ('VV7YJ5E8','partia-1'),
  ('RUENMDF6','partia-1'),
  ('53N7G46M','partia-1'),
  ('BU89J3YS','partia-1'),
  ('M72AE9A3','partia-1'),
  ('PB94YMXM','partia-1'),
  ('KKWN39W6','partia-1'),
  ('ZC75J2DG','partia-1'),
  ('2RGGZK8Y','partia-1'),
  ('ZEP3T9QN','partia-1'),
  ('FUDQRWXU','partia-1'),
  ('PX5AXBMM','partia-1'),
  ('498DTEN8','partia-1'),
  ('PDEEWVC4','partia-1'),
  ('KMBFGRJU','partia-1'),
  ('434T4DZS','partia-1'),
  ('YU48W57E','partia-1'),
  ('BCNJCJUZ','partia-1'),
  ('3JJ29736','partia-1'),
  ('3RKCQGEU','partia-1'),
  ('5YYM6MVZ','partia-1'),
  ('6N9WYA5J','partia-1'),
  ('MNBYKH3R','partia-1'),
  ('ZXZ8JFKD','partia-1'),
  ('ZBD45ZEA','partia-1'),
  ('HP5DRVRA','partia-1'),
  ('WHZVTSZZ','partia-1'),
  ('JU8JP9KC','partia-1'),
  ('75PF5FSJ','partia-1'),
  ('KXNR8EMC','partia-1'),
  ('HHM4TY2Q','partia-1'),
  ('AV8VS77M','partia-1'),
  ('2EJBD2DF','partia-1'),
  ('DJTCFDF4','partia-1'),
  ('K4S8J29A','partia-1'),
  ('FFH87U5F','partia-1'),
  ('22JKYHXT','partia-1'),
  ('ZF446ZPT','partia-1'),
  ('G2TPGYBM','partia-1'),
  ('X3W9J78G','partia-1'),
  ('C9T4ZCY4','partia-1'),
  ('QCZR4S6T','partia-1'),
  ('XBBV5U2P','partia-1'),
  ('JGVC6JPS','partia-1'),
  ('NDHRS8WF','partia-1'),
  ('DU9WFKJE','partia-1'),
  ('6JTNMWUW','partia-1'),
  ('UR7KHUBJ','partia-1'),
  ('X7V333W9','partia-1'),
  ('QFG4JA6D','partia-1'),
  ('W8F2NV9R','partia-1'),
  ('VY4GW8KH','partia-1'),
  ('DUNF85P7','partia-1'),
  ('5QB49UKR','partia-1'),
  ('ZUR2XKQD','partia-1'),
  ('B8YJQ6G5','partia-1'),
  ('KUYB4EXZ','partia-1'),
  ('NX353RC6','partia-1'),
  ('34V6RH95','partia-1'),
  ('5KRHHB9G','partia-1'),
  ('G3V9A2P6','partia-1'),
  ('VKWS7P5K','partia-1'),
  ('USTMNZ5B','partia-1'),
  ('YFDUFX2K','partia-1'),
  ('VMSS7NXW','partia-1'),
  ('TSR9E8YP','partia-1'),
  ('VRWET64V','partia-1'),
  ('TK8Q7ZB8','partia-1'),
  ('A9V42D2Q','partia-1'),
  ('VKRW77BM','partia-1'),
  ('N8VFGR82','partia-1'),
  ('6NWKGJK9','partia-1'),
  ('DVFFEP3R','partia-1'),
  ('WMF9JTCY','partia-1'),
  ('N27NQSQ2','partia-1'),
  ('4FBXWU4S','partia-1'),
  ('PVYEVRNB','partia-1'),
  ('K8RM3TJ8','partia-1'),
  ('REEDB5XA','partia-1'),
  ('349A4UB4','partia-1'),
  ('QUKABS53','partia-1'),
  ('XF6YRNPM','partia-1'),
  ('4C4QQEKE','partia-1'),
  ('C45N9DGT','partia-2'),
  ('6UUAK332','partia-2'),
  ('V8GJT9E7','partia-2'),
  ('TC6TJDWZ','partia-2'),
  ('YWB37FSG','partia-2'),
  ('69W6P6CS','partia-2'),
  ('VG3SZC22','partia-2'),
  ('DMRSN66K','partia-2'),
  ('BAF3VRXY','partia-2'),
  ('JT82586B','partia-2'),
  ('GC6TXNB2','partia-2'),
  ('KZK74PHR','partia-2'),
  ('KYS5A2C2','partia-2'),
  ('7JWTH68A','partia-2'),
  ('299EA6DU','partia-2'),
  ('JVZZZZ4N','partia-2'),
  ('K6YXHS9J','partia-2'),
  ('M66FV5HD','partia-2'),
  ('QE23EMBF','partia-2'),
  ('CDP8GU9E','partia-2'),
  ('QUFKCZQ8','partia-2'),
  ('BQDXUFXA','partia-2'),
  ('QAC4FUW5','partia-2'),
  ('ZG24FWDT','partia-2'),
  ('GWN3WQZK','partia-2'),
  ('XMZ3UX2Y','partia-2'),
  ('26RAQ4VM','partia-2'),
  ('X4V7M2CC','partia-2'),
  ('7TGDUFM3','partia-2'),
  ('Z8EG57A6','partia-2'),
  ('NHVCMCKK','partia-2'),
  ('XZ36RNHS','partia-2'),
  ('A3JBCF2E','partia-2'),
  ('97H9TJT7','partia-2'),
  ('2E6XYSSU','partia-2'),
  ('6XJZS9PM','partia-2'),
  ('C5K4N5D3','partia-2'),
  ('3ZF9UJTJ','partia-2'),
  ('8CRBVK5S','partia-2'),
  ('95PNNZJ6','partia-2'),
  ('5972JPK3','partia-2'),
  ('97MJQGND','partia-2'),
  ('KGKWFBHV','partia-2'),
  ('XGYBPR6A','partia-2'),
  ('UPQWVXXS','partia-2'),
  ('8FMV7ZZ2','partia-2'),
  ('UHKHDJ6K','partia-2'),
  ('BMMPAJQM','partia-2'),
  ('A336H9YK','partia-2'),
  ('9F8XS2HA','partia-2'),
  ('2TTSNA4N','partia-2'),
  ('WWJSTPXH','partia-2'),
  ('6YKFDW6D','partia-2'),
  ('WCGF57FM','partia-2'),
  ('3FEA9NU6','partia-2'),
  ('F7A8NV3U','partia-2'),
  ('2F5C5Q6Q','partia-2'),
  ('2XCM56SU','partia-2'),
  ('NHYMRP78','partia-2'),
  ('QEGUUUDC','partia-2'),
  ('5N973XPJ','partia-2'),
  ('BUEC84DB','partia-2'),
  ('53C2YKQC','partia-2'),
  ('V3W7PA7V','partia-2'),
  ('8SW9SJX8','partia-2'),
  ('3KTF25CH','partia-2'),
  ('D2YCK3XR','partia-2'),
  ('HE749BPE','partia-2'),
  ('2J75KUG6','partia-2'),
  ('SPDDS5K8','partia-2'),
  ('6FERYP3D','partia-2'),
  ('6BUX3HPA','partia-2'),
  ('456D8SSD','partia-2'),
  ('5STVWFPS','partia-2'),
  ('DZZZ6ZG5','partia-2'),
  ('7VBPG9FH','partia-2'),
  ('V58AHR7V','partia-2'),
  ('F8QX6W6N','partia-2'),
  ('ST3DB22V','partia-2'),
  ('HH9RYSMU','partia-2'),
  ('MA2SVCGH','partia-2'),
  ('78M2KW7E','partia-2'),
  ('TMRZ54UB','partia-2'),
  ('W5UQN35X','partia-2'),
  ('FFURZNDR','partia-2'),
  ('ZC2TXUTA','partia-2'),
  ('4C2YKZ7X','partia-2'),
  ('PBGQTJVT','partia-2'),
  ('2YJWR654','partia-2'),
  ('A6XEDVTW','partia-2'),
  ('2MEJPPZD','partia-2'),
  ('Z4EB5YN5','partia-2'),
  ('3MJYF8WU','partia-2'),
  ('J5NNM4VD','partia-2'),
  ('W2WUU7CB','partia-2'),
  ('AV489RM3','partia-2'),
  ('8R5GVRKY','partia-2'),
  ('5CF76ZVC','partia-2'),
  ('7EZQQXMW','partia-2'),
  ('RCCUAWWS','partia-2'),
  ('FQNEGHJC','partia-2'),
  ('4FRWTDWJ','partia-2'),
  ('UN9T7M2U','partia-2'),
  ('HDVCNU2W','partia-2'),
  ('U6PAUNTF','partia-2'),
  ('K2TQPU7M','partia-2'),
  ('CEB4DDDN','partia-2'),
  ('UMS467EM','partia-2'),
  ('MMKPKY56','partia-2'),
  ('ZBRD2UNC','partia-2'),
  ('8RWUGNMR','partia-2'),
  ('FVE53XSP','partia-2'),
  ('A6TAU6CQ','partia-2'),
  ('54DMX984','partia-2'),
  ('XZZB3UTK','partia-2'),
  ('WYBC3DAP','partia-2'),
  ('VSJ75PS6','partia-2'),
  ('EVGQ6J3T','partia-2'),
  ('Y3WY4KCA','partia-2'),
  ('XHJD3MYB','partia-2'),
  ('ESH9Z2JM','partia-2'),
  ('VWRXGZXF','partia-2'),
  ('8X3AKV2U','partia-2'),
  ('6RD3W5V4','partia-2'),
  ('GJ6YTMQG','partia-2'),
  ('G2RCRY2F','partia-2'),
  ('YVCRWBEG','partia-2'),
  ('VF95HQT9','partia-2'),
  ('YFM3X9KC','partia-2'),
  ('XUH8TV9E','partia-2'),
  ('UP6U329B','partia-2'),
  ('GSWH6X7P','partia-2'),
  ('94XCE98K','partia-2'),
  ('PVNB82TC','partia-2'),
  ('WFK35586','partia-2'),
  ('JDH5HHPP','partia-2'),
  ('EJVWA57T','partia-2'),
  ('C46YCXKE','partia-2'),
  ('UBXUMZPY','partia-2'),
  ('X8EV8W6W','partia-2'),
  ('Z6ANUPSB','partia-2'),
  ('CNJDPBPB','partia-2'),
  ('ATXATE9W','partia-2'),
  ('6296YZDP','partia-2'),
  ('E2H96ZKD','partia-2'),
  ('MEWTMDBC','partia-2'),
  ('KU2H9T7S','partia-2'),
  ('PCVZUXPP','partia-2'),
  ('QSMTAN4D','partia-2'),
  ('3FUF2H2Z','partia-2'),
  ('QV4NW9PC','partia-2'),
  ('A3JBZXKB','partia-2'),
  ('C5E8TXWW','partia-2'),
  ('NXNSUSWV','partia-2'),
  ('34KYX5P6','partia-2'),
  ('26RW77XA','partia-2'),
  ('ZCD777CF','partia-2'),
  ('C3K9N7MZ','partia-2'),
  ('57H8X72M','partia-2'),
  ('TZ4FZT7E','partia-2'),
  ('WYXVVQYY','partia-2'),
  ('9EV6CWSB','partia-2')
on conflict (code) do nothing;

create or replace function private.qr_sticker_normalize(p_code text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g')) ~ '^[2-9A-HJKMNP-Z]{8}$'
      then upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'))
    else null
  end
$$;

create or replace function private.qr_sticker_device_info(p_device_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select pg_catalog.jsonb_build_object(
    'device_id', d.id,
    'model', d.model,
    'serial_number', d.serial_number,
    'installation_date', d.installation_date,
    'source_job_id', d.source_job_id,
    'job_id', j.id,
    'device_index', case
      when d.source_job_id ~ '::device-[0-9]+$' then substring(d.source_job_id from '::device-([0-9]+)$')::integer
      when j.id is not null then 1
      else null
    end,
    'contractor_id', d.contractor_id,
    'contractor_name', coalesce(nullif(btrim(c.company_name), ''), nullif(btrim(c.contact_person), '')),
    'contractor_phone', c.phone,
    'client', coalesce(nullif(btrim(j.client), ''), nullif(btrim(c.company_name), ''), nullif(btrim(c.contact_person), '')),
    'city', coalesce(nullif(btrim(j.city), ''), c.city),
    'street', coalesce(nullif(btrim(j.street), ''), c.street)
  )
  from public.devices d
  left join public.jobs j on j.id::text = split_part(coalesce(d.source_job_id, ''), '::', 1)
  left join public.contractors c on c.id = d.contractor_id
  where d.id = p_device_id
$$;
revoke all on function private.qr_sticker_device_info(uuid) from public, anon, authenticated;

create or replace function private.qr_sticker_assign(p_code text, p_device_id uuid, p_replace boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code text := private.qr_sticker_normalize(p_code);
  v_sticker public.qr_stickers%rowtype;
  v_existing_code text;
  v_is_admin boolean := public.current_user_is_admin();
  v_actor uuid := auth.uid();
begin
  if v_code is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_code');
  end if;
  if p_device_id is null or not exists (select 1 from public.devices where id = p_device_id) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_found');
  end if;

  select * into v_sticker from public.qr_stickers where code = v_code for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unknown_code', 'code', v_code);
  end if;

  if v_sticker.device_id = p_device_id then
    return pg_catalog.jsonb_build_object('ok', true, 'code', v_code, 'device_id', p_device_id, 'already', true);
  end if;

  if v_sticker.device_id is not null and not (v_is_admin and coalesce(p_replace, false)) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'sticker_taken', 'code', v_code, 'target_device_id', p_device_id,
      'device', private.qr_sticker_device_info(v_sticker.device_id),
      'can_replace', v_is_admin
    );
  end if;

  select code into v_existing_code from public.qr_stickers where device_id = p_device_id for update;
  if v_existing_code is not null and not (v_is_admin and coalesce(p_replace, false)) then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'device_has_sticker', 'code', v_code, 'existing_code', v_existing_code,
      'target_device_id', p_device_id,
      'can_replace', v_is_admin
    );
  end if;

  if v_existing_code is not null then
    update public.qr_stickers set device_id = null, assigned_by = v_actor, assigned_at = now() where code = v_existing_code;
    insert into public.qr_sticker_events(code, action, device_id, previous_device_id, actor)
      values (v_existing_code, 'unassign', null, p_device_id, v_actor);
  end if;

  update public.qr_stickers
    set device_id = p_device_id, assigned_by = v_actor, assigned_at = now()
    where code = v_code;
  insert into public.qr_sticker_events(code, action, device_id, previous_device_id, actor)
    values (v_code, case when v_sticker.device_id is null then 'assign' else 'reassign' end,
            p_device_id, v_sticker.device_id, v_actor);

  return pg_catalog.jsonb_build_object(
    'ok', true, 'code', v_code, 'device_id', p_device_id,
    'replaced_code', v_existing_code, 'previous_device_id', v_sticker.device_id
  );
end;
$$;
revoke all on function private.qr_sticker_assign(text, uuid, boolean) from public, anon, authenticated;

create or replace function public.qr_sticker_lookup(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_code text := private.qr_sticker_normalize(p_code);
  v_sticker public.qr_stickers%rowtype;
begin
  if not public.current_user_is_staff() then
    raise exception 'Brak uprawnień.' using errcode = '42501';
  end if;
  if v_code is null then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'invalid');
  end if;
  select * into v_sticker from public.qr_stickers where code = v_code;
  if not found then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'unknown', 'code', v_code);
  end if;
  if v_sticker.device_id is null then
    return pg_catalog.jsonb_build_object('ok', true, 'status', 'free', 'code', v_code);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', true, 'status', 'assigned', 'code', v_code,
    'assigned_at', v_sticker.assigned_at,
    'device', private.qr_sticker_device_info(v_sticker.device_id)
  );
end;
$$;

create or replace function public.qr_sticker_assign_job_device(p_code text, p_job_id uuid, p_device_index integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_device_id uuid;
begin
  if not public.current_user_can_edit_job(p_job_id) then
    raise exception 'Brak uprawnień do edycji tego zlecenia.' using errcode = '42501';
  end if;
  if p_device_index is null or p_device_index < 1 or p_device_index > 50 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_saved');
  end if;
  select d.id into v_device_id
  from public.devices d
  where d.source_job_id = case when p_device_index = 1 then p_job_id::text
                               else p_job_id::text || '::device-' || p_device_index::text end;
  if v_device_id is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'device_not_saved');
  end if;
  return private.qr_sticker_assign(p_code, v_device_id, false);
end;
$$;

create or replace function public.qr_sticker_assign_device(p_code text, p_device_id uuid, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może przypisać naklejkę do urządzenia z listy.' using errcode = '42501';
  end if;
  return private.qr_sticker_assign(p_code, p_device_id, p_replace);
end;
$$;

create or replace function public.qr_sticker_unassign(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_code text := private.qr_sticker_normalize(p_code);
  v_device uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zwolnić naklejkę.' using errcode = '42501';
  end if;
  select device_id into v_device from public.qr_stickers where code = v_code for update;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;
  if v_device is null then
    return pg_catalog.jsonb_build_object('ok', true, 'code', v_code, 'already', true);
  end if;
  update public.qr_stickers set device_id = null, assigned_by = auth.uid(), assigned_at = now() where code = v_code;
  insert into public.qr_sticker_events(code, action, device_id, previous_device_id, actor)
    values (v_code, 'unassign', null, v_device, auth.uid());
  return pg_catalog.jsonb_build_object('ok', true, 'code', v_code, 'previous_device_id', v_device);
end;
$$;

create or replace function public.qr_stickers_for_job(p_job_id uuid)
returns table(device_index integer, code text)
language sql
stable
security definer
set search_path to ''
as $$
  select
    case when d.source_job_id ~ '::device-[0-9]+$'
      then substring(d.source_job_id from '::device-([0-9]+)$')::integer else 1 end,
    s.code
  from public.qr_stickers s
  join public.devices d on d.id = s.device_id
  where public.current_user_is_staff()
    and p_job_id is not null
    and (d.source_job_id = p_job_id::text or d.source_job_id like p_job_id::text || '::device-%')
  order by 1
$$;

create or replace function public.qr_stickers_for_devices(p_device_ids uuid[])
returns table(device_id uuid, code text)
language sql
stable
security definer
set search_path to ''
as $$
  select s.device_id, s.code
  from public.qr_stickers s
  where public.current_user_is_admin()
    and s.device_id = any(coalesce(p_device_ids, array[]::uuid[]))
$$;

revoke all on function public.qr_sticker_lookup(text), public.qr_sticker_assign_job_device(text, uuid, integer),
  public.qr_sticker_assign_device(text, uuid, boolean), public.qr_sticker_unassign(text),
  public.qr_stickers_for_job(uuid), public.qr_stickers_for_devices(uuid[]) from public, anon;
grant execute on function public.qr_sticker_lookup(text), public.qr_sticker_assign_job_device(text, uuid, integer),
  public.qr_sticker_assign_device(text, uuid, boolean), public.qr_sticker_unassign(text),
  public.qr_stickers_for_job(uuid), public.qr_stickers_for_devices(uuid[]) to authenticated, service_role;
