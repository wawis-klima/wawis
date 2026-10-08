-- WAWIS 12.74 C3 / Codex D8: the existing client uses upsert(..., ignoreDuplicates:true),
-- which needs SELECT visibility on the proposed row under PostgreSQL RLS.
-- Admin SELECT remains unchanged; workers get SELECT only for their own events.
-- No UPDATE or DELETE is granted to workers and anon stays denied.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_diagnostic_events'
      AND policyname = 'app_diagnostic_events_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY app_diagnostic_events_select_own ON public.app_diagnostic_events FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id)';
  END IF;
END;
$$;
