-- WAWIS 10.89 / N7 stage B / rebuild-only Storage baseline.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('fuel-odometer-photos','fuel-odometer-photos',false,6291456,array['image/jpeg','image/png','image/webp']::text[]),
 ('job-photos','job-photos',false,null,null),
 ('job-protocols','job-protocols',false,10485760,array['application/pdf']::text[]),
 ('WaWis','WaWis',true,null,null)
on conflict(id) do update set name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' and policyname in (
   'fuel_odometer_photos_admin_delete','fuel_odometer_photos_own_insert','fuel_odometer_photos_own_or_admin_select',
   'job_photos_storage_insert_accessible_job','job_photos_storage_select_accessible_job','job_photos_storage_update_accessible_job',
   'job_protocols_storage_insert_completed_job','job_protocols_storage_select_accessible_job','retained_job_files_delete') loop
    execute format('drop policy if exists %I on storage.objects',r.policyname);
  end loop;
end $$;

create policy fuel_odometer_photos_admin_delete on storage.objects for delete to authenticated using ((bucket_id='fuel-odometer-photos'::text) and (select public.current_user_is_admin()));
create policy fuel_odometer_photos_own_insert on storage.objects for insert to authenticated with check ((bucket_id='fuel-odometer-photos'::text) and (select public.current_user_is_staff()) and ((storage.foldername(name))[1]=((select auth.uid()))::text));
create policy fuel_odometer_photos_own_or_admin_select on storage.objects for select to authenticated using ((bucket_id='fuel-odometer-photos'::text) and (select public.current_user_is_staff()) and (((storage.foldername(name))[1]=((select auth.uid()))::text) or (select public.current_user_is_admin())));
create policy job_photos_storage_insert_accessible_job on storage.objects for insert to authenticated with check ((bucket_id='job-photos'::text) and public.current_user_can_edit_job(public.storage_object_job_id(name)));
create policy job_photos_storage_select_accessible_job on storage.objects for select to authenticated using ((bucket_id='job-photos'::text) and public.current_user_can_view_job(public.storage_object_job_id(name)));
create policy job_photos_storage_update_accessible_job on storage.objects for update to authenticated using ((bucket_id='job-photos'::text) and public.current_user_can_edit_job(public.storage_object_job_id(name))) with check ((bucket_id='job-photos'::text) and public.current_user_can_edit_job(public.storage_object_job_id(name)));
create policy job_protocols_storage_insert_completed_job on storage.objects for insert to authenticated with check ((bucket_id='job-protocols'::text) and public.current_user_can_finalize_job(public.storage_object_job_id(name)));
create policy job_protocols_storage_select_accessible_job on storage.objects for select to authenticated using ((bucket_id='job-protocols'::text) and public.current_user_can_view_job(public.storage_object_job_id(name)));
create policy retained_job_files_delete on storage.objects for delete to authenticated using ((bucket_id=any(array['job-photos'::text,'job-protocols'::text])) and public.job_file_can_be_deleted(bucket_id,name));
