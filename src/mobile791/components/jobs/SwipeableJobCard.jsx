import React, { useEffect, useRef, useState } from "react";
import { getGoogleMapsUrl } from "../../utils/jobHelpers.jsx";
import { IconMapPin, IconPhone } from "../ui.jsx";
const WIDTH = 144;
export default function SwipeableJobCard({ job, open, onOpen, onClose, children }) {
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const [offset, setOffset] = useState(null);
  const phone = String(job?.phone || "").replace(/[^\d+]/g, "");
  const phoneHref = /\d{6}/.test(phone) ? "tel:" + phone : "";
  const mapsHref = getGoogleMapsUrl(job);
  useEffect(() => setOffset(null), [open, job?.id]);
  function pointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Allow closing by dragging from the revealed actions too; a plain tap still opens the link.
    if (!e.target.closest(".wawisSwipeForeground") && !e.target.closest(".wawisSwipeActions")) return;
    gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: open ? -WIDTH : 0, horizontal: false, vertical: false };
  }
  function pointerMove(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId || g.vertical) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.horizontal) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { g.vertical = true; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy) * 1.2 || (!open && dx > 0)) return;
      g.horizontal = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    setOffset(Math.max(-WIDTH, Math.min(0, g.start + dx)));
  }
  function pointerUp(e) {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.horizontal) {
      // Natural touch scroll is cancelled by the browser; mouse-driven
      // vertical drags must not accidentally expand a job either.
      if (g.vertical) {
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 400);
      }
      return;
    }
    const dx = e.clientX - g.x;
    const shouldOpen = Math.abs(dx) >= 38 ? dx < 0 : g.start + dx < -WIDTH / 2;
    if (shouldOpen) onOpen(); else onClose();
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
  const x = offset == null ? (open ? -WIDTH : 0) : offset;
  return (
    <div className={"wawisSwipeFrame" + (open ? " isOpen" : "") + (offset != null ? " isDragging" : "")}
      data-swipe-job-id={String(job?.id || "")}
      onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
      onPointerCancel={pointerCancel} onClickCapture={clickCapture}>
      <div className="wawisSwipeActions" aria-hidden={!open}>
        {phoneHref ? <a className="wawisSwipeAction isPhone" href={phoneHref} tabIndex={open ? 0 : -1} onClick={onClose} aria-label="Zadzwoń do klienta"><IconPhone/><span>Zadzwoń</span></a>
          : <span className="wawisSwipeAction isDisabled"><IconPhone/><span>Brak tel.</span></span>}
        {mapsHref ? <a className="wawisSwipeAction isMap" href={mapsHref} target="_blank" rel="noopener noreferrer" tabIndex={open ? 0 : -1} onClick={onClose} aria-label="Nawiguj do klienta"><IconMapPin/><span>Nawiguj</span></a>
          : <span className="wawisSwipeAction isDisabled"><IconMapPin/><span>Brak adresu</span></span>}
      </div>
      <div className="wawisSwipeForeground" style={{ transform: "translate3d(" + x + "px,0,0)" }}>{children}</div>
    </div>
  );
}
