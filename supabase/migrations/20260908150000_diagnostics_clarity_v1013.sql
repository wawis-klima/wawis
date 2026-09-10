-- Wawis 10.13 — jawne oznaczenie modułu w centralnej diagnostyce.
-- Zmiana jest addytywna i pozostaje zgodna ze starszymi wersjami aplikacji.

alter table public.app_diagnostic_events
  add column if not exists diagnostic_module text not null default '';

do $$
begin
  alter table public.app_diagnostic_events
    add constraint app_diagnostic_events_diagnostic_module_length_check
    check (length(diagnostic_module) <= 80);
exception
  when duplicate_object then null;
end;
$$;

create index if not exists app_diagnostic_events_module_received_idx
  on public.app_diagnostic_events (diagnostic_module, received_at desc);

comment on column public.app_diagnostic_events.diagnostic_module is
  'Techniczny moduł źródłowy zdarzenia, bez danych klienta, np. photos, protocol lub data.refresh.';
