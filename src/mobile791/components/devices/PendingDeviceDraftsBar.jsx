import React, { useEffect, useState } from "react";
import { DEVICE_DRAFTS_CHANGED_EVENT, listDeviceFormDrafts } from "../../modules/device-form-drafts.js";
import { PROTOCOL_DRAFTS_CHANGED_EVENT, listProtocolSignatureDrafts } from "../../modules/protocol-signature-drafts.js";

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

// 13.79: także niezapisane protokoły z podpisem klienta (podpis złożony bez internetu).
function listAllDrafts() {
  return [
    ...listDeviceFormDrafts().map((draft) => ({ ...draft, kind: "devices" })),
    ...listProtocolSignatureDrafts().map((draft) => ({ ...draft, kind: "protocol" })),
  ];
}

export default function PendingDeviceDraftsBar({ jobs = [], onSaveNow, onSaveProtocolNow = null }) {
  const [drafts, setDrafts] = useState(() => listAllDrafts());
  const [online, setOnline] = useState(isOnline);
  const [busyJobId, setBusyJobId] = useState("");

  useEffect(() => {
    const refresh = () => {
      setDrafts(listAllDrafts());
      setOnline(isOnline());
    };
    window.addEventListener(DEVICE_DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener(PROTOCOL_DRAFTS_CHANGED_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    refresh();
    return () => {
      window.removeEventListener(DEVICE_DRAFTS_CHANGED_EVENT, refresh);
      window.removeEventListener(PROTOCOL_DRAFTS_CHANGED_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  if (!online || !drafts.length) return null;
  const rows = drafts
    .map((draft) => ({ ...draft, job: jobs.find((job) => String(job?.id || "") === String(draft.jobId)) }))
    .filter((row) => row.job && (row.kind !== "protocol" || onSaveProtocolNow));
  if (!rows.length) return null;

  async function handleSave(row) {
    if (busyJobId) return;
    setBusyJobId(`${row.kind}:${row.jobId}`);
    try {
      if (row.kind === "protocol") await onSaveProtocolNow?.(row.job);
      else await onSaveNow?.(row.job);
    } finally {
      setBusyJobId("");
    }
  }

  return (
    <div role="status" data-testid="pending-device-drafts" style={BAR_STYLE}>
      {rows.slice(0, 3).map((row) => (
        <div key={`${row.kind}:${row.jobId}`} style={ROW_STYLE}>
          <span style={TEXT_STYLE}>
            {row.kind === "protocol" ? "Niezapisany protokół (podpis klienta)" : "Niezapisane tabliczki"}: <strong>{jobLabel(row.job)}</strong>
          </span>
          <button
            type="button"
            className="btn primary"
            data-testid={row.kind === "protocol" ? "pending-protocol-drafts-save" : "pending-device-drafts-save"}
            disabled={Boolean(busyJobId)}
            onClick={() => handleSave(row)}
            style={{ flex: "0 0 auto", padding: "8px 12px" }}
          >
            {busyJobId === `${row.kind}:${row.jobId}` ? "Otwieram…" : "Zapisz teraz"}
          </button>
        </div>
      ))}
      {rows.length > 3 ? <span style={TEXT_STYLE}>…i jeszcze {rows.length - 3}</span> : null}
    </div>
  );
}
