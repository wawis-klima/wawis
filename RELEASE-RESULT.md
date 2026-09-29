# RELEASE RESULT

## Wersja
- 11.76

## Zakres
- audyt Kontrahentów: etap 3 / K1 + K2 + K17
- K23 rozstrzygnięty decyzją biznesową: okres przypomnień serwisowych ma być stały i wynosić 5 lat

## K1 — adres montażu na mobile
- `buildEditJobForm` zachowuje `contractor_address_id`
- niezwiązana edycja (np. telefon) nie zmienia ID adresu
- historyczny rekord bez ID pozostaje bez ID
- świadomy wybór kontrahenta/adresu przenosi właściwy identyfikator
- nowe zapisy mobile przekazują `contractor_address_id` do jobs

## K2 — edycja urządzenia
- zwykła korekta urządzenia z montażu zapisuje tylko `device_model` i `device_serial_number`
- `installation_date` trafia do patcha wyłącznie po faktycznej zmianie
- nie są wysyłane client/title/email/phone/city/street/location/sms_recipient_phone
- zmiana kontrahenta urządzenia job-backed jest blokowana i wymaga edycji montażu

## K17 — właściwy indeks urządzenia
- fallback desktopu nadaje `source_job_id=job.id` pierwszemu urządzeniu
- kolejne mają `job.id::device-N`
- edycja urządzenia nr 2 nie może już trafić w indeks 0

## Stałe 5 lat
- odczyt produkcyjny przed zmianą: 146/146 jobs = 5; 718/718 devices = 5
- aplikacja normalizuje wartość do 5 i jawnie wysyła `p_service_reminder_years=5`
- migracja zmienia CHECK z 1..10 na dokładnie 5 i wymusza 5 w `admin_upsert_device`
- istniejące dane nie wymagają korekty wartości

## Kontrola
- smoke `scripts/smoke-contractors-stage3-v1176.mjs`
- WAWIS PR checks: PENDING
- Playwright: PENDING
- build: PENDING
- migracja Supabase: PENDING
- Vercel: PENDING
- merge: PENDING
