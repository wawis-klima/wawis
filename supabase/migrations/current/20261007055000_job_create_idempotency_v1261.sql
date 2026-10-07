begin;

alter table public.jobs
  add column if not exists create_operation_id uuid,
  add column if not exists create_payload_fingerprint text;

create unique index if not exists jobs_create_operation_id_uidx
  on public.jobs (create_operation_id)
  where create_operation_id is not null;

do $$
begin
  alter table public.jobs
    add constraint jobs_create_operation_metadata_consistent
    check (
      (create_operation_id is null and create_payload_fingerprint is null)
      or (
        create_operation_id is not null
        and nullif(btrim(create_payload_fingerprint), '') is not null
      )
    ) not valid;
exception
  when duplicate_object then null;
end
$$;

alter table public.jobs
  validate constraint jobs_create_operation_metadata_consistent;

comment on column public.jobs.create_operation_id is
  'Client-generated UUID reused across retries of the same create-job operation.';
comment on column public.jobs.create_payload_fingerprint is
  'Canonical payload fingerprint used to reject operation_id reuse with different create payload.';

commit;
