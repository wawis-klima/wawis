import React from "react";
import AppModal from "./AppModal.jsx";

const VARIANT_CONFIG = {
  delete: {
    confirmClassName: "btn deleteCardBtn",
    confirmLabel: "Usuń",
    cancelLabel: "Anuluj",
  },
  warning: {
    confirmClassName: "btn primary",
    confirmLabel: "Tak, kontynuuj",
    cancelLabel: "Anuluj",
  },
  discard: {
    confirmClassName: "btn",
    confirmLabel: "Zamknij bez zapisu",
    cancelLabel: "Wróć",
  },
  default: {
    confirmClassName: "btn primary",
    confirmLabel: "OK",
    cancelLabel: "Anuluj",
  },
};

export default function ConfirmActionModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "default",
  busy = false,
}) {
  const variantConfig = VARIANT_CONFIG[variant] || VARIANT_CONFIG.default;

  return (
    <AppModal
      open={open}
      onClose={busy ? undefined : onClose}
      overlayClassName="confirmDeleteOverlay"
      contentClassName="card modal formModal confirmDeleteModal"
      closeOnOverlay={!busy}
      closeOnEscape={!busy}
    >
      <h2>{title || "Czy na pewno?"}</h2>
      {message ? <p className="muted">{message}</p> : null}
      <div className="row rightAlign">
        <button className="btn" onClick={onClose} disabled={busy}>{cancelLabel || variantConfig.cancelLabel}</button>
        <button className={variantConfig.confirmClassName} onClick={onConfirm} disabled={busy}>{busy ? "Trwa..." : (confirmLabel || variantConfig.confirmLabel)}</button>
      </div>
    </AppModal>
  );
}
