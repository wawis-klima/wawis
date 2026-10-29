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

CREATE OR REPLACE FUNCTION public.service_visit_admin_trash_v1394(p_visit_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NOT public.current_user_is_admin() THEN RAISE EXCEPTION 'Tylko administrator może usuwać serwisy'; END IF;
  UPDATE public.service_visits SET deleted_at=now(),deleted_by=auth.uid(),updated_at=now()
  WHERE id=p_visit_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Serwis nie istnieje lub znajduje się w koszu'; END IF;
  UPDATE private.service_visit_assignment_push_events_v1393
  SET processed_at=coalesce(processed_at,now()) WHERE visit_id=p_visit_id AND processed_at IS NULL;
  RETURN true;
END;
$fn$;
REVOKE ALL ON FUNCTION public.service_visit_admin_trash_v1394(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.service_visit_admin_trash_v1394(uuid) TO authenticated;
