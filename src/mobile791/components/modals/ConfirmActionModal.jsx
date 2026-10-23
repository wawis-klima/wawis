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

// 13.59: Inline layout intentionally has NO .modal/.formModal/.row/.btn classes.
// Those shared mobile styles (and PWA cached CSS) previously caused the giant stacked dialog.
const FINISH_PANEL = {
  boxSizing: "border-box",
  display: "block",
  width: "min(360px, calc(100vw - 40px))",
  maxWidth: "calc(100vw - 40px)",
  maxHeight: "calc(100dvh - 40px)",
  overflowY: "auto",
  margin: 0,
  padding: "18px",
  background: "#fff",
  color: "#10203a",
  border: "1px solid #d8e0ec",
  borderRadius: "18px",
  boxShadow: "0 16px 38px rgba(16,32,58,.18)",
};
const FINISH_TITLE = {
  margin: 0, color: "#10203a", fontSize: "20px",
  fontWeight: 800, lineHeight: 1.2, letterSpacing: "-.015em",
};
const FINISH_MESSAGE = {
  margin: "8px 0 0", color: "#62748b",
  fontSize: "14px", lineHeight: 1.4,
};
const FINISH_ACTIONS = {
  display: "grid",
  gridTemplateColumns: "minmax(0, .94fr) minmax(0, 1.34fr)",
  gap: "8px", alignItems: "stretch",
  width: "100%", marginTop: "16px",
};
const FINISH_BUTTON_BASE = {
  boxSizing: "border-box",
  display: "flex", alignItems: "center", justifyContent: "center",
  width: "100%", minWidth: 0, height: "44px", minHeight: "44px",
  padding: "8px 6px", margin: 0,
  fontFamily: "inherit", fontSize: "14px", lineHeight: 1.1,
  whiteSpace: "nowrap", textAlign: "center",
  borderRadius: "12px", cursor: "pointer",
};
const FINISH_CANCEL = {
  ...FINISH_BUTTON_BASE,
  background: "#fff", border: "1px solid #c9d3e3",
  color: "#10203a", fontWeight: 500,
};
const FINISH_CONFIRM = {
  ...FINISH_BUTTON_BASE,
  background: "#dcecff", border: "1px solid #b7d4ff",
  color: "#10203a", fontWeight: 700,
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
  compact = false,
}) {
  const variantConfig = VARIANT_CONFIG[variant] || VARIANT_CONFIG.default;

  if (compact) {
    return (
      <AppModal
        open={open}
        onClose={busy ? undefined : onClose}
        overlayClassName="confirmDeleteOverlay"
        contentClassName="wawisFinishPrompt1359"
        contentStyle={FINISH_PANEL}
        closeOnOverlay={!busy}
        closeOnEscape={!busy}
      >
        <div role="heading" aria-level={2} style={FINISH_TITLE}>{title || "Czy na pewno?"}</div>
        {message ? <div style={FINISH_MESSAGE}>{message}</div> : null}
        <div data-testid="finish-reminder-actions" style={FINISH_ACTIONS}>
          <button
            type="button" style={FINISH_CANCEL}
            onClick={onClose} disabled={busy}
          >{cancelLabel || variantConfig.cancelLabel}</button>
          <button
            type="button" style={FINISH_CONFIRM}
            onClick={onConfirm} disabled={busy}
          >{busy ? "Trwa..." : (confirmLabel || variantConfig.confirmLabel)}</button>
        </div>
      </AppModal>
    );
  }

  // All other confirmations keep their original UI and behaviour.
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
