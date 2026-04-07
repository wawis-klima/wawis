import React from "react";
import { getInitials, getJobCity, getJobStreet, getViewerNames, normalizeStatus, renderInitialBadges, STATUSES } from "../utils/jobHelpers.jsx";

function formatViewerChipName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0];
  const [firstName, ...rest] = parts;
  return `${firstName.charAt(0)}. ${rest.join(" ")}`;
}

export default function JobDetailsPanel({
  selectedJob,
  isAdmin,
  busy,
  profiles,
  formatDate,
  openEditJob,
  deleteJob,
  setSelectedJob,
  setSelectedJobByUpdater,
  setJobs,
  saveAdminNote,
  openPreview,
  deletePhoto,
  deletingPhotoId,
  handlePhotoUpload,
  toggleViewer,
  commentDrafts,
  setCommentDrafts,
  addComment,
  updateStatus,
}) {
  if (!selectedJob) {
    return <div className="card premiumCard"><div className="muted">Kliknij dowolny wiersz w tabeli, aby zobaczyć szczegóły montażu.</div></div>;
  }

  const photos = Array.isArray(selectedJob.photos) ? selectedJob.photos : [];
  const viewers = Array.isArray(selectedJob.viewers) ? selectedJob.viewers : [];
  const comments = Array.isArray(selectedJob.comments) ? selectedJob.comments : [];

  return (
    <div className="card premiumCard">
      <div className="jobHead detailHeader">
        <div className="detailIdentity">
          <h2 className="detailTitle">{selectedJob.client || selectedJob.title}</h2>

          <div className="detailMeta">
            <div className="infoItem">
              <span className="infoLabel">📧 Email</span>
              <div className="infoValue">
                {selectedJob.email ? (
                  <>
                    <a href={`mailto:${selectedJob.email}`} className="emailLink">{selectedJob.email}</a>
                    <button className="copyBtn" onClick={() => { navigator.clipboard.writeText(selectedJob.email); alert("Skopiowano email."); }}></button>
                  </>
                ) : "Brak emaila"}
              </div>
            </div>

            <div className="infoItem">
              <span className="infoLabel">📞 Telefon</span>
              <div className="infoValue">
                {selectedJob.phone ? (
                  <>
                    <a href={`tel:${selectedJob.phone}`} className="phoneLink">{selectedJob.phone}</a>
                    <button className="copyBtn" onClick={() => { navigator.clipboard.writeText(selectedJob.phone); alert("Skopiowano numer telefonu."); }}></button>
                  </>
                ) : "Brak telefonu"}
              </div>
            </div>

            <div className="infoItem">
              <span className="infoLabel">🏙️ Miejscowość</span>
              <div className="infoValue">{getJobCity(selectedJob) || "Brak miejscowości"}</div>
            </div>

            <div className="infoItem">
              <span className="infoLabel">📍 Ulica</span>
              <div className="infoValue">{getJobStreet(selectedJob) || "Brak ulicy"}</div>
            </div>

            {!isAdmin ? (
              <>
                <div className="infoItem">
                  <span className="infoLabel">🧰 </span>
                  <div className="infoValue">{renderInitialBadges(getViewerNames(selectedJob, profiles))}</div>
                </div>

                <div className="infoItem">
                  <span className="infoLabel">📅 Data</span>
                  <div className="infoValue">{selectedJob.created_at ? formatDate(selectedJob.created_at) : "-"}</div>
                </div>
              </>
            ) : null}
          </div>

          <div className={`detailActions detailActionsBottom ${isAdmin ? "mobileThreeButtons" : "mobileFourButtons"}`}>
            {isAdmin ? (
              <button className="btn mobileActionCompact" onClick={() => openEditJob(selectedJob)}>
                <span className="desktopLabel">Edytuj montaż</span>
                <span className="mobileLabel">Edytuj</span>
              </button>
            ) : null}
            {isAdmin ? (
              <button className="btn deleteCardBtn mobileActionCompact" onClick={() => deleteJob(selectedJob)}>
                <span className="desktopLabel">Usuń kartę</span>
                <span className="mobileLabel">Usuń</span>
              </button>
            ) : null}
            {!isAdmin ? (
              <button
                className={`btn mobileActionCompact finishJobBtn ${normalizeStatus(selectedJob.status) === "Zakończone" ? "finishJobBtnDone" : ""}`}
                onClick={() => updateStatus(selectedJob.id, "Zakończone")}
                disabled={busy || normalizeStatus(selectedJob.status) === "Zakończone"}
              >
                <span className="desktopLabel">Zakończone zlecenie</span>
                <span className="mobileLabel">Zakończ</span>
              </button>
            ) : null}
            <button className="btn mobileActionCompact" onClick={() => setSelectedJob(null)}>
              <span className="desktopLabel">Zamknij</span>
              <span className="mobileLabel">Zamknij</span>
            </button>
          </div>
        </div>
      </div>

      <h4>Komentarz administratora</h4>
      <div className="muted">{selectedJob.admin_note || "Brak komentarza."}</div>

      <h4>Zdjęcia</h4>
      <div className="thumbGrid">
        {photos.map((photo, index) => (
          <div key={photo.id} className="thumbCard">
            <div className="photoNumber">Zdjęcie {index + 1}</div>
            <button type="button" className="thumbBtn desktopThumbBtn" onClick={() => openPreview(photo.image_url, index)}>
              <img src={photo.image_url} className="thumb desktopThumb" />
            </button>
            <div className="photoMeta">
              <div>📅 {formatDate(photo.created_at)}</div>
              <div title={photo.uploader_name || "Pracownik"}>👤 {getInitials(photo.uploader_name || "Pracownik")}</div>
            </div>
            <button
              type="button"
              className="deleteBtn"
              disabled={deletingPhotoId === photo.id}
              onClick={(e) => {
                e.stopPropagation();
                deletePhoto(photo);
              }}
            >
              {deletingPhotoId === photo.id ? "Usuwanie..." : "Usuń"}
            </button>
          </div>
        ))}
        {photos.length === 0 ? <div className="muted">Brak zdjęć.</div> : null}
      </div>
      <div className="row">
        <label className="btn fileLabel">📷 Aparat<input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => handlePhotoUpload(selectedJob.id, e)} /></label>
        <label className="btn fileLabel">🖼️ Galeria<input type="file" accept="image/*" multiple hidden onChange={(e) => handlePhotoUpload(selectedJob.id, e)} /></label>
      </div>

      {isAdmin ? (
        <>
          <h4>Monterzy</h4>
          <div className="viewerInlineRow" aria-label="Wybór monterów">
            {profiles.map((person) => {
              const active = viewers.some((viewer) => viewer.user_id === person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  className={`viewerDot ${active ? "active" : ""}`}
                  onClick={() => toggleViewer(selectedJob.id, person.id, viewers)}
                  title={`${person.full_name} — ${active ? "Monter" : "Nie monter"}`}
                  aria-label={`${person.full_name} — ${active ? "Monter" : "Nie monter"}`}
                >
                  <span className="viewerDotText">{formatViewerChipName(person.full_name)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <h4>Komentarze i pytania</h4>
      <div className="comments">
        {comments.map((comment) => <div key={comment.id} className="comment"><strong>{comment.author_name}</strong> — {comment.type}<div>{comment.text}</div></div>)}
        {comments.length === 0 ? <div className="muted">Brak komentarzy.</div> : null}
      </div>
      <textarea className="input textarea" placeholder="Napisz komentarz..." value={commentDrafts[selectedJob.id] || ""} onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [selectedJob.id]: e.target.value }))} />
      <div className="row">
        <button className="btn" onClick={() => addComment(selectedJob.id, "Komentarz")}>Dodaj komentarz</button>
      </div>

      {isAdmin ? (
        <>
          <h4>Status</h4>
          <select className="input" value={selectedJob.status} onChange={(e) => updateStatus(selectedJob.id, e.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </>
      ) : null}
    </div>
  );
}
