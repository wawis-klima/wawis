import React, { useMemo } from "react";
import { STATUSES } from "../../utils/jobHelpers.jsx";
import AppModal from "./AppModal.jsx";
import ClientVoiceInput, { VoiceFieldButton, VoiceNoteButton, appendVoiceNoteText } from "../../../components/voice/ClientVoiceInput.jsx";
import { normalizeVoiceEmail, normalizeVoicePhone } from "../../modules/client-voice-input.js";
import {
  applyAutoLinkedContractorToJobForm,
  buildContractorOptionLabel,
  filterContractorsByQuery,
  getDuplicateContractorMatch,
} from "../../modules/job-contractors.js";
import { DEVICE_TYPE_MULTI, DEVICE_TYPE_SINGLE, MAX_INDOOR_UNITS_PER_DEVICE, createEmptyJobDevice, getDeviceIndoorModels, getDeviceIndoorSerials, getDeviceOutdoorModel, getDeviceType, normalizeJobDevices, serializeJobDevicesToFields } from "../../modules/job-devices.js";
import NameplatePhotoCapture from "../nameplate/NameplatePhotoCapture.jsx";
import MobileDeviceWizard from "../devices/MobileDeviceWizard.jsx";

export default function JobFormModal({
  showModal,
  closeJobModal,
  editingJobId,
  serialOnlyMode = false,
  jobForm,
  setJobForm,
  profiles,
  contractors = [],
  isAdmin = false,
  addJob,
  saveEditedJob,
  busy,
}) {
  const contractorOptions = useMemo(
    () => [...contractors].sort((left, right) => String(left?.company_name || '').localeCompare(String(right?.company_name || ''), 'pl')),
    [contractors],
  );

  const contractorSuggestions = useMemo(() => {
    const trimmedClient = String(jobForm.client || '').trim();
    if (!trimmedClient) return [];

    return filterContractorsByQuery(contractorOptions, trimmedClient)
      .filter((item) => {
        if (!jobForm.contractor_id) return true;
        return String(item.id) !== String(jobForm.contractor_id);
      })
      .slice(0, 3);
  }, [contractorOptions, jobForm.client, jobForm.contractor_id]);

  const duplicateContractor = useMemo(
    () => getDuplicateContractorMatch({
      contractors: contractorOptions,
      contractorId: jobForm.contractor_id,
      client: jobForm.client,
    }),
    [contractorOptions, jobForm.contractor_id, jobForm.client],
  );

  const jobDevices = useMemo(
    () => normalizeJobDevices(jobForm, { keepEmptyRow: true, keepEmptyIndoor: true }),
    [jobForm.devices, jobForm.device_model, jobForm.device_serial_number],
  );

  const existingNameplatePhotos = Array.isArray(jobForm.existing_nameplate_photos) ? jobForm.existing_nameplate_photos : [];

  function getExistingNameplatePhoto(deviceIndex, unitRef) {
    return existingNameplatePhotos.find((item) => (
      Number(item.deviceIndex) === Number(deviceIndex) && String(item.unitRef) === String(unitRef)
    )) || null;
  }

  function hasExistingNameplatePhoto(deviceIndex, unitRef) {
    return Boolean(getExistingNameplatePhoto(deviceIndex, unitRef)?.url);
  }

  function applyDeviceRows(prev, rows) {
    const safeRows = normalizeJobDevices({ devices: rows }, { keepEmptyRow: true, keepEmptyIndoor: true });
    const serialized = serializeJobDevicesToFields({ devices: safeRows });
    return {
      ...prev,
      devices: safeRows,
      device_model: serialized.device_model,
      device_serial_number: serialized.device_serial_number,
    };
  }

  function updateDeviceField(index, field, value) {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => (
        rowIndex === index ? { ...device, [field]: value } : device
      ));
      return applyDeviceRows(prev, nextRows);
    });
  }

  function applyNameplatePhoto(deviceIndex, unitRef, file, serialNumber = '') {
    setJobForm((prev) => {
      const existingDocuments = Array.isArray(prev.pending_nameplate_photos) ? prev.pending_nameplate_photos : [];
      const remainingDocuments = existingDocuments.filter((item) => (
        Number(item.deviceIndex) !== Number(deviceIndex) || String(item.unitRef) !== unitRef
      ));
      const unitNumber = unitRef.startsWith('jw-') ? Number(unitRef.split('-')[1] || 1) : 0;
      const unitLabel = unitRef === 'jz' ? 'JZ' : `JW ${unitNumber}`;
      return {
        ...prev,
        pending_nameplate_photos: [...remainingDocuments, {
          file,
          deviceIndex,
          unitRef,
          deviceRef: `device-${deviceIndex + 1}-${unitRef}`,
          serialNumber: String(serialNumber || ''),
          documentationLabel: `Tabliczka ${unitLabel} • urządzenie ${deviceIndex + 1}`,
        }],
      };
    });
  }

  function removePendingNameplatePhoto(deviceIndex, unitRef) {
    setJobForm((prev) => ({
      ...prev,
      pending_nameplate_photos: (prev.pending_nameplate_photos || []).filter((item) => (
        Number(item.deviceIndex) !== Number(deviceIndex) || String(item.unitRef) !== unitRef
      )),
    }));
  }

  function addDeviceRow() {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      return applyDeviceRows(prev, [...rows, createEmptyJobDevice()]);
    });
  }

  function removeDeviceRow(index) {
    if (existingNameplatePhotos.some((item) => Number(item.deviceIndex) >= Number(index))) {
      alert('Nie można usunąć tego urządzenia, ponieważ ma już zapisane zdjęcia tabliczek. Usuń zdjęcia z karty zlecenia, a następnie zmień układ urządzeń.');
      return;
    }
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
      const pendingDocuments = (prev.pending_nameplate_photos || [])
        .filter((item) => Number(item.deviceIndex) !== index)
        .map((item) => {
          const currentIndex = Number(item.deviceIndex || 0);
          if (currentIndex <= index) return item;
          const unitLabel = item.unitRef === 'jz' ? 'JZ' : `JW ${String(item.unitRef).split('-')[1] || ''}`.trim();
          return {
            ...item,
            deviceIndex: currentIndex - 1,
            deviceRef: `device-${currentIndex}-${item.unitRef}`,
            documentationLabel: `Tabliczka ${unitLabel} • urządzenie ${currentIndex}`,
          };
        });
      return {
        ...applyDeviceRows(prev, nextRows.length ? nextRows : [createEmptyJobDevice()]),
        pending_nameplate_photos: pendingDocuments,
      };
    });
  }

  function updateDeviceType(index, type) {
    const nextType = type === DEVICE_TYPE_MULTI ? DEVICE_TYPE_MULTI : DEVICE_TYPE_SINGLE;
    if (nextType === DEVICE_TYPE_SINGLE && existingNameplatePhotos.some((item) => (
      Number(item.deviceIndex) === Number(index) && /^jw-(?:[2-9]|\d{2,})$/.test(String(item.unitRef))
    ))) {
      alert('Nie można przełączyć na single-split, ponieważ są już zapisane tabliczki dodatkowych jednostek JW.');
      return;
    }
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== index) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, {
          keepEmpty: true,
          minimumLength: indoorSerials.length,
        });
        const nextIndoorSerials = nextType === DEVICE_TYPE_MULTI
          ? (indoorSerials.length >= 2 ? indoorSerials : [...indoorSerials, '']).slice(0, MAX_INDOOR_UNITS_PER_DEVICE)
          : [indoorSerials[0] || ''];
        const nextIndoorModels = nextType === DEVICE_TYPE_MULTI
          ? (indoorModels.length >= 2 ? indoorModels : [...indoorModels, '']).slice(0, MAX_INDOOR_UNITS_PER_DEVICE)
          : [indoorModels[0] || ''];
        return {
          ...device,
          device_type: nextType,
          indoor_model: nextIndoorModels[0] || '',
          indoor_models: nextIndoorModels,
          indoor_serial_number: nextIndoorSerials[0] || '',
          indoor_serial_numbers: nextIndoorSerials,
        };
      });
      const pendingDocuments = nextType === DEVICE_TYPE_SINGLE
        ? (prev.pending_nameplate_photos || []).filter((item) => (
          Number(item.deviceIndex) !== index || item.unitRef === 'jz' || item.unitRef === 'jw-1'
        ))
        : (prev.pending_nameplate_photos || []);
      return {
        ...applyDeviceRows(prev, nextRows),
        pending_nameplate_photos: pendingDocuments,
      };
    });
  }

  function updateIndoorUnitField(deviceIndex, indoorIndex, field, value) {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== deviceIndex) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, {
          keepEmpty: true,
          minimumLength: indoorSerials.length,
        });
        const nextIndoorSerials = [...indoorSerials];
        const nextIndoorModels = [...indoorModels];
        if (field === 'model') nextIndoorModels[indoorIndex] = value;
        else nextIndoorSerials[indoorIndex] = value;
        return {
          ...device,
          indoor_model: nextIndoorModels[0] || '',
          indoor_models: nextIndoorModels,
          indoor_serial_number: nextIndoorSerials[0] || '',
          indoor_serial_numbers: nextIndoorSerials,
        };
      });
      return applyDeviceRows(prev, nextRows);
    });
  }

  function addIndoorUnit(deviceIndex) {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== deviceIndex) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, {
          keepEmpty: true,
          minimumLength: indoorSerials.length,
        });
        if (indoorSerials.length >= MAX_INDOOR_UNITS_PER_DEVICE) return device;
        const nextIndoorSerials = [...indoorSerials, ''];
        const nextIndoorModels = [...indoorModels, ''];
        return {
          ...device,
          device_type: DEVICE_TYPE_MULTI,
          indoor_model: nextIndoorModels[0] || '',
          indoor_models: nextIndoorModels,
          indoor_serial_number: nextIndoorSerials[0] || '',
          indoor_serial_numbers: nextIndoorSerials,
        };
      });
      return applyDeviceRows(prev, nextRows);
    });
  }

  function removeIndoorUnit(deviceIndex, indoorIndex) {
    const unitRef = `jw-${indoorIndex + 1}`;
    if (hasExistingNameplatePhoto(deviceIndex, unitRef)) {
      alert('Nie można usunąć tej jednostki JW, ponieważ jej tabliczka jest już zapisana. Najpierw usuń zdjęcie z karty zlecenia.');
      return;
    }
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== deviceIndex) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, {
          keepEmpty: true,
          minimumLength: indoorSerials.length,
        });
        const nextIndoorSerials = indoorSerials.length <= 1
          ? ['']
          : indoorSerials.filter((_, itemIndex) => itemIndex !== indoorIndex);
        const nextIndoorModels = indoorModels.length <= 1
          ? ['']
          : indoorModels.filter((_, itemIndex) => itemIndex !== indoorIndex);
        return {
          ...device,
          indoor_model: nextIndoorModels[0] || '',
          indoor_models: nextIndoorModels,
          indoor_serial_number: nextIndoorSerials[0] || '',
          indoor_serial_numbers: nextIndoorSerials,
        };
      });
      const removedUnitNumber = indoorIndex + 1;
      const pendingDocuments = (prev.pending_nameplate_photos || [])
        .filter((item) => (
          Number(item.deviceIndex) !== deviceIndex || item.unitRef !== `jw-${removedUnitNumber}`
        ))
        .map((item) => {
          if (Number(item.deviceIndex) !== deviceIndex || !String(item.unitRef).startsWith('jw-')) return item;
          const unitNumber = Number(String(item.unitRef).split('-')[1] || 0);
          if (unitNumber <= removedUnitNumber) return item;
          const nextUnitNumber = unitNumber - 1;
          return {
            ...item,
            unitRef: `jw-${nextUnitNumber}`,
            deviceRef: `device-${deviceIndex + 1}-jw-${nextUnitNumber}`,
            documentationLabel: `Tabliczka JW ${nextUnitNumber} • urządzenie ${deviceIndex + 1}`,
          };
        });
      return {
        ...applyDeviceRows(prev, nextRows),
        pending_nameplate_photos: pendingDocuments,
      };
    });
  }


  function setUnitDescriptor(deviceIndex, unitRef, value) {
    if (unitRef === 'jz') {
      updateDeviceField(deviceIndex, 'outdoor_model', value);
      return;
    }
    const indoorIndex = Math.max(0, Number(String(unitRef).split('-')[1] || 1) - 1);
    updateIndoorUnitField(deviceIndex, indoorIndex, 'model', value);
  }

  function applyVoiceClientData(data) {
    setJobForm((prev) => ({
      ...prev,
      contractor_id: '',
      client: data.clientName || prev.client,
      phone: data.phone || prev.phone,
      email: data.email || prev.email,
      city: data.formattedCity || prev.city,
      street: data.formattedStreet || prev.street,
    }));
  }

  function updateField(field, value) {
    setJobForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'device_model' || field === 'device_serial_number') {
        return applyDeviceRows(next, normalizeJobDevices(next, { keepEmptyRow: true, keepEmptyIndoor: true }));
      }
      if (field === 'client' && prev.contractor_id) {
        const selectedContractor = contractorOptions.find((item) => String(item.id) === String(prev.contractor_id));
        const normalizedSelectedName = String(selectedContractor?.company_name || '').trim();
        if (normalizedSelectedName && String(value || '').trim() !== normalizedSelectedName) {
          next.contractor_id = '';
        }
      }
      return next;
    });
  }

  function handleContractorSelect(contractor) {
    if (!contractor?.id) {
      setJobForm((prev) => ({ ...prev, contractor_id: '' }));
      return;
    }

    setJobForm((prev) => ({
      ...prev,
      contractor_id: contractor.id,
      client: contractor.company_name || prev.client,
      email: contractor.email || prev.email,
      phone: contractor.phone || prev.phone,
      city: contractor.city || prev.city,
      street: contractor.street || prev.street,
    }));
  }

  function handleSubmit(e) {
    e?.preventDefault?.();

    const { form: resolvedForm } = serialOnlyMode
      ? { form: jobForm }
      : applyAutoLinkedContractorToJobForm(jobForm, contractorOptions);

    if (!serialOnlyMode && duplicateContractor && !resolvedForm.contractor_id) {
      alert(`Taki klient już jest w bazie. Wybierz go z listy podpowiedzi: ${duplicateContractor.company_name}${duplicateContractor.phone ? ` (${duplicateContractor.phone})` : ''}`);
      return;
    }

    const snapshot = { ...resolvedForm, viewers: [...resolvedForm.viewers] };
    if (editingJobId) {
      saveEditedJob(snapshot);
      return;
    }
    addJob(snapshot);
  }

  if (serialOnlyMode) {
    return (
      <AppModal
        open={showModal}
        onClose={closeJobModal}
        overlayClassName="formOverlay mobileDeviceWizardOverlay"
        contentClassName="card modal mobileDeviceWizardModal"
      >
        <MobileDeviceWizard
          devices={jobDevices}
          pendingPhotos={Array.isArray(jobForm.pending_nameplate_photos) ? jobForm.pending_nameplate_photos : []}
          existingPhotos={existingNameplatePhotos}
          busy={busy}
          onClose={closeJobModal}
          onSubmit={() => handleSubmit()}
          onAddDevice={addDeviceRow}
          onRemoveDevice={removeDeviceRow}
          onChangeDeviceType={updateDeviceType}
          onSetUnitDescriptor={setUnitDescriptor}
          onAddIndoorUnit={addIndoorUnit}
          onRemoveIndoorUnit={removeIndoorUnit}
          onPhotoSelect={(deviceIndex, unitRef, file) => applyNameplatePhoto(deviceIndex, unitRef, file)}
          onPhotoRemove={removePendingNameplatePhoto}
        />
      </AppModal>
    );
  }

  return (
    <AppModal
      open={showModal}
      onClose={closeJobModal}
      overlayClassName="formOverlay"
      contentClassName="card modal formModal"
    >
      <form onSubmit={handleSubmit} className={`${serialOnlyMode ? "jobSerialOnlyForm " : ""}${!editingJobId ? "jobFormCreateMode" : ""}`.trim()}>
        <div className="jobHead">
          <h2>{serialOnlyMode ? "Zdjęcia tabliczek znamionowych" : (editingJobId ? "Edytuj montaż" : (isAdmin ? "Nowy montaż / zlecenie" : "Dodaj nowego klienta"))}</h2>
{editingJobId ? <button type="button" className="btn" onClick={closeJobModal}>Zamknij</button> : null}
        </div>
        {!editingJobId ? (
<div className="jobFormQuickActions">
  <button type="button" className="btn jobFormCloseBtn" onClick={closeJobModal}>Zamknij</button>
  <ClientVoiceInput onApply={applyVoiceClientData} disabled={busy} />
</div>
        ) : null}
        {serialOnlyMode ? (
          <div className="jobSerialOnlyIntro">
            Dodaj zdjęcie tabliczki jednostki zewnętrznej JZ i każdej jednostki wewnętrznej JW. Zdjęcia są wymagane do zakończenia zlecenia.
          </div>
        ) : null}
        <div className="jobFormGeneralFields" hidden={serialOnlyMode}>
        {editingJobId ? <ClientVoiceInput onApply={applyVoiceClientData} disabled={busy} /> : null}
        <div className="voiceFieldRow">
          <input className="input" placeholder="Klient" value={jobForm.client} onChange={(e) => updateField("client", e.target.value)} />
          <VoiceFieldButton label="Klient" onValue={(value) => updateField("client", value)} disabled={busy} />
        </div>
        {contractorSuggestions.length ? (
          <div className="jobContractorSuggestions">
            <div className="jobContractorSuggestionsTitle">Czy chodzi o tego kontrahenta?</div>
            <div className="jobContractorSuggestionsList">
              {contractorSuggestions.map((contractor) => (
                <button
                  key={contractor.id}
                  type="button"
                  className={`jobContractorSuggestion${String(jobForm.contractor_id) === String(contractor.id) ? ' active' : ''}`}
                  onClick={() => handleContractorSelect(contractor)}
                >
                  <strong>{contractor.company_name}</strong>
                  <span>{buildContractorOptionLabel(contractor)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {duplicateContractor && !jobForm.contractor_id ? (
          <div className="jobDuplicateWarning">
            Taki klient już jest w bazie. Wybierz istniejący wpis z podpowiedzi zamiast dodawać duplikat: <strong>{duplicateContractor.company_name}</strong>
            {duplicateContractor.phone ? ` • tel. ${duplicateContractor.phone}` : ''}
            {duplicateContractor.street || duplicateContractor.city ? ` • ${[duplicateContractor.street, duplicateContractor.city].filter(Boolean).join(', ')}` : ''}
          </div>
        ) : null}
        <div className="voiceFieldRow">
          <input className="input" placeholder="Email klienta" value={jobForm.email} onChange={(e) => updateField("email", e.target.value)} />
          <VoiceFieldButton label="Email" onValue={(value) => updateField("email", value)} transformValue={normalizeVoiceEmail} disabled={busy} />
        </div>
        <div className="voiceFieldRow">
          <input className="input" placeholder="Telefon klienta / SMS" value={jobForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
          <VoiceFieldButton label="Telefon" onValue={(value) => updateField("phone", value)} transformValue={normalizeVoicePhone} disabled={busy} />
        </div>
        <div className="voiceFieldRow">
          <input className="input" placeholder="Miejscowość" value={jobForm.city} onChange={(e) => updateField("city", e.target.value)} />
          <VoiceFieldButton label="Miejscowość" onValue={(value) => updateField("city", value)} disabled={busy} />
        </div>
        <div className="voiceFieldRow">
          <input className="input" placeholder="Ulica i numer" value={jobForm.street} onChange={(e) => updateField("street", e.target.value)} />
          <VoiceFieldButton label="Ulica i numer" onValue={(value) => updateField("street", value)} disabled={busy} />
        </div>
        {isAdmin ? (
          <select className="input" value={jobForm.status} onChange={(e) => updateField("status", e.target.value)}>
            {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        ) : null}
        {!isAdmin && !editingJobId ? (
          <label className="inputLabel workerCreateStatusField">
            <span>Status montażu</span>
            <select className="input" value={jobForm.status || 'Nowe'} onChange={(e) => updateField("status", e.target.value)} disabled={busy}>
              <option value="Nowe">Nowe</option>
              <option value="W trakcie">W trakcie</option>
              <option value="Zakończone">Zakończ od razu</option>
            </select>
          </label>
        ) : null}
        {!editingJobId ? (
          <div className="inputLabel workerNewClientCommentBlock" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
            <div className="fieldLabelRow workerNewClientCommentLabelRow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
              <span style={{ margin: 0 }}>Komentarz</span>
              {jobForm.worker_comment ? (
                <button
                  type="button"
                  className="fieldClearBtn"
                  onClick={() => updateField("worker_comment", "")}
                >
                  Wyczyść
                </button>
              ) : null}
            </div>
            <div
              className="voiceFieldRow workerNewClientCommentVoiceRow"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px', gap: 8, alignItems: 'center', width: '100%', minWidth: 0, marginTop: 8 }}
            >
              <textarea
                rows={3}
                className="input textarea textareaNoTop workerNewClientCommentTextarea"
                style={{ width: '100%', minWidth: 0, minHeight: 76, maxHeight: 130, margin: 0, resize: 'vertical', boxSizing: 'border-box' }}
                placeholder="Komentarz do montażu"
                value={jobForm.worker_comment || ''}
                onChange={(e) => updateField("worker_comment", e.target.value)}
              />
              <VoiceNoteButton
                label="Komentarz"
                onValue={(value) => setJobForm((prev) => ({ ...prev, worker_comment: appendVoiceNoteText(prev.worker_comment, value) }))}
                disabled={busy}
              />
            </div>
          </div>
        ) : null}
        <div className="inputLabel installationDateField" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
          <div
            className="fieldLabelRow installationDateLabelRow"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minWidth: 0 }}
          >
            <span style={{ margin: 0 }}>Data montażu</span>
            {jobForm.installation_date ? (
              <button
                type="button"
                className="fieldClearBtn installationDateClearBtn"
                style={{ flex: '0 0 auto', alignSelf: 'center', whiteSpace: 'nowrap' }}
                onClick={() => updateField("installation_date", "")}
              >
                Wyczyść
              </button>
            ) : null}
          </div>
          <div
            className="installationDateInputShell"
            style={{ width: '100%', minWidth: 0, maxWidth: '100%', height: 50, overflow: 'hidden', border: '1px solid #cfdbea', borderRadius: 16, background: '#fff', boxSizing: 'border-box', marginTop: 8 }}
          >
            <input
              className="installationDateNativeInput"
              style={{ display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', height: '100%', boxSizing: 'border-box', border: 0, outline: 0, background: 'transparent', padding: '0 12px', font: 'inherit', color: 'inherit' }}
              type="date"
              value={jobForm.installation_date || ""}
              onChange={(e) => updateField("installation_date", e.target.value)}
            />
          </div>
        </div>
        </div>
        {editingJobId ? (
        <div className="jobDevicesSection">
          <div className="jobDevicesHeader">
            <div>
              <strong>Urządzenia w montażu</strong>
              <span>{serialOnlyMode ? 'Ustaw rzeczywistą liczbę urządzeń i dodaj zdjęcie każdej tabliczki.' : 'Wybierz typ single-split albo multi-split. Do każdej JZ i JW dodaj osobne zdjęcie tabliczki.'}</span>
            </div>
            <button type="button" className="btn jobDeviceAddBtn" onClick={addDeviceRow} aria-label="Dodaj kolejne urządzenie">
              {serialOnlyMode ? '+ Dodaj kolejny komplet JZ/JW' : '+ Dodaj urządzenie'}
            </button>
          </div>
          <div className="jobDevicesList">
            {jobDevices.map((device, index) => {
              const deviceType = getDeviceType(device);
              const isMultiSplit = deviceType === DEVICE_TYPE_MULTI;
              const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
              const indoorModels = getDeviceIndoorModels(device, {
                keepEmpty: true,
                minimumLength: indoorSerials.length,
              });
              const pendingNameplatePhotos = Array.isArray(jobForm.pending_nameplate_photos) ? jobForm.pending_nameplate_photos : [];
              const outdoorNameplateDocument = pendingNameplatePhotos.find((item) => Number(item.deviceIndex) === index && item.unitRef === 'jz') || null;
              const outdoorExistingNameplate = getExistingNameplatePhoto(index, 'jz');
              return (
                <div className="jobDeviceRow" key={`job-device-${index}`}>
                  <div className="jobDeviceRowTitle">
                    <strong>Urządzenie {index + 1}</strong>
                    {jobDevices.length > 1 ? (
                      <button
                        type="button"
                        className="fieldClearBtn jobDeviceRemoveBtn"
                        onClick={() => removeDeviceRow(index)}
                      >
                        Usuń
                      </button>
                    ) : null}
                  </div>
                  <div className="jobDeviceTypeBlock">
                    <div>
                      <strong>Typ urządzenia</strong>
                      <span>{isMultiSplit ? 'Multi-split: jedna JZ i kilka jednostek wewnętrznych.' : 'Single-split: jedna JZ i jedna jednostka wewnętrzna.'}</span>
                    </div>
                    <div className="jobDeviceTypeToggle" role="group" aria-label={`Typ urządzenia ${index + 1}`}>
                      <button
                        type="button"
                        className={`jobDeviceTypeOption${!isMultiSplit ? ' active' : ''}`}
                        onClick={() => updateDeviceType(index, DEVICE_TYPE_SINGLE)}
                      >
                        Single-split
                      </button>
                      <button
                        type="button"
                        className={`jobDeviceTypeOption${isMultiSplit ? ' active' : ''}`}
                        onClick={() => updateDeviceType(index, DEVICE_TYPE_MULTI)}
                      >
                        Multi-split
                      </button>
                    </div>
                  </div>
                  <div className="jobDeviceFieldsGrid">
                    <div className="jobUnitDocumentationCard jobOutdoorDocumentationCard">
                      <div className="jobUnitDocumentationTitle">
                        <strong>Jednostka zewnętrzna JZ</strong>
                        {!serialOnlyMode ? <span>Dane tekstowe są opcjonalne.</span> : null}
                      </div>
                      {!serialOnlyMode ? (<>
                        <label className="inputLabel">
                          <span>Model JZ (opcjonalnie)</span>
                          <input
                            className="input"
                            placeholder="np. I35Xo R14"
                            value={getDeviceOutdoorModel(device)}
                            onChange={(e) => updateDeviceField(index, "outdoor_model", e.target.value)}
                          />
                        </label>
                        <label className="inputLabel">
                          <span>Numer seryjny JZ (opcjonalnie)</span>
                          <input
                            className="input"
                            placeholder="Możesz pozostawić puste"
                            value={device.outdoor_serial_number || ''}
                            onChange={(e) => updateDeviceField(index, "outdoor_serial_number", e.target.value)}
                          />
                        </label>
                      </>) : null}
                      <NameplatePhotoCapture
                        fieldLabel={`Jednostka zewnętrzna JZ — urządzenie ${index + 1}`}
                        file={outdoorNameplateDocument?.file || null}
                        existingPhotoUrl={String(outdoorExistingNameplate?.uploadStatus || '').toLowerCase() === 'error' ? '' : (outdoorExistingNameplate?.url || '')}
                        onSelect={(file) => applyNameplatePhoto(index, 'jz', file, device.outdoor_serial_number)}
                        onRemove={() => removePendingNameplatePhoto(index, 'jz')}
                      />
                    </div>
                    <div className={`jobIndoorUnitsBlock${isMultiSplit ? ' multi' : ' single'}`}>
                      <div className="jobIndoorUnitsHeader">
                        <div>
                          <strong>{isMultiSplit ? 'Jednostki wewnętrzne multi-split' : 'Jednostka wewnętrzna'}</strong>
                          <span>
                            {isMultiSplit
                              ? `Do jednego urządzenia multi możesz dopisać maksymalnie ${MAX_INDOOR_UNITS_PER_DEVICE} jednostek wewnętrznych.`
                              : 'W trybie single-split pokazujemy tylko jedną jednostkę wewnętrzną.'}
                          </span>
                        </div>
                        {isMultiSplit ? (
                          <button
                            type="button"
                            className="btn secondary jobIndoorUnitAddBtn"
                            onClick={() => addIndoorUnit(index)}
                            disabled={indoorSerials.length >= MAX_INDOOR_UNITS_PER_DEVICE}
                          >
                            + Dodaj tylko jednostkę wewnętrzną
                          </button>
                        ) : null}
                      </div>
                      <div className="jobIndoorUnitsList">
                        {indoorSerials.map((serial, indoorIndex) => {
                          const unitRef = `jw-${indoorIndex + 1}`;
                          const nameplateDocument = pendingNameplatePhotos.find((item) => Number(item.deviceIndex) === index && item.unitRef === unitRef) || null;
                          const existingNameplate = getExistingNameplatePhoto(index, unitRef);
                          return (
                            <div className="jobIndoorUnitField jobUnitDocumentationCard" key={`job-device-${index}-indoor-${indoorIndex}`}>
                              <div className="jobUnitDocumentationTitle">
                                <strong>{isMultiSplit ? `Jednostka wewnętrzna JW ${indoorIndex + 1}` : 'Jednostka wewnętrzna JW'}</strong>
                                {isMultiSplit && indoorSerials.length > 1 ? (
                                  <button
                                    type="button"
                                    className="fieldClearBtn jobIndoorUnitRemoveBtn"
                                    onClick={() => removeIndoorUnit(index, indoorIndex)}
                                  >
                                    Usuń JW
                                  </button>
                                ) : null}
                              </div>
                              {!serialOnlyMode ? (<>
                                <label className="inputLabel">
                                  <span>Model {isMultiSplit ? `JW ${indoorIndex + 1}` : 'JW'} (opcjonalnie)</span>
                                  <input
                                    className="input jobIndoorUnitModelInput"
                                    placeholder="np. I35Xi R14"
                                    value={indoorModels[indoorIndex] || ''}
                                    onChange={(e) => updateIndoorUnitField(index, indoorIndex, 'model', e.target.value)}
                                  />
                                </label>
                                <label className="inputLabel">
                                  <span>Numer seryjny {isMultiSplit ? `JW ${indoorIndex + 1}` : 'JW'} (opcjonalnie)</span>
                                  <input
                                    className="input"
                                    placeholder="Możesz pozostawić puste"
                                    value={serial || ''}
                                    onChange={(e) => updateIndoorUnitField(index, indoorIndex, 'serial', e.target.value)}
                                  />
                                </label>
                              </>) : null}
                              <NameplatePhotoCapture
                                fieldLabel={`${isMultiSplit ? `Jednostka wewnętrzna JW ${indoorIndex + 1}` : 'Jednostka wewnętrzna JW'} — urządzenie ${index + 1}`}
                                file={nameplateDocument?.file || null}
                                existingPhotoUrl={String(existingNameplate?.uploadStatus || '').toLowerCase() === 'error' ? '' : (existingNameplate?.url || '')}
                                onSelect={(file) => applyNameplatePhoto(index, unitRef, file, serial)}
                                onRemove={() => removePendingNameplatePhoto(index, unitRef)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {!serialOnlyMode && device.legacy_serial_number && !getDeviceIndoorSerials(device).length && !device.outdoor_serial_number ? (
                      <div className="jobDeviceLegacySerialNote">
                        Stary zapis numeru seryjnego: <strong>{device.legacy_serial_number}</strong>. Zostanie zachowany, jeśli nie wpiszesz numerów JW/JZ.
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ) : null}
        {isAdmin && editingJobId ? (
          <div className="jobFormAdminFields" hidden={serialOnlyMode}>
            <div className="inputLabel adminNoteInputBlock" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
              <div
                className="fieldLabelRow adminNoteLabelRow"
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minWidth: 0 }}
              >
                <span style={{ margin: 0 }}>Komentarz administratora</span>
                {jobForm.admin_note ? (
                  <button
                    type="button"
                    className="fieldClearBtn"
                    style={{ flex: '0 0 auto', alignSelf: 'center', whiteSpace: 'nowrap' }}
                    onClick={() => updateField("admin_note", "")}
                  >
                    Wyczyść komentarz
                  </button>
                ) : null}
              </div>
              <div
                className="voiceFieldRow adminNoteVoiceFieldRow"
                style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 44px', gap: 8, alignItems: 'center', width: '100%', minWidth: 0, marginTop: 8 }}
              >
                <textarea
                  rows={2}
                  className="input textarea textareaNoTop adminNoteTextareaCompact"
                  style={{ width: '100%', minWidth: 0, height: 68, minHeight: 68, maxHeight: 108, margin: 0, resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Komentarz administratora"
                  value={jobForm.admin_note}
                  onChange={(e) => updateField("admin_note", e.target.value)}
                />
                <VoiceNoteButton label="Komentarz administratora" onValue={(value) => setJobForm((prev) => ({ ...prev, admin_note: appendVoiceNoteText(prev.admin_note, value) }))} disabled={busy} />
              </div>
            </div>
            {editingJobId ? (
              <>
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
              </>
            ) : null}
          </div>
        ) : null}
        <div className="row rightAlign">
          <button type="submit" className="btn primary saveJobBtn" disabled={busy}>
            {serialOnlyMode ? "Zapisz tabliczki" : (editingJobId ? "Zapisz zmiany" : (isAdmin ? "Zapisz zlecenie" : "Dodaj klienta"))}
          </button>
        </div>
      </form>
    </AppModal>
  );
}
