import { useEffect, useRef, useState } from "react";

function getDirectPreviewUrl(photo = {}) {
  return photo?.preview_full_url || photo?.image_url || photo?.signed_url || photo?.local_preview_url || '';
}

function getPhotoIdentity(photo = {}) {
  return String(photo?.id || photo?.storage_path || photo?.original_image_url || photo?.thumbnail_image_url || '').trim();
}

function isPreviewablePhoto(photo = {}) {
  return Boolean(getDirectPreviewUrl(photo) || getPhotoIdentity(photo) || photo?.original_image_url);
}

function getPreviewGallery(photos = []) {
  return (Array.isArray(photos) ? photos : []).filter((photo) => isPreviewablePhoto(photo));
}

function findGalleryIndex(gallery = [], photoOrUrl, fallbackIndex = 0) {
  if (photoOrUrl && typeof photoOrUrl === 'object') {
    const identity = getPhotoIdentity(photoOrUrl);
    if (identity) {
      const byIdentity = gallery.findIndex((photo) => getPhotoIdentity(photo) === identity);
      if (byIdentity >= 0) return byIdentity;
    }
  } else if (typeof photoOrUrl === 'string') {
    const byUrl = gallery.findIndex((photo) => getDirectPreviewUrl(photo) === photoOrUrl);
    if (byUrl >= 0) return byUrl;
  }
  return Math.min(Math.max(Number(fallbackIndex) || 0, 0), Math.max(0, gallery.length - 1));
}

export function usePhotoPreview(selectedJob, resolvePhotoUrl = null) {
  const [previewImage, setPreviewImage] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPhotos, setPreviewPhotos] = useState([]);
  const resolvedUrlsRef = useRef(new Map());
  const resolveRequestIdRef = useRef(0);

  useEffect(() => {
    resolveRequestIdRef.current += 1;
    resolvedUrlsRef.current.clear();
    setPreviewImage(null);
    setPreviewIndex(0);
    setPreviewPhotos([]);
  }, [selectedJob?.id]);

  async function resolveOne(photoOrUrl) {
    if (typeof photoOrUrl === 'string') return photoOrUrl;
    if (!photoOrUrl || typeof photoOrUrl !== 'object') return '';

    const directUrl = getDirectPreviewUrl(photoOrUrl);
    if (directUrl) return directUrl;

    const identity = getPhotoIdentity(photoOrUrl);
    if (identity && resolvedUrlsRef.current.has(identity)) {
      return resolvedUrlsRef.current.get(identity) || '';
    }

    let resolvedUrl = '';
    if (typeof resolvePhotoUrl === 'function') {
      resolvedUrl = await resolvePhotoUrl(photoOrUrl);
    } else {
      resolvedUrl = photoOrUrl.original_image_url || '';
    }

    if (identity && resolvedUrl) resolvedUrlsRef.current.set(identity, resolvedUrl);
    return resolvedUrl || '';
  }

  async function openPreview(photoOrUrl, index = 0, galleryPhotos = null) {
    const gallery = getPreviewGallery(Array.isArray(galleryPhotos) ? galleryPhotos : selectedJob?.photos);
    const safeIndex = findGalleryIndex(gallery, photoOrUrl, index);
    const targetPhoto = photoOrUrl && typeof photoOrUrl === 'object'
      ? photoOrUrl
      : (gallery[safeIndex] || photoOrUrl);
    const requestId = resolveRequestIdRef.current + 1;
    resolveRequestIdRef.current = requestId;

    setPreviewIndex(safeIndex);
    setPreviewPhotos(gallery);

    try {
      const resolvedUrl = await resolveOne(targetPhoto);
      if (resolveRequestIdRef.current !== requestId) return;
      if (resolvedUrl) setPreviewImage(resolvedUrl);
    } catch (error) {
      console.warn('Nie udało się wczytać pełnego zdjęcia do podglądu.', error?.message || error);
    }
  }

  async function showPreviewAtIndex(nextIndex) {
    const gallery = previewPhotos.length ? previewPhotos : getPreviewGallery(selectedJob?.photos);
    if (!gallery.length) return;
    const normalizedIndex = (nextIndex + gallery.length) % gallery.length;
    const requestId = resolveRequestIdRef.current + 1;
    resolveRequestIdRef.current = requestId;
    setPreviewIndex(normalizedIndex);
    try {
      const resolvedUrl = await resolveOne(gallery[normalizedIndex]);
      if (resolveRequestIdRef.current !== requestId) return;
      if (resolvedUrl) setPreviewImage(resolvedUrl);
    } catch (error) {
      console.warn('Nie udało się wczytać pełnego zdjęcia do podglądu.', error?.message || error);
    }
  }

  function previewPrev() {
    void showPreviewAtIndex(previewIndex - 1);
  }

  function previewNext() {
    void showPreviewAtIndex(previewIndex + 1);
  }

  return {
    previewImage,
    setPreviewImage,
    openPreview,
    previewPrev,
    previewNext,
  };
}
