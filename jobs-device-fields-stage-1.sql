alter table public.jobs
add column if not exists device_model text;

alter table public.jobs
add column if not exists device_serial_number text;

create index if not exists jobs_device_serial_number_idx
  on public.jobs (device_serial_number);
