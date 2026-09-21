-- Wersja 6.41
-- Wymuszenie ręcznego workflow modułu SMS.

update public.sms_settings
set sending_mode = 'approval'
where sending_mode is distinct from 'approval';
