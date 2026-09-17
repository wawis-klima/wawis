-- Legacy permissive policy bypasses retained_job_files_delete on fresh rebuild.
drop policy if exists job_protocols_storage_delete_admin_or_owner on storage.objects;
