create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  title text,
  body text,
  is_read boolean default false,
  link_job_id uuid,
  created_at timestamptz default now()
);

alter table notifications enable row level security;

drop policy if exists "notifications_select" on notifications;
drop policy if exists "notifications_insert" on notifications;
drop policy if exists "notifications_update" on notifications;

create policy "notifications_select" on notifications for select using (true);
create policy "notifications_insert" on notifications for insert with check (true);
create policy "notifications_update" on notifications for update using (true);
