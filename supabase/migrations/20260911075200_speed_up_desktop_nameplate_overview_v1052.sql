-- WAWIS 10.52 — szybkie pobieranie statusu tabliczek na desktopie.
-- Administrator ma stały dostęp do wszystkich zdjęć/potwierdzeń, więc wynik
-- current_user_is_admin() obliczamy raz jako initplan zamiast dla każdego wiersza.

DROP POLICY IF EXISTS photos_read_job ON public.photos;
CREATE POLICY photos_read_job
ON public.photos
FOR SELECT
TO authenticated
USING (
  (SELECT public.current_user_is_admin())
  OR public.current_user_can_access_job(job_id)
);

DROP POLICY IF EXISTS nameplate_manual_verifications_admin_select ON public.nameplate_manual_verifications;
CREATE POLICY nameplate_manual_verifications_admin_select
ON public.nameplate_manual_verifications
FOR SELECT
TO authenticated
USING ((SELECT public.current_user_is_admin()));
