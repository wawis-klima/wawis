import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { blockBeforeUnload, blockUpdateReload } from "../../modules/update-reload-guard.js";

export default function AppModal({
  open,
  onClose,
  children,
  overlayClassName = "",
  contentClassName = "card modal",
  closeOnOverlay = true,
  closeOnEscape = true,
  warnBeforeUnload = false,
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    return blockUpdateReload("desktop-app-modal");
  }, [open]);

  useEffect(() => {
    if (!open || !warnBeforeUnload || typeof document === "undefined") return undefined;
    return blockBeforeUnload("desktop-app-modal-unsaved-work");
  }, [open, warnBeforeUnload]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeOnEscape, onClose, open]);

  if (!open) return null;

  const modalContent = (
    <div
      className={`overlay appModalOverlay ${overlayClassName}`.trim()}
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
      role="presentation"
    >
      <div
        className={contentClassName}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
