-- v12.60 P0 — jawne ACL dla administracyjnych RPC faktur VAT.

revoke execute on function public.admin_set_job_vat_invoice_issued(uuid, boolean) from anon;
revoke execute on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) from anon;
revoke execute on function public.admin_set_job_vat_invoice_issued(uuid, boolean) from public;
revoke execute on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) from public;
grant execute on function public.admin_set_job_vat_invoice_issued(uuid, boolean) to authenticated;
grant execute on function public.admin_confirm_job_vat_invoice_fakturownia(uuid, text, text) to authenticated;
