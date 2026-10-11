import React, { useEffect, useRef, useState } from "react";
import { getGoogleMapsUrl } from "../../utils/jobHelpers.jsx";
import { canEditJob } from "../../utils/jobPermissions.js";
import { IconCamera, IconFileText, IconMapPin, IconPhone } from "../ui.jsx";

const WIDTH = 144;
const SWIPE_THRESHOLD = 38;

// Swipe right = job tools; swipe left = existing contact actions.
// Actions reuse the same editing / protocol flows and do not modify the job.
export default function SwipeableJobCard({
  job, isAdmin, openSide = "", onOpenLeft, onOpenRight, onClose, onNameplates, onProtocol, children,
}) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(null);
  const phone = String(job?.phone || "").replace(/[^\d+]/g, "");
  const phoneHref = /\d{6}/.test(phone) ? "tel:" + phone : "";
  const mapsHref = getGoogleMapsUrl(job);
  const canOpenNameplates = canEditJob(job, isAdmin);
  const status = String(job?.status || "").trim();
  const canOpenProtocol = status === "Zakończone" || (!isAdmin && status === "W trakcie");
  const base = openSide === "left" ? -WIDTH : openSide === "right" ? WIDTH : 0;

  useEffect(() => setOffset(null), [openSide, job?.id]);

  function pointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.target.closest(".wawisSwipeForeground") && !e.target.closest(".wawisSwipeActions")) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: base, horizontal: false, vertical: false };
  }

  function pointerMove(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.vertical) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g.vertical = true; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
      g.horizontal = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setOffset(Math.max(-WIDTH, Math.min(WIDTH, g.start + dx)));
  }

  function pointerUp(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.horizontal) {
      if (g.vertical) {
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 400);
      }
      return;
    }
    const dx = e.clientX - g.x;
    // A swipe in the opposite direction first closes the currently open side.
    // The next swipe can reveal actions on the other side; no surprise actions.
    if (g.start < 0) {
      if (dx >= SWIPE_THRESHOLD) onClose();
      else onOpenLeft();
    } else if (g.start > 0) {
      if (dx <= -SWIPE_THRESHOLD) onClose();
      else onOpenRight();
    } else if (dx <= -SWIPE_THRESHOLD) onOpenLeft();
    else if (dx >= SWIPE_THRESHOLD) onOpenRight();
    else onClose();
    setOffset(null);
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 400);
  }

  function pointerCancel() { gesture.current = null; setOffset(null); }
  function clickCapture(e) {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  }

  const x = offset == null ? base : offset;
  return (
    <div
      className={"wawisSwipeFrame" + (openSide ? " isOpen" : "") + (openSide === "left" ? " isLeftOpen" : "") + (openSide === "right" ? " isRightOpen" : "") + (offset != null ? " isDragging" : "")}
      data-swipe-job-id={String(job?.id || "")}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={pointerCancel} onClickCapture={clickCapture}
    >
      <div className="wawisSwipeActions isLeft" aria-hidden={openSide !== "right"}>
        <button type="button" className="wawisSwipeAction isNameplates" tabIndex={openSide === "right" ? 0 : -1}
          disabled={!canOpenNameplates} onClick={() => { onClose(); onNameplates(job); }}
          aria-label="Otwórz tabliczki montażu" title={canOpenNameplates ? "Otwórz urządzenia i tabliczki" : "Edycja tabliczek jest niedostępna dla tego zlecenia"}>
          <IconCamera /><span>Tabliczki</span>
        </button>
        <button type="button" className="wawisSwipeAction isProtocol" tabIndex={openSide === "right" ? 0 : -1}
          disabled={!canOpenProtocol} onClick={() => { onClose(); onProtocol(job); }}
          aria-label="Otwórz protokół montażu" title={canOpenProtocol ? "Otwórz protokół montażowy" : "Protokół jest niedostępny dla tego statusu i roli"}>
          <IconFileText /><span>Protokół</span>
        </button>
      </div>
      <div className="wawisSwipeActions isRight" aria-hidden={openSide !== "left"}>
        {phoneHref ? <a className="wawisSwipeAction isPhone" href={phoneHref} tabIndex={openSide === "left" ? 0 : -1} onClick={onClose} aria-label="Zadzwoń do klienta"><IconPhone/><span>Zadzwoń</span></a>
          : <span className="wawisSwipeAction isDisabled"><IconPhone/><span>Brak tel.</span></span>}
        {mapsHref ? <a className="wawisSwipeAction isMap" href={mapsHref} target="_blank" rel="noopener noreferrer" tabIndex={openSide === "left" ? 0 : -1} onClick={onClose} aria-label="Nawiguj do klienta"><IconMapPin/><span>Nawiguj</span></a>
          : <span className="wawisSwipeAction isDisabled"><IconMapPin/><span>Brak adresu</span></span>}
      </div>
      <div className="wawisSwipeForeground" style={{ transform: "translate3d(" + x + "px,0,0)" }}>{children}</div>
    </div>
  );
}
