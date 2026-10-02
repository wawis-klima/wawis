# WAWIS 12.28 — poprawka przygotowana do przeglądu

SMS oczekujące na zatwierdzenie można zatwierdzić i wysłać z listy Niewysłane; ponowienie dobiera właściwą ścieżkę do statusu, z ochroną przed podwójnym kliknięciem i fałszywym potwierdzeniem wysyłki.

Przygotowano na main 733cdd028a009ac58cea44940a336b4acfcd278c, gałąź release/v12.28.
Bez merge do main, wdrożenia, migracji ani wysłania SMS-ów do klientów.

Walidacja: testy routingu, grupowania, sentCount=0 i podwójnego kliknięcia; pełna kompilacja i testy domenowe przed zakończeniem pracy. CI PR stanowi oddzielny wynik.
