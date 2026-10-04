begin;

alter table if exists public.job_protocols
  add column if not exists note text;

alter table if exists public.job_protocols
  drop constraint if exists job_protocols_note_length_check;

alter table if exists public.job_protocols
  add constraint job_protocols_note_length_check
  check (note is null or char_length(note) <= 300);

comment on column public.job_protocols.note is
  'Opcjonalna uwaga użytkownika zapisywana razem z protokołem klienta i drukowana w PDF.';

commit;
