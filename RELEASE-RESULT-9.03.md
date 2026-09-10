# RELEASE RESULT - Wawis 9.03

## Wersja
- 9.03

## Zakres
- głosowe wprowadzanie danych klienta w formularzu nowego montażu / zlecenia,
- głosowe wprowadzanie danych w formularzu kontrahenta,
- pełna wypowiedź rozbijana na nazwę klienta / firmy, telefon, kod pocztowy, miejscowość, ulicę, numer domu i numer lokalu,
- ekran kontroli przed zastosowaniem rozpoznanych danych,
- osobny mikrofon przy pojedynczych polach,
- polski język rozpoznawania `pl-PL`,
- brak nowej migracji Supabase.

## Zgodność z obecną bazą
- kod pocztowy jest zapisywany razem z miejscowością,
- numer domu i lokalu są zapisywane razem z ulicą, np. `Sienkiewicza 12/4`,
- istniejące pola `client/company_name`, `phone`, `city` i `street` pozostają bez zmiany.

## Kontrola
- parser pełnej wypowiedzi: PASS,
- parser kodu pocztowego i adresu 18/6: PASS,
- cyfry telefonu wypowiadane po polsku: PASS,
- obecność funkcji na mobile i desktop: PASS,
- ręczne zatwierdzenie przed zastosowaniem: PASS,
- test wersji: PASS,
- pełny build i Playwright: NIEURUCHOMIONE — środowisko nie mogło odtworzyć zależności npm (`E404` w rejestrze pośrednim oraz `EAI_AGAIN` przy próbie publicznego npm); błąd wystąpił przed kompilacją kodu.

## Wdrożenie
- brak SQL do uruchamiania,
- wdrożyć aplikację 9.03 standardowym workflow.
