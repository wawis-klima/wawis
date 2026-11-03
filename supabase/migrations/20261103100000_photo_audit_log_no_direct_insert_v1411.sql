-- WAWIS 14.11 — dziennik zdjęć bez bezpośredniego zapisu z API (zgoda właściciela 03.11.2026).
-- Problem: reguła photo_audit_log_service_insert pozwalała każdemu zalogowanemu dopisać wpis
-- z dowolnym autorem (actor_user_id, actor_role), akcją i datą — dziennik można było podrobić.
-- Wpisy tworzą wyłącznie trigger photo_audit_photos_change_trigger i funkcja photo_audit_log_event
-- (SECURITY DEFINER, właściciel postgres, RLS bez FORCE), więc nie zależą od tej reguły.
-- Aplikacja (src/) nie zapisuje do photo_audit_log bezpośrednio. Bez zmian danych.
drop policy if exists photo_audit_log_service_insert on public.photo_audit_log;
