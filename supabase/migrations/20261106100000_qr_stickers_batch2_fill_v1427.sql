-- WAWIS 14.27 — uzupełnienie partii 2 naklejek QR o 18 kodów (prośba właściciela 06.11.2026),
-- żeby wydruk 35 × 30 mm miał 4 pełne strony A4 (4 × 45 = 180 = 162 + 18).
-- Tylko dopisanie nowych, wolnych kodów do istniejącej tabeli z 14.08. Bez zmian schematu, uprawnień i danych.
-- Ponowne wykonanie niczego nie zmienia (on conflict do nothing).
insert into public.qr_stickers(code, batch) values
  ('8GR93RAY','partia-2'),
  ('XNP6F3GM','partia-2'),
  ('8AU8XFQT','partia-2'),
  ('WU2SCTB7','partia-2'),
  ('U26M6YC5','partia-2'),
  ('UDPCVKUQ','partia-2'),
  ('QM5SUSPQ','partia-2'),
  ('GM6WADFB','partia-2'),
  ('7C27G8KZ','partia-2'),
  ('P364SS68','partia-2'),
  ('6Y43Z7HC','partia-2'),
  ('DTB7AMDX','partia-2'),
  ('HKHXDXE6','partia-2'),
  ('NZKZCYBN','partia-2'),
  ('D6FJ7WE4','partia-2'),
  ('8FQUYQ4A','partia-2'),
  ('FRXGJFWY','partia-2'),
  ('ZWRXJNFT','partia-2')
on conflict (code) do nothing;
