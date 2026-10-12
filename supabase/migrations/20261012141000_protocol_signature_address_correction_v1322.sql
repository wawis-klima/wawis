-- WAWIS 13.22 — only signatures captured from this release are reusable.
-- Existing protocol PDFs and their historical signatures are not extracted or modified.
begin;

alter table public.job_protocols
  add column if not exists signature_path text,
  add column if not exists signed_snapshot jsonb,
  add column if not exists revision_history jsonb not null default '[]'::jsonb,
  add column if not exists correction_kind text;

comment on column public.job_protocols.signature_path is
  'Private PNG signature saved with a new signed PDF; NULL for all legacy PDFs.';
comment on column public.job_protocols.signed_snapshot is
  'The signed substantive content snapshot; address-only changes may reuse the signature.';
comment on column public.job_protocols.revision_history is
  'Previous immutable PDF storage paths retained when a protocol is corrected or re-signed.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-protocol-signatures', 'job-protocol-signatures', false, 2000000, array['image/png'])
on conflict (id) do update
set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists job_protocol_signatures_select on storage.objects;
create policy job_protocol_signatures_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'job-protocol-signatures'
    and public.current_user_can_access_job(public.storage_object_job_id(name))
  );

drop policy if exists job_protocol_signatures_insert on storage.objects;
create policy job_protocol_signatures_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-protocol-signatures'
    and public.current_user_can_write_job_protocol(public.storage_object_job_id(name))
  );

commit;
