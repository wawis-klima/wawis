import React, { useEffect, useState } from "react";
import { JOB_OFFLINE_CHANGED_EVENT, listOfflineJobOperations } from "../modules/job-offline-store.js";

// WAWIS 14.97 (decyzja właściciela 24.11.2026): pasek pojawia się WYŁĄCZNIE, gdy telefon nie ma internetu.
// Przy działającym internecie nic się nie wyświetla (także gdy w kolejce coś czeka).
function readOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function describePending(count) {
  if (!count) return "zmiany zapiszą się na telefonie";
  if (count === 1) return "1 zmiana czeka na wysłanie";
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${count} ${few ? "zmiany czekają" : "zmian czeka"} na wysłanie`;
}

export default function OfflineBanner({ userId }) {
  const [online, setOnline] = useState(readOnline);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const refreshCount = async () => {
      if (!userId) return;
      try {
        const operations = await listOfflineJobOperations(String(userId));
        if (!cancelled) setPending(operations.filter((item) => String(item?.status || "pending") !== "conflict").length);
      } catch {
        // Licznik jest informacyjny — błąd odczytu nie może zasłonić samego paska „Brak internetu”.
      }
    };
    const updateOnline = () => {
      setOnline(readOnline());
      void refreshCount();
    };
    void refreshCount();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshCount);
    return () => {
      cancelled = true;
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener(JOB_OFFLINE_CHANGED_EVENT, refreshCount);
    };
  }, [userId]);

  if (online) return null;
  return (
    <div className="wawisOfflineBanner" role="status" aria-live="polite" data-testid="offline-banner">
      <strong>Brak internetu</strong>
      <span> · {describePending(pending)}</span>
    </div>
  );
}
