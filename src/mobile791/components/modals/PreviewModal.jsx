import React from "react";
import AppModal from "./AppModal.jsx";

export default function PreviewModal({ previewImage, setPreviewImage, previewNext, previewPrev }) {
  return (
    <AppModal
      open={Boolean(previewImage)}
      onClose={() => setPreviewImage(null)}
      overlayClassName="previewOverlay"
      contentClassName="cleanPreviewModal previewModalSurface"
    >
      <div
        className="previewImageWrap"
        tabIndex="0"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") previewNext();
          if (e.key === "ArrowLeft") previewPrev();
          if (e.key === "Escape") setPreviewImage(null);
        }}
      >
        <div className="previewClickZone left" onClick={previewPrev}></div>
        {previewImage ? <img src={previewImage} className="fullPreview" /> : null}
        <div className="previewClickZone right" onClick={previewNext}></div>
      </div>
    </AppModal>
  );
}
