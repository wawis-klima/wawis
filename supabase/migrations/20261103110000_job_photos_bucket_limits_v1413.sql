-- WAWIS 14.13 — limit plików w buckecie zdjęć montaży (decyzja właściciela 03.11.2026).
-- Problem: bucket job-photos nie miał limitu rozmiaru ani typu pliku (inne buckety mają).
-- Stan przed zmianą (SELECT 03.11.2026): 1077 plików, wszystkie image/jpeg, największy 4,49 MB.
-- Aplikacja kompresuje zdjęcia do JPG (desktop 1600 px, telefon 1800 px); bez kompresji wysyła oryginał
-- z typem obrazu. Limit 20 MB i dowolny typ image/* nie blokuje żadnego prawdziwego zdjęcia z telefonu,
-- a zatrzymuje przypadkowe bardzo duże pliki i pliki niebędące zdjęciami.
-- Dotyczy wyłącznie nowych wysyłek; istniejące pliki i dane bez zmian.
update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array['image/*']
where id = 'job-photos';
