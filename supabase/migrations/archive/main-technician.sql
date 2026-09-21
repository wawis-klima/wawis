alter table jobs add column if not exists main_technician_id uuid references profiles(id);
