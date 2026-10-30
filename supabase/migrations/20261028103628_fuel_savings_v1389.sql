-- WAWIS 13.89 — oszczędności na paliwie ze zbiornika (zgoda właściciela 28.10.2026 11:29: „możemy to wdrażać”).
--
-- 1) Cena zakupu przy dostawie do zbiornika (brutto za litr + stawka VAT; netto wyliczane). Tylko administrator
--    (tabela fuel_tank_movements jest już administracyjna — RLS select/insert tylko dla administratora).
--    Pierwsza dostawa 5000 l z 7.10.2026: 36 250 zł brutto, VAT 8% → 7,25 zł/l brutto (podane przez właściciela).
-- 2) public.fuel_reference_prices — urzędowe maksymalne ceny oleju napędowego (obwieszczenia Ministra Energii,
--    Monitor Polski). Zapis wyłącznie przez funkcję Edge fuel-reference-prices (service_role); odczyt tylko administrator.
-- Nic nie jest usuwane; istniejące RPC zostają bez zmian (zgodność wsteczna).
begin;

alter table public.fuel_tank_movements
  add column if not exists purchase_gross_per_liter numeric(10,4),
  add column if not exists purchase_vat_rate numeric(5,2),
  add column if not exists purchase_net_per_liter numeric(10,4)
    generated always as (
      case when purchase_gross_per_liter is null or purchase_vat_rate is null then null
           else round(purchase_gross_per_liter / (1 + purchase_vat_rate / 100), 4) end
    ) stored;

alter table public.fuel_tank_movements drop constraint if exists fuel_tank_movements_purchase_price_chk;
alter table public.fuel_tank_movements add constraint fuel_tank_movements_purchase_price_chk check (
  (purchase_gross_per_liter is null and purchase_vat_rate is null)
  or (
    movement_type in ('opening','delivery')
    and purchase_gross_per_liter > 0 and purchase_gross_per_liter < 50
    and purchase_vat_rate >= 0 and purchase_vat_rate <= 30
  )
);

update public.fuel_tank_movements
   set purchase_gross_per_liter = 7.25, purchase_vat_rate = 8
 where movement_type = 'opening'
   and purchase_gross_per_liter is null
   and delta_liters = 5000.00;

create table if not exists public.fuel_reference_prices (
  eli text primary key,
  act_year integer not null,
  act_pos integer not null,
  promulgated_on date not null,
  valid_from date not null,
  diesel_net numeric(8,2) not null check (diesel_net > 0 and diesel_net < 50),
  diesel_gross numeric(8,2) not null check (diesel_gross >= diesel_net and diesel_gross < 60),
  vat_rate numeric(5,2) not null,
  source_url text not null,
  title text,
  fetched_at timestamptz not null default now()
);

create index if not exists fuel_reference_prices_valid_from_idx
  on public.fuel_reference_prices (valid_from desc, act_pos desc);

alter table public.fuel_reference_prices enable row level security;
revoke all on table public.fuel_reference_prices from public, anon, authenticated;
grant select on table public.fuel_reference_prices to authenticated;
grant all on table public.fuel_reference_prices to service_role;

drop policy if exists fuel_reference_prices_admin_select on public.fuel_reference_prices;
create policy fuel_reference_prices_admin_select
on public.fuel_reference_prices
for select
to authenticated
using ((select public.current_user_is_admin()));

comment on table public.fuel_reference_prices is
  'WAWIS 13.89: maksymalne ceny oleju napędowego z obwieszczeń Ministra Energii (Monitor Polski). Zapis: funkcja Edge fuel-reference-prices. Odczyt: administrator.';

-- Dostawa z ceną (ten sam kontrakt idempotencji co v1266).
create or replace function public.admin_add_fuel_tank_movement_v1389(
  p_movement_type text,
  p_liters numeric,
  p_note text,
  p_operation_id uuid,
  p_gross_per_liter numeric default null,
  p_vat_rate numeric default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_type text := lower(pg_catalog.btrim(coalesce(p_movement_type, '')));
  v_liters numeric(12,2);
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  v_gross numeric(10,4) := case when p_gross_per_liter is null then null else pg_catalog.round(p_gross_per_liter, 4) end;
  v_vat numeric(5,2) := case when p_gross_per_liter is null then null else pg_catalog.round(coalesce(p_vat_rate, 8), 2) end;
  v_row public.fuel_tank_movements%rowtype;
begin
  if (select auth.uid()) is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może dodawać dostawy i korekty zbiornika.' using errcode='42501';
  end if;
  if p_operation_id is null then
    raise exception 'Brakuje identyfikatora operacji dostawy.' using errcode='22023';
  end if;
  if v_type not in ('delivery', 'adjustment') then
    raise exception 'Nieprawidłowy typ ruchu zbiornika.' using errcode='22023';
  end if;
  if p_liters is null or p_liters = 0 or (v_type = 'delivery' and p_liters <= 0) then
    raise exception 'Nieprawidłowa ilość paliwa.' using errcode='22023';
  end if;
  if v_type <> 'delivery' and v_gross is not null then
    raise exception 'Cenę zakupu podaje się tylko przy dostawie.' using errcode='22023';
  end if;
  if v_gross is not null and (v_gross <= 0 or v_gross >= 50 or v_vat < 0 or v_vat > 30) then
    raise exception 'Nieprawidłowa cena za litr lub stawka VAT.' using errcode='22023';
  end if;
  v_liters := pg_catalog.round(p_liters, 2);
  if v_liters = 0 then
    raise exception 'Ilość paliwa jest zbyt mała.' using errcode='22023';
  end if;

  insert into public.fuel_tank_movements (
    movement_type, delta_liters, fuel_entry_id, note, happened_at, created_by, operation_id,
    purchase_gross_per_liter, purchase_vat_rate
  ) values (
    v_type, v_liters, null, v_note, now(), (select auth.uid()), p_operation_id, v_gross, v_vat
  )
  on conflict (created_by, operation_id) where operation_id is not null do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row
      from public.fuel_tank_movements
     where created_by = (select auth.uid()) and operation_id = p_operation_id;
    if v_row.id is null then
      raise exception 'Nie udało się potwierdzić dostawy paliwa.' using errcode='P0001';
    end if;
    if v_row.movement_type is distinct from v_type
      or v_row.delta_liters is distinct from v_liters
      or v_row.note is distinct from v_note
      or v_row.purchase_gross_per_liter is distinct from v_gross
      or v_row.purchase_vat_rate is distinct from v_vat then
      raise exception 'Identyfikator operacji został użyty z innymi danymi.' using errcode='23505';
    end if;
  end if;
  return pg_catalog.to_jsonb(v_row);
end
$function$;

revoke all on function public.admin_add_fuel_tank_movement_v1389(text,numeric,text,uuid,numeric,numeric) from public, anon;
grant execute on function public.admin_add_fuel_tank_movement_v1389(text,numeric,text,uuid,numeric,numeric) to authenticated, service_role;

-- Uzupełnienie / poprawa ceny istniejącej dostawy (np. dodanej z telefonu bez ceny).
create or replace function public.admin_set_fuel_purchase_price_v1389(
  p_movement_id uuid,
  p_gross_per_liter numeric,
  p_vat_rate numeric default 8
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row public.fuel_tank_movements%rowtype;
  v_gross numeric(10,4) := pg_catalog.round(p_gross_per_liter, 4);
  v_vat numeric(5,2) := pg_catalog.round(coalesce(p_vat_rate, 8), 2);
begin
  if (select auth.uid()) is null or not public.current_user_is_admin() then
    raise exception 'Tylko administrator może ustawiać cenę paliwa.' using errcode='42501';
  end if;
  if p_movement_id is null or v_gross is null or v_gross <= 0 or v_gross >= 50 or v_vat < 0 or v_vat > 30 then
    raise exception 'Nieprawidłowa cena za litr lub stawka VAT.' using errcode='22023';
  end if;
  update public.fuel_tank_movements
     set purchase_gross_per_liter = v_gross, purchase_vat_rate = v_vat
   where id = p_movement_id and movement_type in ('opening','delivery')
  returning * into v_row;
  if v_row.id is null then
    raise exception 'Nie znaleziono dostawy paliwa.' using errcode='P0002';
  end if;
  return pg_catalog.to_jsonb(v_row);
end
$function$;

alter function public.admin_set_fuel_purchase_price_v1389(uuid,numeric,numeric) owner to postgres;
revoke all on function public.admin_set_fuel_purchase_price_v1389(uuid,numeric,numeric) from public, anon;
grant execute on function public.admin_set_fuel_purchase_price_v1389(uuid,numeric,numeric) to authenticated, service_role;

commit;
