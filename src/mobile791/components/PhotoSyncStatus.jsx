import React, { useEffect, useMemo, useState } from "react";
import AppModal from "./modals/AppModal.jsx";
import { PHOTO_SYNC_CENTER_CSS } from "./photo-sync-center.css.js";
import { confirmAndDeleteHeldPhotos, confirmAndRepairPhotoQueue, confirmAndSendHeldPhotos } from "../modules/photo-queue-repair.js";
import { isPhotoQueueItemHeld } from "../modules/photo-offline-queue.js";
import { logDiagnostic } from "../modules/diagnostics.js";

function formatDateTime(value) {
  if (!value) return "Jeszcze nie wykonano";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Brak";
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getQueueItemStatus(item = {}) {
  if (isPhotoQueueItemHeld(item)) return { key: "error", label: "Wstrzymane" };
  const status = String(item.upload_status || "local").toLowerCase();
  if (status === "error") return { key: "error", label: "Błąd wysyłania" };
  if (status === "uploading") return { key: "uploading", label: "Wysyłanie" };
  return { key: "local", label: "Na telefonie" };
}

function getItemLabel(item = {}) {
  if (item.documentation_label) return item.documentation_label;
  if (item.photo_kind === "nameplate") return "Tabliczka znamionowa";
  return "Zdjęcie montażu";
}

function getJobLabel(jobs = [], jobId) {
  const job = jobs.find((candidate) => String(candidate?.id || "") === String(jobId || ""));
  if (!job) return `Zlecenie ${String(jobId || "").slice(0, 8) || "bez identyfikatora"}`;
  return job.client || job.title || "Zlecenie bez nazwy klienta";
}

function getJobLocation(jobs = [], jobId) {
  const job = jobs.find((candidate) => String(candidate?.id || "") === String(jobId || ""));
  if (!job) return "";
  return [job.city, job.street].filter(Boolean).join(", ");
}

function getOperationLabel(item = {}) {
  if (item.type === 'comment') return 'Komentarz';
  if (item.type === 'device') return 'Dane urządzenia i tabliczek';
  if (item.type === 'status') return item.payload?.status === 'Zakończone' ? 'Zakończenie montażu' : 'Zmiana statusu';
  return 'Zmiana montażu';
}

function getOperationStatus(item = {}) {
  const status = String(item.status || 'pending').toLowerCase();
  if (status === 'conflict') return { key: 'error', label: 'Konflikt — nie wysłano' };
  if (status === 'error') return { key: 'error', label: 'Błąd synchronizacji' };
  if (status === 'syncing') return { key: 'uploading', label: 'Wysyłanie' };
  return { key: 'local', label: 'Na telefonie' };
}

export default function PhotoSyncStatus({
  status,
  jobs = [],
  onRetryPhoto,
  onRetryAll,
  onRetryOperation,
  onDiscardOperation,
  onDiscardPhoto,
  onOpenJob,
  // 13.67: na pierwszej stronie pasek tylko przy problemie (brak internetu, niewysłane, błędy, wysyłanie).
  // Pełny stan połączenia i synchronizacji pokazuje Diagnostyka (stuknięcie numeru wersji).
  hideWhenHealthy = false,
}) {
  const [open, setOpen] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [legacyBusy, setLegacyBusy] = useState(false);
  const queueItems = Array.isArray(status?.queueItems) ? status.queueItems : [];
  const operationItems = Array.isArray(status?.operationItems) ? status.operationItems : [];
  const online = status?.connection?.tone !== "offline";

  const retryableItems = useMemo(
    // 13.64: „Synchronizuj teraz” obejmuje także zdjęcia zawieszone jako „Wysyłane”; wstrzymanych starych nie rusza.
    () => queueItems.filter((item) => !isPhotoQueueItemHeld(item)),
    [queueItems],
  );
  const retryableOperations = useMemo(
    () => operationItems.filter((item) => item.status !== 'syncing' && item.status !== 'conflict'),
    [operationItems],
  );
  const retryableCount = retryableItems.length + retryableOperations.length;

  useEffect(() => {
    if (open) void status?.refreshQueueSummary?.();
  }, [open, status?.refreshQueueSummary]);

  if (!status) return null;

  const queueReadError = status?.queueReadError || null;
  const heldCount = queueItems.filter(isPhotoQueueItemHeld).length;

  async function handleSendHeld() {
    if (legacyBusy || !online) return;
    setLegacyBusy(true);
    try {
      await confirmAndSendHeldPhotos({
        count: heldCount,
        logFn: (event, payload) => logDiagnostic(event, payload),
        onReleased: async () => { await onRetryAll?.(); },
      });
      await status.refreshQueueSummary?.();
    } finally {
      setLegacyBusy(false);
    }
  }

  async function handleDeleteHeld() {
    if (legacyBusy) return;
    setLegacyBusy(true);
    try {
      await confirmAndDeleteHeldPhotos({
        count: heldCount,
        logFn: (event, payload) => logDiagnostic(event, payload),
        onDeleted: () => {
          if (typeof window !== "undefined") window.location.reload();
        },
      });
      await status.refreshQueueSummary?.();
    } finally {
      setLegacyBusy(false);
    }
  }

  async function handleRepairQueue() {
    if (repairing) return;
    setRepairing(true);
    try {
      await confirmAndRepairPhotoQueue({
        logFn: (event, payload) => logDiagnostic(event, payload),
        onRepaired: () => {
          if (typeof window !== "undefined") window.location.reload();
        },
      });
      await status.refreshQueueSummary?.();
    } finally {
      setRepairing(false);
    }
  }

  async function handleRetryAll() {
    if (!online || retryingAll || !retryableCount) return;
    setRetryingAll(true);
    try {
      await onRetryAll?.();
      await status.refreshQueueSummary?.();
    } finally {
      setRetryingAll(false);
    }
  }

  const offline = status.connection?.tone === "offline";
  const healthy = status.sync?.tone === "synced" && !offline;
  const showRow = !hideWhenHealthy || !healthy;
  const showConnectionChip = !hideWhenHealthy || offline;

  return (
    <>
      <style>{PHOTO_SYNC_CENTER_CSS}</style>
      {showRow ? (
      <div
        className="mobileConnectionSyncRow"
        role="status"
        aria-live="polite"
        aria-label={`Połączenie: ${status.connection.label}. ${status.sync.label}. Kliknij, aby otworzyć centrum synchronizacji.`}
      >
        <button
          type="button"
          className="mobileConnectionSyncButton"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Otwórz Centrum synchronizacji"
        >
          {showConnectionChip ? (
            <span className={`connectionSyncChip connection-${status.connection.tone}`}>
              <span className="connectionSyncDot" aria-hidden="true" />
              Połączenie: {status.connection.label}
            </span>
          ) : null}
          <span className={`connectionSyncChip sync-${status.sync.tone}`}>
            <span className="connectionSyncDot" aria-hidden="true" />
            {status.sync.label}
            <span className="mobileConnectionSyncChevron" aria-hidden="true">›</span>
          </span>
        </button>
      </div>
      ) : null}

      <AppModal
        open={open}
        onClose={() => setOpen(false)}
        overlayClassName="photoSyncCenterOverlay"
        contentClassName="photoSyncCenterModal"
      >
        <div className="photoSyncCenterHandle" aria-hidden="true" />
        <header className="photoSyncCenterHeader">
          <div>
            <h2>Synchronizacja</h2>
            <p>Synchronizacja zdjęć i zmian montażu odbywa się automatycznie po odzyskaniu internetu.</p>
          </div>
          <button type="button" className="photoSyncCenterClose" onClick={() => setOpen(false)} aria-label="Zamknij">×</button>
        </header>

        <section className="photoSyncCenterSummary" aria-label="Podsumowanie synchronizacji">
          <div className={`photoSyncSummaryCard ${online ? "good" : "error"}`}>
            <span>Internet</span>
            <strong>{status.connection.label}</strong>
          </div>
          <div className={`photoSyncSummaryCard ${status.queueSummary?.error ? "error" : status.queueSummary?.total ? "warn" : "good"}`}>
            <span>Na telefonie</span>
            <strong>{(status.queueSummary?.total || 0) + (status.operationSummary?.total || 0)}</strong>
          </div>
          <div className="photoSyncSummaryCard">
            <span>Ostatnia synchronizacja</span>
            <strong>{formatDateTime(status.lastSyncedAt)}</strong>
          </div>
        </section>

        <div className="photoSyncCenterActions">
          <button
            type="button"
            className="photoSyncCenterPrimary"
            disabled={!online || !retryableCount || retryingAll}
            onClick={handleRetryAll}
          >
            {retryingAll ? "Synchronizowanie…" : `Synchronizuj teraz${retryableCount ? ` (${retryableCount})` : ""}`}
          </button>
          <button type="button" className="photoSyncCenterSecondary" onClick={() => status.refreshQueueSummary?.()}>
            Odśwież
          </button>
        </div>

        {queueReadError ? (
          <div className="photoSyncItemError" role="alert" data-testid="photo-queue-read-error">
            <strong>Kolejka zdjęć na tym telefonie jest niedostępna.</strong>{" "}
            {queueReadError.message} (kod: {queueReadError.code})
          </div>
        ) : null}

        {heldCount > 0 ? (
          <div className="photoSyncItemError" role="alert" data-testid="photo-queue-legacy-hold">
            <strong>Na telefonie są stare, niewysłane zdjęcia z 22.10 ({heldCount}).</strong>{" "}
            Nie wysyłają się automatycznie. Wybierz, co z nimi zrobić. Mogły zostać już dodane do montażu w inny sposób.
            <div className="photoSyncItemButtons" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="photoSyncItemAction retry"
                disabled={!online || legacyBusy}
                onClick={handleSendHeld}
                data-testid="photo-queue-legacy-send"
              >
                Wyślij stare zdjęcia
              </button>
              <button
                type="button"
                className="photoSyncItemAction remove"
                disabled={legacyBusy}
                onClick={handleDeleteHeld}
                data-testid="photo-queue-legacy-delete"
              >
                Usuń stare zdjęcia
              </button>
            </div>
          </div>
        ) : null}

        <div className="photoSyncCenterList">
          {queueItems.length === 0 && operationItems.length === 0 && !queueReadError ? (
            <div className="photoSyncEmpty">
              <strong>Wszystko wysłane</strong>
              <span>Na telefonie nie ma oczekujących zdjęć ani zmian montażu.</span>
            </div>
          ) : queueItems.map((item) => {
            const itemStatus = getQueueItemStatus(item);
            const location = getJobLocation(jobs, item.job_id);
            return (
              <article className="photoSyncItem" key={item.id}>
                <div className="photoSyncItemTop">
                  <div className="photoSyncItemTitle">
                    <strong>{getItemLabel(item)}</strong>
                    <span>{getJobLabel(jobs, item.job_id)}{location ? ` · ${location}` : ""}</span>
                  </div>
                  <span className={`photoSyncItemBadge ${itemStatus.key}`}>{itemStatus.label}</span>
                </div>
                {item.upload_error ? <div className="photoSyncItemError">{item.upload_error}</div> : null}
                <div className="photoSyncItemFooter">
                  <div className="photoSyncItemMeta">
                    Dodano: {formatDateTime(item.created_at)}
                    {item.retry_count ? ` · próby: ${item.retry_count}` : ""}
                  </div>
                  <div className="photoSyncItemButtons">
                    <button
                      type="button"
                      className="photoSyncItemAction"
                      onClick={() => {
                        onOpenJob?.(item.job_id);
                        setOpen(false);
                      }}
                    >
                      Otwórz
                    </button>
                    <button
                      type="button"
                      className="photoSyncItemAction retry"
                      disabled={!online || itemStatus.key === "uploading"}
                      onClick={() => onRetryPhoto?.(item)}
                    >
                      {itemStatus.key === "uploading" ? "Wysyłanie" : "Wyślij"}
                    </button>
                    {itemStatus.key !== "uploading" ? (
                      <button
                        type="button"
                        className="photoSyncItemAction remove"
                        onClick={async () => {
                          const removed = await onDiscardPhoto?.(item);
                          if (removed) await status.refreshQueueSummary?.();
                        }}
                      >
                        Usuń
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {operationItems.map((item) => {
            const itemStatus = getOperationStatus(item);
            const location = getJobLocation(jobs, item.job_id);
            const isConflict = item.status === 'conflict';
            return (
              <article className="photoSyncItem" key={item.id}>
                <div className="photoSyncItemTop">
                  <div className="photoSyncItemTitle">
                    <strong>{getOperationLabel(item)}</strong>
                    <span>{getJobLabel(jobs, item.job_id)}{location ? ` · ${location}` : ''}</span>
                  </div>
                  <span className={`photoSyncItemBadge ${itemStatus.key}`}>{itemStatus.label}</span>
                </div>
                {item.error ? <div className="photoSyncItemError">{item.error}</div> : null}
                <div className="photoSyncItemFooter">
                  <div className="photoSyncItemMeta">
                    Dodano: {formatDateTime(item.created_at)}
                    {item.retry_count ? ` · próby: ${item.retry_count}` : ''}
                  </div>
                  <div className="photoSyncItemButtons">
                    <button type="button" className="photoSyncItemAction" onClick={() => {
                      onOpenJob?.(item.job_id);
                      setOpen(false);
                    }}>Otwórz</button>
                    {isConflict ? (
                      <button type="button" className="photoSyncItemAction" onClick={() => onDiscardOperation?.(item)}>
                        Zachowaj dane z systemu
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="photoSyncItemAction retry"
                        disabled={!online || item.status === 'syncing'}
                        onClick={() => onRetryOperation?.(item)}
                      >
                        {item.status === 'syncing' ? 'Wysyłanie' : 'Wyślij'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="photoSyncCenterActions">
          <button
            type="button"
            className="photoSyncCenterSecondary"
            onClick={handleRepairQueue}
            disabled={repairing}
            data-testid="photo-queue-repair"
          >
            {repairing ? "Naprawianie…" : "Napraw kolejkę zdjęć"}
          </button>
        </div>

        <div className="photoSyncCenterFootnote">
          Nie usuwaj aplikacji ani danych Safari, gdy na liście znajdują się niewysłane elementy. „Napraw kolejkę zdjęć” usuwa wyłącznie niewysłane zdjęcia z tego telefonu — po wyraźnym potwierdzeniu.
        </div>
      </AppModal>
    </>
  );
}
