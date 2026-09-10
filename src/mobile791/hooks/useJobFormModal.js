import { useRef, useState } from "react";
import { serializeJobDevicesToFields } from "../modules/job-devices.js";
import { buildNewJobFormDefaults } from "../modules/job-date.js";

function getComparableJobForm(form, normalizeStatus) {
  return JSON.stringify({
    title: String(form?.title || "").trim(),
    client: String(form?.client || "").trim(),
    email: String(form?.email || "").trim(),
    phone: String(form?.phone || "").trim(),
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
  });
}

export function useJobFormModal({ emptyJobForm, normalizeStatus, openConfirmDialog }) {
  const [showModal, setShowModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [serialOnlyMode, setSerialOnlyMode] = useState(false);
  const [jobForm, setJobFormState] = useState(emptyJobForm);
  const jobFormRef = useRef(emptyJobForm);
  const jobFormInitialRef = useRef(emptyJobForm);

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
    setJobForm(emptyJobForm);
  }

  function openAddJob() {
    const nextForm = buildNewJobFormDefaults(emptyJobForm);
    setEditingJobId(null);
    setSerialOnlyMode(false);
    jobFormInitialRef.current = nextForm;
    setJobForm(nextForm);
    setShowModal(true);
  }

  function openEditJobForm({ jobId, form, serialOnly = false }) {
    setEditingJobId(jobId);
    setSerialOnlyMode(Boolean(serialOnly));
    jobFormInitialRef.current = form;
    setJobForm(form);
    setShowModal(true);
  }

  function closeJobModal({ busy } = {}) {
    if (!showModal || busy) return;

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
    jobFormRef,
    setJobForm,
    resetJobModalState,
    openAddJob,
    openEditJobForm,
    closeJobModal,
  };
}
