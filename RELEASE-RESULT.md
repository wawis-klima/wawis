# RELEASE RESULT

## Wersja
- 13.26 (przygotowanie — nie potwierdza wdrożenia)

## Zakres
- Mobile: ostrzeżenie o różnych seriach JW/JZ nie blokuje odczytu tabliczki ani zapisu urządzenia po świadomym potwierdzeniu.
- Mobile i desktop: zakończenie montażu z niezgodnymi seriami możliwe po osobnym potwierdzeniu, przy zachowaniu blokad brakujących modeli, tabliczek i protokołu.
- Różne modele obu jednostek są zachowane bez automatycznego nadpisywania.

## Bramki
- Wymagane zielone CI PR (targeted-checks, E2E mobile, build, Closure Gate).
- Po merge do main potwierdzenie Vercel READY i test fizycznego iPhone.
