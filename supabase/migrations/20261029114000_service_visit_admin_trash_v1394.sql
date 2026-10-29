-- WAWIS 13.94: Kosz serwisów tylko dla administratora.
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.service_visits ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_visits_deleted_at_v1394_idx ON public.service_visits(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE OR REPLACE FUNCTION private.guard_trashed_service_visit_v1394()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
BEGIN
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Usunięty serwis należy najpierw przywrócić';
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_guard_trashed_service_visit_v1394 ON public.service_visits;
CREATE TRIGGER trg_guard_trashed_service_visit_v1394 BEFORE UPDATE ON public.service_visits
FOR EACH ROW EXECUTE FUNCTION private.guard_trashed_service_visit_v1394();
