import React, { useRef, useState } from "react";
import AppModal from "../modals/AppModal.jsx";
import { canEditJob } from "../../utils/jobPermissions.js";
import { getGoogleMapsUrl } from "../../utils/jobHelpers.jsx";
import { IconCamera, IconFileText, IconMapPin, IconPhone } from "../ui.jsx";

export default function MobileQuickActionsSheet({ job, isAdmin, onClose, onNameplates, onProtocol, onShowDetails }) {
  const startY = useRef(null);
  const [dragY, setDragY] = useState(0);
  if (!job) return null;
  const status = String(job.status || "").trim();
  const canOpenNameplates = canEditJob(job, isAdmin);
  const canOpenProtocol = status === "Zakończone" || (!isAdmin && status === "W trakcie");
  const phone = String(job.phone || "").replace(/[^\d+]/g, "");
  const phoneHref = /\d{6}/.test(phone) ? "tel:" + phone : "";
  const mapsHref = getGoogleMapsUrl(job);
  const client = String(job.client || job.title || "Klient");

  function beginDrag(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    startY.current = { id: event.pointerId, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function updateDrag(event) {
    if (startY.current?.id !== event.pointerId) return;
    setDragY(Math.min(190, Math.max(0, event.clientY - startY.current.y)));
  }
  function endDrag(event) {
    if (startY.current?.id !== event.pointerId) return;
    const distance = event.clientY - startY.current.y;
    startY.current = null;
    setDragY(0);
    if (distance > 72) onClose();
  }
  function launch(action) {
    onClose();
    action?.(job);
  }

  return (
    <AppModal open onClose={onClose}
      overlayClassName="wawisQuickSheetOverlay" contentClassName="wawisQuickSheet"
      contentStyle={dragY ? { transform: "translateY(" + dragY + "px)", transition: "none" } : undefined}
      lockPagePosition>
      <div className="wawisQuickSheetHandleArea"
        onPointerDown={beginDrag} onPointerMove={updateDrag} onPointerUp={endDrag}
        onPointerCancel={() => { startY.current = null; setDragY(0); }}
        aria-hidden="true"><span className="wawisQuickSheetHandle" /></div>
      <div className="wawisQuickSheetHeader">
        <div className="wawisQuickSheetHeading">
          <strong id="wawis-quick-sheet-title">Szybkie działania</strong>
          <span title={client}>{client}</span>
        </div>
        <button type="button" className="wawisQuickSheetClose" onClick={onClose} aria-label="Zamknij szybkie działania">×</button>
      </div>
      <div className="wawisQuickSheetGrid" aria-labelledby="wawis-quick-sheet-title">
        {phoneHref ? <a className="wawisQuickSheetTile" href={phoneHref} onClick={onClose}>
          <IconPhone/><span>Zadzwoń</span>
        </a> : <button type="button" className="wawisQuickSheetTile" disabled><IconPhone/><span>Brak telefonu</span></button>}
        {mapsHref ? <a className="wawisQuickSheetTile" href={mapsHref} target="_blank" rel="noopener noreferrer" onClick={onClose}>
          <IconMapPin/><span>Nawigacja</span>
        </a> : <button type="button" className="wawisQuickSheetTile" disabled><IconMapPin/><span>Brak adresu</span></button>}
        <button type="button" className="wawisQuickSheetTile" disabled={!canOpenNameplates}
          onClick={() => launch(onNameplates)}><IconCamera/><span>Tabliczki</span></button>
        <button type="button" className="wawisQuickSheetTile" disabled={!canOpenProtocol}
          onClick={() => launch(onProtocol)}><IconFileText/><span>Protokół</span></button>
      </div>
      <button type="button" className="wawisQuickSheetDetails" onClick={() => launch(onShowDetails)}>
        Pokaż szczegóły montażu <span aria-hidden="true">→</span>
      </button>
    </AppModal>
  );
}
