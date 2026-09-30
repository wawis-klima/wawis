import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { blockBeforeUnload, blockUpdateReload } from "../../../modules/update-reload-guard.js";

const pageLockState = {
  count: 0,
  positionCount: 0,
  originalBody: null,
  originalRoot: null,
  scrollX: 0,
  scrollY: 0,
};

function capturePageLockBaseline(body, root) {
  pageLockState.originalBody = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
  };
  pageLockState.originalRoot = {
    overflow: root.style.overflow,
    overscrollBehavior: root.style.overscrollBehavior,
  };
}

function restorePositionLockStyles(body, root) {
  const originalBody = pageLockState.originalBody || {};
  const originalRoot = pageLockState.originalRoot || {};
  body.style.position = originalBody.position || "";
  body.style.top = originalBody.top || "";
  body.style.left = originalBody.left || "";
  body.style.right = originalBody.right || "";
  body.style.width = originalBody.width || "";
  root.style.overflow = originalRoot.overflow || "";
  root.style.overscrollBehavior = originalRoot.overscrollBehavior || "";
}

function acquirePageLock(lockPagePosition) {
  if (typeof document === "undefined") return () => {};

  const body = document.body;
  const root = document.documentElement;

  if (pageLockState.count === 0) {
    capturePageLockBaseline(body, root);
  }

  pageLockState.count += 1;
  body.style.overflow = "hidden";

  if (lockPagePosition) {
    if (pageLockState.positionCount === 0) {
      pageLockState.scrollX = typeof window !== "undefined" ? window.scrollX : 0;
      pageLockState.scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    }
    pageLockState.positionCount += 1;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.top = `-${pageLockState.scrollY}px`;
    body.style.left = `-${pageLockState.scrollX}px`;
    body.style.right = "0";
    body.style.width = "100%";
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const hadPositionLock = lockPagePosition && pageLockState.positionCount > 0;
    if (hadPositionLock) pageLockState.positionCount -= 1;
    pageLockState.count = Math.max(0, pageLockState.count - 1);

    if (pageLockState.count === 0) {
      const originalBody = pageLockState.originalBody || {};
      const originalRoot = pageLockState.originalRoot || {};
      body.style.overflow = originalBody.overflow || "";
      restorePositionLockStyles(body, root);
      root.style.overflow = originalRoot.overflow || "";
      root.style.overscrollBehavior = originalRoot.overscrollBehavior || "";

      if (hadPositionLock && typeof window !== "undefined") {
        window.scrollTo(pageLockState.scrollX, pageLockState.scrollY);
      }

      pageLockState.positionCount = 0;
      pageLockState.originalBody = null;
      pageLockState.originalRoot = null;
      return;
    }

    body.style.overflow = "hidden";
    if (hadPositionLock && pageLockState.positionCount === 0) {
      restorePositionLockStyles(body, root);
      if (typeof window !== "undefined") {
        window.scrollTo(pageLockState.scrollX, pageLockState.scrollY);
      }
    }
  };
}

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    return acquirePageLock(lockPagePosition);
  }, [lockPagePosition, open]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && closeOnEscape) {
        onCloseRef.current?.();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeOnEscape, open]);

  if (!open) return null;

  const modalContent = (
    <div
      className={`overlay appModalOverlay ${overlayClassName}`.trim()}
      style={overlayStyle}
      onMouseDown={(event) => {
        if (closeOnOverlay && event.target === event.currentTarget) {
          onCloseRef.current?.();
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
