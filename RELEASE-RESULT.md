# WAWIS 12.33 — gotowa do wdrożenia

Naprawiono krytyczny błąd zbiorczych operacji w module SMS.

- zaznaczenie checkboxem w nagłówku obejmuje tylko bieżącą stronę,
- zmiana strony, widoku lub filtrów czyści wcześniejsze zaznaczenie,
- usuwanie i wysyłanie mają osobne stany `Usuwanie…` / `Wysyłanie…`,
- przed operacją zbiorczą aplikacja pokazuje potwierdzenie z liczbą pozycji,
- widok „Niewysłane” usuwa tylko dokładny wpis reprezentowany przez widoczny wiersz, bez rozwijania wszystkich historycznych `grouped_log_ids`,
- Edge Function blokuje próbę usunięcia ponad 25 logów SMS naraz.

Dane omyłkowo oznaczone jako usunięte w incydencie 03.10.2026 są przywracane osobną, kontrolowaną operacją w bazie produkcyjnej.
