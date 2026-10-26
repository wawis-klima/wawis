import React, { useEffect, useState } from "react";
import { DEVICE_DRAFTS_CHANGED_EVENT, listDeviceFormDrafts } from "../../modules/device-form-drafts.js";

// WAWIS 13.72 (decyzja właściciela 26.10.2026): po powrocie internetu przypomnienie o urządzeniach i tabliczkach
// wpisanych bez internetu. „Zapisz teraz” otwiera ten montaż i od razu uruchamia zwykły zapis — z tymi samymi
// kontrolami co ręczny (potwierdzenie SN, ostrzeżenia, konflikty). Nic nie zapisuje się bez dotknięcia.

const BAR_STYLE = {
  display: "grid",
  gap: 6,
  margin: "8px 0",
  padding: "10px 12px",
  borderRadius: 14,
  border: "1px solid #f2c94c",
  background: "#fff8e1",
  color: "#5c4400",
};
const ROW_STYLE = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const TEXT_STYLE = { minWidth: 0, fontSize: 14, lineHeight: 1.25, overflowWrap: "anywhere" };

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function jobLabel(job) {
  return String(job?.client || job?.title || "").trim() || "montaż";
}

export default function PendingDeviceDraftsBar({ jobs = [], onSaveNow }) {
  const [drafts, setDrafts] = useState(() => listDeviceFormDrafts());
  const [online, setOnline] = useState(isOnline);
  const [busyJobId, setBusyJobId] = useState("");

  useEffect(() => {
    const refresh = () => {
      setDrafts(listDeviceFormDrafts());
      setOnline(isOnline());
    };
    window.addEventListener(DEVICE_DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    refresh();
    return () => {
      window.removeEventListener(DEVICE_DRAFTS_CHANGED_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (!online || !drafts.length) return null;
  const rows = drafts
    .map((draft) => ({ ...draft, job: jobs.find((job) => String(job?.id || "") === String(draft.jobId)) }))
    .filter((row) => row.job);
  if (!rows.length) return null;

  async function handleSave(row) {
    if (busyJobId) return;
    setBusyJobId(row.jobId);
    try {
      await onSaveNow?.(row.job);
    } finally {
      setBusyJobId("");
    }
  }

  return (
    <div role="status" data-testid="pending-device-drafts" style={BAR_STYLE}>
      {rows.slice(0, 3).map((row) => (
        <div key={row.jobId} style={ROW_STYLE}>
          <span style={TEXT_STYLE}>
            Niezapisane tabliczki: <strong>{jobLabel(row.job)}</strong>
          </span>
          <button
            type="button"
            className="btn primary"
            data-testid="pending-device-drafts-save"
            disabled={Boolean(busyJobId)}
            onClick={() => handleSave(row)}
            style={{ flex: "0 0 auto", padding: "8px 12px" }}
          >
            {busyJobId === row.jobId ? "Otwieram…" : "Zapisz teraz"}
          </button>
        </div>
      ))}
      {rows.length > 3 ? <span style={TEXT_STYLE}>…i jeszcze {rows.length - 3}</span> : null}
    </div>
  );
}
