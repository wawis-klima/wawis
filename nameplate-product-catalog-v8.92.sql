-- Wawis 8.92: centralny katalog EAN/GTIN dla tabliczek znamionowych.
-- Katalog jest dostępny wyłącznie dla administratora. Zapis urządzenia i OCR
-- nadal działa niezależnie; brak katalogu nie blokuje podstawowej funkcji aplikacji.

begin;

create table if not exists public.nameplate_product_catalog (
  ean text primary key,
  manufacturer text not null,
  family text,
  model_code text,
  model_name text not null,
  capacity_kw numeric(7,2),
  unit_type text not null default 'unknown',
  revision text,
  source_type text not null default 'manual',
  source_reference text,
  verified boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nameplate_product_catalog_ean_check check (ean ~ '^[0-9]{13}$'),
  constraint nameplate_product_catalog_unit_type_check check (unit_type in ('indoor', 'outdoor', 'unknown')),
  constraint nameplate_product_catalog_source_type_check check (
    source_type in ('manual', 'confirmed_scan', 'import', 'manufacturer', 'gs1', 'local_dictionary')
  )
);

create index if not exists nameplate_product_catalog_model_code_idx
  on public.nameplate_product_catalog (upper(model_code))
  where model_code is not null;

create index if not exists nameplate_product_catalog_manufacturer_idx
  on public.nameplate_product_catalog (lower(manufacturer));

alter table public.nameplate_product_catalog enable row level security;

drop policy if exists nameplate_product_catalog_admin_select on public.nameplate_product_catalog;
drop policy if exists nameplate_product_catalog_admin_insert on public.nameplate_product_catalog;
drop policy if exists nameplate_product_catalog_admin_update on public.nameplate_product_catalog;
drop policy if exists nameplate_product_catalog_admin_delete on public.nameplate_product_catalog;

create policy nameplate_product_catalog_admin_select
on public.nameplate_product_catalog
for select
to authenticated
using (public.current_user_is_admin());

create policy nameplate_product_catalog_admin_insert
on public.nameplate_product_catalog
for insert
to authenticated
with check (public.current_user_is_admin());

create policy nameplate_product_catalog_admin_update
on public.nameplate_product_catalog
for update
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

create policy nameplate_product_catalog_admin_delete
on public.nameplate_product_catalog
for delete
to authenticated
using (public.current_user_is_admin());

create or replace function public.admin_upsert_nameplate_product(
  p_ean text,
  p_manufacturer text,
  p_family text default null,
  p_model_code text default null,
  p_model_name text default null,
  p_capacity_kw numeric default null,
  p_unit_type text default 'unknown',
  p_revision text default null,
  p_source_type text default 'manual',
  p_source_reference text default null,
  p_verified boolean default true
)
returns public.nameplate_product_catalog
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ean text := regexp_replace(coalesce(p_ean, ''), '[^0-9]', '', 'g');
  v_unit_type text := lower(trim(coalesce(p_unit_type, 'unknown')));
  v_source_type text := lower(trim(coalesce(p_source_type, 'manual')));
  v_row public.nameplate_product_catalog;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może zapisywać katalog EAN.';
  end if;

  if v_ean !~ '^[0-9]{13}$' then
    raise exception 'EAN/GTIN musi zawierać dokładnie 13 cyfr.';
  end if;

  if coalesce(trim(p_manufacturer), '') = '' then
    raise exception 'Marka jest wymagana.';
  end if;

  if coalesce(trim(p_model_name), '') = '' then
    raise exception 'Nazwa modelu jest wymagana.';
  end if;

  if v_unit_type not in ('indoor', 'outdoor', 'unknown') then
    raise exception 'Nieprawidłowy typ jednostki: %', p_unit_type;
  end if;

  if v_source_type not in ('manual', 'confirmed_scan', 'import', 'manufacturer', 'gs1', 'local_dictionary') then
    v_source_type := 'manual';
  end if;

  insert into public.nameplate_product_catalog (
    ean,
    manufacturer,
    family,
    model_code,
    model_name,
    capacity_kw,
    unit_type,
    revision,
    source_type,
    source_reference,
    verified,
    created_by,
    updated_at
  ) values (
    v_ean,
    trim(p_manufacturer),
    nullif(trim(coalesce(p_family, '')), ''),
    nullif(upper(trim(coalesce(p_model_code, ''))), ''),
    trim(p_model_name),
    p_capacity_kw,
    v_unit_type,
    nullif(upper(trim(coalesce(p_revision, ''))), ''),
    v_source_type,
    nullif(trim(coalesce(p_source_reference, '')), ''),
    coalesce(p_verified, true),
    auth.uid(),
    now()
  )
  on conflict (ean) do update
  set manufacturer = excluded.manufacturer,
      family = coalesce(excluded.family, public.nameplate_product_catalog.family),
      model_code = coalesce(excluded.model_code, public.nameplate_product_catalog.model_code),
      model_name = excluded.model_name,
      capacity_kw = coalesce(excluded.capacity_kw, public.nameplate_product_catalog.capacity_kw),
      unit_type = case
        when excluded.unit_type = 'unknown' then public.nameplate_product_catalog.unit_type
        else excluded.unit_type
      end,
      revision = coalesce(excluded.revision, public.nameplate_product_catalog.revision),
      source_type = excluded.source_type,
      source_reference = coalesce(excluded.source_reference, public.nameplate_product_catalog.source_reference),
      verified = public.nameplate_product_catalog.verified or excluded.verified,
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.admin_import_nameplate_products(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_imported integer := 0;
  v_invalid integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_ean text;
  v_capacity numeric;
begin
  if not public.current_user_is_admin() then
    raise exception 'Tylko administrator może importować katalog EAN.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Import katalogu wymaga tablicy JSON.';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      v_ean := regexp_replace(coalesce(v_item->>'ean', ''), '[^0-9]', '', 'g');
      v_capacity := nullif(replace(regexp_replace(coalesce(v_item->>'capacity_kw', ''), '[^0-9,.]', '', 'g'), ',', '.'), '')::numeric;

      perform public.admin_upsert_nameplate_product(
        v_ean,
        v_item->>'manufacturer',
        v_item->>'family',
        v_item->>'model_code',
        v_item->>'model_name',
        v_capacity,
        coalesce(v_item->>'unit_type', 'unknown'),
        v_item->>'revision',
        coalesce(v_item->>'source_type', 'import'),
        v_item->>'source_reference',
        coalesce((v_item->>'verified')::boolean, true)
      );
      v_imported := v_imported + 1;
    exception when others then
      v_invalid := v_invalid + 1;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'ean', coalesce(v_ean, v_item->>'ean', ''),
        'error', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'invalid', v_invalid,
    'errors', v_errors
  );
end;
$$;

grant select, insert, update, delete on public.nameplate_product_catalog to authenticated, service_role;
grant execute on function public.admin_upsert_nameplate_product(text, text, text, text, text, numeric, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_import_nameplate_products(jsonb) to authenticated;

-- Początkowe, potwierdzone pozycje używane w aktualnych tabliczkach Imoto R14.
insert into public.nameplate_product_catalog (
  ean, manufacturer, family, model_code, model_name, capacity_kw,
  unit_type, revision, source_type, source_reference, verified
) values
  ('5905567600814', 'Rotenso', 'Imoto', 'I50XI R14', 'Imoto 5,0 kW (I50Xi R14)', 5.00, 'indoor', 'R14', 'local_dictionary', 'Wawis 8.92 — potwierdzony odczyt tabliczki', true),
  ('5905567600821', 'Rotenso', 'Imoto', 'I50XO R14', 'Imoto 5,0 kW (I50Xo R14)', 5.00, 'outdoor', 'R14', 'local_dictionary', 'Wawis 8.92 — potwierdzony odczyt tabliczki', true)
on conflict (ean) do update
set manufacturer = excluded.manufacturer,
    family = excluded.family,
    model_code = excluded.model_code,
    model_name = excluded.model_name,
    capacity_kw = excluded.capacity_kw,
    unit_type = excluded.unit_type,
    revision = excluded.revision,
    verified = true,
    updated_at = now();

commit;
