-- WAWIS 10.16 — źródło odczytu przebiegu: lokalny OCR, OpenAI lub korekta.

alter table public.fuel_entries
  add column if not exists odometer_read_source text;

update public.fuel_entries
set odometer_read_source = case
  when coalesce(odometer_ai_confidence, 0) > 0 then 'openai'
  else 'manual'
end
where odometer_read_source is null;

alter table public.fuel_entries
  alter column odometer_read_source set default 'openai',
  alter column odometer_read_source set not null;

alter table public.fuel_entries
  drop constraint if exists fuel_entries_odometer_read_source_check;

alter table public.fuel_entries
  add constraint fuel_entries_odometer_read_source_check
  check (odometer_read_source in ('local_ocr', 'openai', 'manual'));

comment on column public.fuel_entries.odometer_read_source is
  'Źródło zapisanego przebiegu: lokalny OCR, zapasowy odczyt OpenAI albo ręczna korekta administratora.';
