import React, { lazy as reactLazy } from "react";

// WAWIS 13.76 (test iPhone 26.10.2026, tryb samolotowy, 13.75): Diagnostyka nie była zapisana w telefonie,
// a nieudane pobranie jej pliku zostawiało CAŁKOWICIE BIAŁY EKRAN — React usuwa całą aplikację, gdy leniwie
// ładowany ekran rzuci błąd bez obsługi. Od 13.76 service worker pobiera całą wersję z góry, a ten wrapper
// jest drugą linią obrony: zamiast białego ekranu pokazuje komunikat, a reszta aplikacji działa dalej.

function logChunkFailure(name, error) {
  // Konsola jest przechwytywana przez diagnostykę aplikacji (console.warn → raport).
  console.warn(`Nie udało się wczytać ekranu „${name}”:`, String(error?.message || error).slice(0, 200));
}

function UnavailableScreen({ name }) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="card" role="alert" data-testid="lazy-screen-unavailable" style={{ margin: 12, padding: 16 }}>
      <strong>Ten ekran nie jest jeszcze zapisany w telefonie.</strong>
      <p className="muted" style={{ margin: "8px 0 12px" }}>
        {offline
          ? "Brak internetu. Gdy wróci zasięg, otwórz go ponownie — aplikacja pobierze go automatycznie."
          : "Nie udało się pobrać ekranu. Spróbuj ponownie."}
      </p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (typeof window !== "undefined") window.location.reload();
        }}
        disabled={offline}
      >
        Odśwież aplikację
      </button>
      <span hidden>{name}</span>
    </div>
  );
}

function screenNameFrom(importer) {
  const match = /import\(["'`]([^"'`]+)["'`]\)/.exec(String(importer));
  return match ? match[1].split('/').pop().replace(/\.(?:jsx?|tsx?)$/, '') : 'ekran';
}

// Zamiennik React.lazy: ten sam zapis `lazy(() => import("…"))`, ale nieudane pobranie pliku ekranu
// daje komunikat zamiast białego ekranu.
export function lazy(importer, name = screenNameFrom(importer)) {
  return reactLazy(() => importer().catch((error) => {
    logChunkFailure(name, error);
    return { default: function LazyScreenUnavailable() { return <UnavailableScreen name={name} />; } };
  }));
}

export const lazySafe = lazy;
