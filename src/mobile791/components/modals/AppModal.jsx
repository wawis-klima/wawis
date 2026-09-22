import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { blockBeforeUnload, blockUpdateReload } from "../../../modules/update-reload-guard.js";

export default function AppModal({
  open,
  onClose,
  children,
  overlayClassName = "",
  contentClassName = "card modal",
  contentRef = null,
  closeOnOverlay = true,
  closeOnEscape = true,
  overlayStyle = undefined,
  contentStyle = undefined,
  warnBeforeUnload = false,
  lockPagePosition = false,
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    return blockUpdateReload("mobile-app-modal");
  }, [open]);

  useEffect(() => {
    if (!open || !warnBeforeUnload || typeof document === "undefined") return undefined;
    return blockBeforeUnload("mobile-app-modal-unsaved-work");
  }, [open, warnBeforeUnload]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const body = document.body;
    const root = document.documentElement;
    const previousBodyStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };
    const previousRootStyles = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };
    const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;

    body.style.overflow = "hidden";
    if (lockPagePosition) {
      root.style.overflow = "hidden";
      root.style.overscrollBehavior = "none";
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.left = `-${scrollX}px`;
      body.style.right = "0";
      body.style.width = "100%";
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) {
        onClose?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      body.style.overflow = previousBodyStyles.overflow;
      body.style.position = previousBodyStyles.position;
      body.style.top = previousBodyStyles.top;
      body.style.left = previousBodyStyles.left;
      body.style.right = previousBodyStyles.right;
      body.style.width = previousBodyStyles.width;
      root.style.overflow = previousRootStyles.overflow;
      root.style.overscrollBehavior = previousRootStyles.overscrollBehavior;
      document.removeEventListener("keydown", handleKeyDown);

      if (lockPagePosition && typeof window !== "undefined") {
        window.scrollTo(scrollX, scrollY);
      }
    };
  }, [closeOnEscape, lockPagePosition, onClose, open]);

  if (!open) return null;

  const modalContent = (
    <div
      className={`overlay appModalOverlay ${overlayClassName}`.trim()}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
      role="presentation"
    >
      <div
        ref={contentRef}
        className={contentClassName}
        style={contentStyle}
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
