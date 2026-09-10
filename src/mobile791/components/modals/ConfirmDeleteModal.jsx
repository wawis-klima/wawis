import React from "react";
import AppModal from "./AppModal.jsx";

export default function ConfirmDeleteModal({ jobToDelete, setJobToDelete, confirmDeleteJob, busy }) {
  return (
    <AppModal
      open={Boolean(jobToDelete)}
      onClose={() => setJobToDelete(null)}
      overlayClassName="confirmDeleteOverlay"
      contentClassName="card modal formModal confirmDeleteModal"
    >
      <h2>Usunąć kartę montażu?</h2>
      <p className="muted">Czy na pewno chcesz usunąć: <strong>{jobToDelete?.title}</strong>?</p>
      <div className="row rightAlign">
        <button className="btn" onClick={() => setJobToDelete(null)}>Anuluj</button>
        <button className="btn deleteCardBtn" onClick={confirmDeleteJob} disabled={busy}>Usuń na stałe</button>
      </div>
    </AppModal>
  );
}
