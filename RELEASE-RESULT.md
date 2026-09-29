# RELEASE RESULT

## Wersja
- 11.79

## Zakres
- audyt Kontrahentów: etap 6 ograniczony do K12
- K14 pominięty decyzją użytkownika; nie wdrażamy blokad równoczesnego tworzenia ani globalnej unikalności kontaktów

## K12 — spójna normalizacja
- nazwa/tożsamość: trim + redukcja białych znaków + lowercase
- polskie znaki pozostają istotne dla tożsamości; `Górski` != `Gorski`
- wyszukiwanie ma osobną łagodną normalizację i może znaleźć `Górski` po `Gorski`
- telefon PL: 9 cyfr / 48 / +48 / 0048 → jeden klucz `+48...`
- zagraniczne numery z + lub 00 zachowują kod kraju; nie obcinamy ostatnich 9 cyfr
- e-mail: trim + lowercase
- NIP: cyfry
- desktop i mobile przeszukują wszystkie zapisane adresy kontrahenta
- import korzysta z tych samych reguł duplikatów co pozostały JS

## Produkcja przed zmianą
- 567 kontrahentów ma telefon
- 6 istniejących grup współdzielonych numerów
- proponowana normalizacja nadal daje 6 grup
- 0 nowych grup konfliktowych powstaje wyłącznie przez nową regułę +48
- istniejących danych nie scalamy i nie usuwamy

## SQL
- zmiana `normalize_contractors_phone(text)`
- przebudowa `contractors_phone_lookup_idx`
- `normalize_contractors_text/email/nip` pozostają bez zmiany, bo już odpowiadają docelowej specyfikacji
- brak zmian RLS
- brak K14: brak advisory locks i brak nowych UNIQUE dla telefonu/e-maila/NIP

## Kontrola regresji
- `scripts/smoke-contractors-k12-v1179.mjs`
- desktop/mobile: identyczne fixture nazw, telefonu, e-maila i NIP
- kontrola rozdzielenia identity vs search
- kontrola dodatkowych adresów w wyszukiwaniu
- kontrola migracji i braku mechanizmów K14
- WAWIS PR checks: SUCCESS (pre-migration/documentation head); final head recheck PENDING
- Playwright desktop/mobile: SUCCESS (pre-migration/documentation head); final head recheck PENDING
- produkcyjny build: SUCCESS (pre-migration/documentation head); final head recheck PENDING
- migracja Supabase: APPLIED — contractor_normalization_v1179; indeks telefonu przebudowany; 6 istniejących grup współdzielonych numerów bez nowych grup
- Vercel: PENDING
- merge: PENDING
