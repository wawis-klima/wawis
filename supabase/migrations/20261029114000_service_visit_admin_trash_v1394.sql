-- WAWIS 13.94: Kosz serwisów tylko dla administratora.
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
