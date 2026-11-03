# RELEASE RESULT — WAWIS 14.20

## Zakres
- Publiczna strona naklejki QR dla klienta: model, termin przeglądu, telefon, zgłoszenie awarii lub przeglądu.
- Funkcja Edge `qr-service-request` (walidacja, limity, push do administratorów), zakładka „Zgłoszenia” na komputerze.
- Migracja `20261103200000` (uruchamia właściciel) — nowa tabela i funkcje, bez zmian istniejących danych.

Obszary chronione: start aplikacji (`main.jsx`), nowa publiczna funkcja Edge, powiadomienia push.
