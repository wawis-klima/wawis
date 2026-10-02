# WAWIS 12.28 — gotowa do wdrożenia

SMS oczekujące na zatwierdzenie można zatwierdzić i wysłać z listy Niewysłane; ponowienie dobiera właściwą ścieżkę do statusu, z ochroną przed podwójnym kliknięciem i fałszywym potwierdzeniem wysyłki.

Przygotowano na main 733cdd028a009ac58cea44940a336b4acfcd278c, gałąź release/v12.28.
Bez zmian bazy, migracji ani Edge Functions. Wdrożenie uruchamia merge do `main`.

Walidacja: testy routingu, grupowania, sentCount=0 i podwójnego kliknięcia; pełna kompilacja i testy domenowe zakończone powodzeniem. WAWIS PR checks #632: SUCCESS.
