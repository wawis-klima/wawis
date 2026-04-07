import React from "react";

export default function ConfirmDeleteModal({ jobToDelete, setJobToDelete, confirmDeleteJob, busy }) {
  if (!jobToDelete) return null;

  return (
    <div className="overlay" onClick={() => setJobToDelete(null)}>
      <div className="card modal formModal" onClick={(e) => e.stopPropagation()}>
        <h2>Usunąć kartę montażu?</h2>
        <p className="muted">Czy na pewno chcesz usunąć: <strong>{jobToDelete.title}</strong>?</p>
        <div className="row rightAlign">
          <button className="btn" onClick={() => setJobToDelete(null)}>Anuluj</button>
          <button className="btn deleteCardBtn" onClick={confirmDeleteJob} disabled={busy}>Usuń na stałe</button>
        </div>
      </div>
    </div>
  );
}
