import React from "react";
import { STATUSES } from "../../utils/jobHelpers.jsx";

export default function JobFormModal({ showModal, setShowModal, editingJobId, setEditingJobId, jobForm, setJobForm, profiles, addJob, saveEditedJob, busy }) {
  if (!showModal) return null;

  function updateField(field, value) {
    setJobForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const snapshot = { ...jobForm, viewers: [...jobForm.viewers] };
    if (editingJobId) {
      saveEditedJob(snapshot);
      return;
    }
    addJob(snapshot);
  }

  return (
    <div className="overlay" onClick={() => setShowModal(false)}>
      <form className="card modal formModal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="jobHead">
          <h2>{editingJobId ? "Edytuj montaż" : "Nowy montaż / zlecenie"}</h2>
          <button type="button" className="btn" onClick={() => { setShowModal(false); setEditingJobId(null); }}>Zamknij</button>
        </div>
        <input className="input" placeholder="Klient" value={jobForm.client} onChange={(e) => updateField("client", e.target.value)} />
        <input className="input" placeholder="Email klienta" value={jobForm.email} onChange={(e) => updateField("email", e.target.value)} />
        <input className="input" placeholder="Telefon klienta" value={jobForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
        <input className="input" placeholder="Miejscowość" value={jobForm.city} onChange={(e) => updateField("city", e.target.value)} />
        <input className="input" placeholder="Ulica i numer" value={jobForm.street} onChange={(e) => updateField("street", e.target.value)} />
        <select className="input" value={jobForm.status} onChange={(e) => updateField("status", e.target.value)}>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <textarea className="input textarea" placeholder="Komentarz administratora" value={jobForm.admin_note} onChange={(e) => updateField("admin_note", e.target.value)} />
        <h4>Instalatorzy (opcjonalnie)</h4>
        <div className="viewerGrid">
          {profiles.map((person) => {
            const active = jobForm.viewers.includes(person.id);
            return (
              <button type="button" key={person.id} className={`viewer ${active ? "active" : ""}`} onClick={() => setJobForm((prev) => ({ ...prev, viewers: active ? prev.viewers.filter((id) => id !== person.id) : [...prev.viewers, person.id] }))}>
                <div>{person.full_name}</div>
                <small>{person.role}</small>
              </button>
            );
          })}
        </div>
        <div className="row rightAlign">
          <button type="submit" className="btn primary saveJobBtn" disabled={busy}>{editingJobId ? "Zapisz zmiany" : "Zapisz zlecenie"}</button>
        </div>
      </form>
    </div>
  );
}
