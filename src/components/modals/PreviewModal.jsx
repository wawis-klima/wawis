import React from "react";

export default function PreviewModal({ previewImage, setPreviewImage, previewNext, previewPrev }) {
  if (!previewImage) return null;

  return (
    <div className="overlay" onClick={() => setPreviewImage(null)}>
      <div
        className="cleanPreviewModal"
        tabIndex="0"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") previewNext();
          if (e.key === "ArrowLeft") previewPrev();
          if (e.key === "Escape") setPreviewImage(null);
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="previewImageWrap">
          <div className="previewClickZone left" onClick={previewPrev}></div>
          <img src={previewImage} className="fullPreview" />
          <div className="previewClickZone right" onClick={previewNext}></div>
        </div>
      </div>
    </div>
  );
}
