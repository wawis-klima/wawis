import { useRef, useState } from "react";
import { serializeJobDevicesToFields } from "../modules/job-devices.js";
import { buildNewJobFormDefaults } from "../modules/job-date.js";
import { createJobOperationId } from "../../modules/job-create-idempotency.js";
import { clearDeviceFormDraft, saveDeviceFormDraft } from "../modules/device-form-drafts.js";

function getComparableJobForm(form, normalizeStatus) {
  return JSON.stringify({
    title: String(form?.title || "").trim(),
    client: String(form?.client || "").trim(),
    email: String(form?.email || "").trim(),
    phone: String(form?.phone || "").trim(),
    nip: String(form?.nip || "").trim(),
    city: String(form?.city || "").trim(),
    street: String(form?.street || "").trim(),
    location: String(form?.location || "").trim(),
    contractor_id: String(form?.contractor_id || ""),
    contractor_address_id: String(form?.contractor_address_id || ""),
    contractor_address_label: String(form?.contractor_address_label || "").trim(),
    device_model: serializeJobDevicesToFields(form).device_model,
    device_serial_number: serializeJobDevicesToFields(form).device_serial_number,
    pending_nameplate_photos: (form?.pending_nameplate_photos || []).map((item) => ({
      deviceIndex: Number(item.deviceIndex || 0),
      unitRef: String(item.unitRef || ''),
      serialNumber: String(item.serialNumber || ''),
      fileName: String(item.file?.name || ''),
    })),
    status: normalizeStatus(form?.status || "Nowe"),
    installation_date: String(form?.installation_date || ""),
    admin_note: String(form?.admin_note || "").trim(),
    worker_comment: String(form?.worker_comment || "").trim(),
    main_technician_id: String(form?.main_technician_id || ""),
    viewers: [...new Set((form?.viewers || []).filter(Boolean))].sort(),
    installers_confirmed: form?.installers_confirmed !== false,
  });
}

export function useJobFormModal({ emptyJobForm, normalizeStatus, openConfirmDialog }) {
  const [showModal, setShowModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [serialOnlyMode, setSerialOnlyMode] = useState(false);
  const [jobForm, setJobFormState] = useState(emptyJobForm);
  const jobFormRef = useRef(emptyJobForm);
  const jobFormInitialRef = useRef(emptyJobForm);
  const jobFormBaseJobRef = useRef(null);
  const jobFormDirty = getComparableJobForm(jobForm, normalizeStatus) !== getComparableJobForm(jobFormInitialRef.current, normalizeStatus);

  function setJobForm(nextValue) {
    setJobFormState((prev) => {
      const resolved = typeof nextValue === "function" ? nextValue(prev) : nextValue;
      jobFormRef.current = resolved;
      return resolved;
    });
  }

  function isJobFormDirty() {
    return getComparableJobForm(jobFormRef.current, normalizeStatus) !== getComparableJobForm(jobFormInitialRef.current, normalizeStatus);
  }

  function resetJobModalState() {
    setShowModal(false);
    setEditingJobId(null);
    setSerialOnlyMode(false);
    jobFormInitialRef.current = emptyJobForm;
    jobFormBaseJobRef.current = null;
    setJobForm(emptyJobForm);
  }

  function openAddJob() {
    const nextForm = { ...buildNewJobFormDefaults(emptyJobForm), create_operation_id: createJobOperationId() };
    setEditingJobId(null);
    setSerialOnlyMode(false);
    jobFormInitialRef.current = nextForm;
    setJobForm(nextForm);
    setShowModal(true);
  }

  // 13.68: initialForm — stan z serwera, gdy formularz otwiera się z przywróconym szkicem
  // (wtedy zamknięcie pyta „Zamknąć bez zapisu?” zamiast po cichu gubić dane).
  function openEditJobForm({ jobId, form, baseJob = null, serialOnly = false, initialForm = null }) {
    setEditingJobId(jobId);
    setSerialOnlyMode(Boolean(serialOnly));
    jobFormInitialRef.current = initialForm || form;
    jobFormBaseJobRef.current = baseJob;
    setJobForm(form);
    setShowModal(true);
  }

  // 13.71: „Odrzuć niezapisane dane” w kreatorze urządzeń — świadome usunięcie szkicu i powrót do stanu z serwera.
  function discardRestoredDeviceDraft() {
    if (!editingJobId) return;
    clearDeviceFormDraft(editingJobId);
    setJobForm({ ...jobFormInitialRef.current, restored_draft_notice: '' });
  }

  function closeJobModal({ busy } = {}) {
    if (!showModal || busy) return;

    // 13.71 (test iPhone 26.10.2026): wyjście z kreatora urządzeń bez zapisu nie kasuje wpisanych numerów —
    // zostają jako szkic do następnego otwarcia (także po zamknięciu aplikacji: sam tekst, bez zdjęć).
    if (serialOnlyMode && editingJobId && isJobFormDirty()) {
      const draftJobId = editingJobId;
      openConfirmDialog({
        variant: "discard",
        title: "Zamknąć bez zapisu?",
        message: "Urządzenia nie zostały zapisane w systemie. Wpisane modele i numery seryjne zostaną zachowane na tym telefonie i wrócą przy następnym otwarciu urządzeń w tym montażu. Zdjęcia tabliczek — do zamknięcia aplikacji.",
        confirmLabel: "Zamknij — zachowaj dane",
        onConfirm: async () => {
          saveDeviceFormDraft(draftJobId, { ...jobFormRef.current, restored_draft_notice: '' });
          resetJobModalState();
        },
      });
      return;
    }

    // Formularz urządzeń bez zmian względem serwera — ewentualny szkic jest już nieaktualny.
    if (serialOnlyMode && editingJobId) clearDeviceFormDraft(editingJobId);

    if (isJobFormDirty()) {
      openConfirmDialog({
        variant: "discard",
        title: "Zamknąć bez zapisu?",
        message: "Masz niezapisane zmiany w formularzu montażu. Czy na pewno chcesz zamknąć okno bez zapisywania?",
        onConfirm: async () => {
          resetJobModalState();
        },
      });
      return;
    }

    resetJobModalState();
  }

  return {
    showModal,
    editingJobId,
    serialOnlyMode,
    jobForm,
    jobFormDirty,
    jobFormRef,
    jobFormBaseJobRef,
    setJobForm,
    resetJobModalState,
    openAddJob,
    openEditJobForm,
    closeJobModal,
    discardRestoredDeviceDraft,
  };
}
