-- WAWIS 14.28: dodatek do scaffold 14.08 — kolumny montażu potrzebne protokołom szczelności (jednorazowa baza).
alter table public.jobs add column device_model text, add column completed_at timestamptz, add column completed_by uuid;
