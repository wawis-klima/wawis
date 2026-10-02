-- v12.17: produkcyjne domknięcie uprawnień po dodaniu admin_cleanup_sms_duplicate_logs.
revoke all on function public.admin_cleanup_sms_duplicate_logs() from public;
revoke all on function public.admin_cleanup_sms_duplicate_logs() from anon;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to authenticated;
grant execute on function public.admin_cleanup_sms_duplicate_logs() to service_role;
