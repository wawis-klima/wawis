-- Wawis Klimatyzacja v8.67
-- Status zatwierdzenia OCR dla zdjęć tabliczek w aplikacji desktopowej.
-- Skrypt jest idempotentny i nie zmienia plików zdjęć ani aplikacji mobilnej.

begin;

alter table public.photos
  add column if not exists ocr_status text,
  add column if not exists ocr_checked_at timestamptz;

update public.photos
set ocr_status = 'pending'
where ocr_status is null
  and storage_path like '%/nameplates/%';

alter table public.photos
  drop constraint if exists photos_ocr_status_check;

alter table public.photos
  add constraint photos_ocr_status_check
  check (ocr_status is null or ocr_status in ('pending', 'approved'));

comment on column public.photos.ocr_status is
  'Desktopowy status weryfikacji OCR tabliczki: pending lub approved. Mobile nie używa tego pola.';
comment on column public.photos.ocr_checked_at is
  'Data zatwierdzenia danych OCR przez administratora na desktopie.';

commit;
