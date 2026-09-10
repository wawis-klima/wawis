-- Uruchom w Supabase SQL Editor, jeśli administrator nie może usuwać komentarzy
-- z sekcji „Komentarze i pytania” w karcie montażu.

alter table public.comments enable row level security;

drop policy if exists "comments_delete_admin" on public.comments;
create policy "comments_delete_admin"
on public.comments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'Administrator'
  )
);
