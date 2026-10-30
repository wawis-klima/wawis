-- WAWIS — średnie ceny oleju napędowego dla Śląska do zakładki „Oszczędności na własnym zbiorniku”
-- (decyzja właściciela 30.10.2026: cena „na stacji” = średnia dla Śląska, nie cena maksymalna).
--
-- PRZYGOTOWANE, NIE WDROŻONE. Wykonać dopiero na polecenie właściciela („jak ci powiem, to wdrożysz”),
-- wtedy przenieść do supabase/migrations/<wersja>_fuel_market_prices_slaskie.sql (+ manifesty).
--
-- 1) public.fuel_market_prices — średnie rynkowe (brutto za litr) z AutoCentrum (tygodniowe, śląskie)
--    i zapaliwo.pl (dzienne, śląskie). Odczyt: tylko administrator (RLS). Zapis: wyłącznie funkcja Edge
--    fuel-reference-prices (service_role). Nic nie jest usuwane ani zmieniane w istniejących tabelach.
-- 2) Codzienny zapis ceny dnia (zapaliwo.pl nie ma archiwum): pg_cron wywołuje funkcję Edge w trybie
--    x-wawis-snapshot — ten tryb nie wymaga logowania, ale zapisuje WYŁĄCZNIE publiczne ceny paliw
--    (bez danych klientów), najwyżej raz na dobę dla zapaliwo i raz na 6 h dla AutoCentrum.
begin;

create table if not exists public.fuel_market_prices (
  source text not null check (source in ('autocentrum', 'zapaliwo')),
  region text not null default 'slaskie' check (region in ('slaskie')),
  period_start date not null,
  period_end date not null,
  diesel_gross numeric(8,2) not null check (diesel_gross > 2 and diesel_gross < 20),
  label text,
  source_url text not null,
  fetched_at timestamptz not null default now(),
  primary key (source, region, period_start),
  check (period_end >= period_start and period_end - period_start <= 7)
);

create index if not exists fuel_market_prices_period_idx
  on public.fuel_market_prices (region, period_start desc);

alter table public.fuel_market_prices enable row level security;
revoke all on table public.fuel_market_prices from public, anon, authenticated;
grant select on table public.fuel_market_prices to authenticated;
grant all on table public.fuel_market_prices to service_role;

drop policy if exists fuel_market_prices_admin_select on public.fuel_market_prices;
create policy fuel_market_prices_admin_select
on public.fuel_market_prices
for select
to authenticated
using ((select public.current_user_is_admin()));

comment on table public.fuel_market_prices is
  'WAWIS: średnie ceny ON dla Śląska (AutoCentrum — tygodniowe, zapaliwo.pl — dzienne). Zapis: funkcja Edge fuel-reference-prices. Odczyt: administrator.';

select cron.unschedule(jobid) from cron.job where jobname = 'wawis-fuel-market-prices-daily';
select cron.schedule(
  'wawis-fuel-market-prices-daily',
  '23 15 * * *',
  $cron$select net.http_post(
    url := 'https://uohziyaudbpwmupvljyd.supabase.co/functions/v1/fuel-reference-prices',
    headers := '{"Content-Type":"application/json","x-wawis-snapshot":"1"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );$cron$
);

commit;
