# WAWIS 12.32 — gotowa do wdrożenia

Naprawiono usuwanie wpisów SMS z aktywnych list.

- wpis ze statusem BŁĄD, który ma już dowód kontaktu z SMSAPI, można usunąć z aktywnej kolejki bez niszczenia historii operatora; rekord dostaje stan `dismissed`,
- wpisy `NIEWYSŁANO` można usuwać pojedynczo oraz hurtowo przez „Usuń zaznaczone”,
- zaznaczenie w widoku Niewysłane służy teraz zarówno do ponownej wysyłki, jak i do usuwania; wysyłane są tylko pozycje, które nadal mają poprawne powiązanie z klientem,
- generator i frontend traktują `dismissed` jako stan końcowy, więc usunięty wpis nie wraca po odświeżeniu.

Historia provider_message_id, sent_at i komunikat operatora pozostają zachowane.
