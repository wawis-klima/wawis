import React, { useMemo, useState } from "react";
import { STATUSES } from "../../utils/jobHelpers.jsx";
import AppModal from "./AppModal.jsx";
import ClientVoiceInput, { VoiceFieldButton, VoiceNoteButton, appendVoiceNoteText } from "../voice/ClientVoiceInput.jsx";
import { normalizeVoiceEmail, normalizeVoicePhone } from "../../modules/client-voice-input.js";
import {
  applyAutoLinkedContractorToJobForm,
  buildContractorOptionLabel,
  filterContractorsByQuery,
  findJobContractorIdentityConflict,
  getContractorIdentityConflictLabel,
  getDuplicateContractorMatch,
} from "../../modules/job-contractors.js";
import { DEVICE_TYPE_MULTI, DEVICE_TYPE_SINGLE, MAX_INDOOR_UNITS_PER_DEVICE, createEmptyJobDevice, getDeviceIndoorModels, getDeviceIndoorSerials, getDeviceOutdoorModel, getDeviceType, normalizeJobDevices, serializeJobDevicesToFields } from "../../modules/job-devices.js";
import MobileDeviceWizard from "../../mobile791/components/devices/MobileDeviceWizard.jsx";
import {
  CUSTOM_CONTRACTOR_ADDRESS_ID,
  NEW_CONTRACTOR_ADDRESS_ID,
  findContractorAddressBySnapshot,
  formatContractorAddress,
  getPrimaryContractorAddress,
  normalizeContractorAddresses,
} from "../../modules/contractors.js";

export default function JobFormModal({
  showModal,
  closeJobModal,
  editingJobId,
  serialOnlyMode = false,
  jobForm,
  setJobForm,
  profiles,
  contractors = [],
  addJob,
  saveEditedJob,
  busy,
}) {
  const contractorOptions = useMemo(
    () => [...contractors].sort((left, right) => String(left?.company_name || '').localeCompare(String(right?.company_name || ''), 'pl')),
    [contractors],
  );

  const [contractorConflict, setContractorConflict] = useState(null);

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

  const linkedContractor = useMemo(
    () => contractorOptions.find((item) => String(item?.id || '') === String(jobForm.contractor_id || '')) || null,
    [contractorOptions, jobForm.contractor_id],
  );

  const linkedContractorAddresses = useMemo(
    () => normalizeContractorAddresses(linkedContractor || {}),
    [linkedContractor],
  );

  const matchedHistoricalAddress = useMemo(
    () => linkedContractor
      ? findContractorAddressBySnapshot(linkedContractor, jobForm.city, jobForm.street)
      : null,
    [jobForm.city, jobForm.street, linkedContractor],
  );

  const explicitContractorAddress = linkedContractorAddresses.find((address) => String(address.id) === String(jobForm.contractor_address_id || '')) || null;
  const selectedContractorAddressValue = explicitContractorAddress?.id
    || (jobForm.contractor_address_id === NEW_CONTRACTOR_ADDRESS_ID ? NEW_CONTRACTOR_ADDRESS_ID : '')
    || matchedHistoricalAddress?.id
    || (linkedContractor ? CUSTOM_CONTRACTOR_ADDRESS_ID : '');

  const usesCatalogAddress = Boolean(explicitContractorAddress || matchedHistoricalAddress);

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
        const indoorModels = getDeviceIndoorModels(device, { keepEmpty: true, minimumLength: indoorSerials.length });
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
      return { ...applyDeviceRows(prev, nextRows), pending_nameplate_photos: pendingDocuments };
    });
  }

  function updateIndoorUnitField(deviceIndex, indoorIndex, value) {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== deviceIndex) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const nextIndoorSerials = [...indoorSerials];
        nextIndoorSerials[indoorIndex] = value;
        return { ...device, indoor_serial_number: nextIndoorSerials[0] || '', indoor_serial_numbers: nextIndoorSerials };
      });
      return applyDeviceRows(prev, nextRows);
    });
  }

  function updateIndoorUnitModel(deviceIndex, indoorIndex, value) {
    setJobForm((prev) => {
      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== deviceIndex) return device;
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, { keepEmpty: true, minimumLength: indoorSerials.length });
        const nextIndoorModels = [...indoorModels];
        nextIndoorModels[indoorIndex] = value;
        return { ...device, indoor_model: nextIndoorModels[0] || '', indoor_models: nextIndoorModels };
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
        const indoorModels = getDeviceIndoorModels(device, { keepEmpty: true, minimumLength: indoorSerials.length });
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
        const indoorModels = getDeviceIndoorModels(device, { keepEmpty: true, minimumLength: indoorSerials.length });
        const nextIndoorSerials = indoorSerials.length <= 1 ? [''] : indoorSerials.filter((_, itemIndex) => itemIndex !== indoorIndex);
        const nextIndoorModels = indoorModels.length <= 1 ? [''] : indoorModels.filter((_, itemIndex) => itemIndex !== indoorIndex);
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
        .filter((item) => Number(item.deviceIndex) !== deviceIndex || item.unitRef !== `jw-${removedUnitNumber}`)
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
      return { ...applyDeviceRows(prev, nextRows), pending_nameplate_photos: pendingDocuments };
    });
  }

  function setUnitDescriptor(deviceIndex, unitRef, value) {
    if (unitRef === 'jz') {
      updateDeviceField(deviceIndex, 'outdoor_model', value);
      return;
    }
    const indoorIndex = Math.max(0, Number(String(unitRef).split('-')[1] || 1) - 1);
    updateIndoorUnitModel(deviceIndex, indoorIndex, value);
  }

  function applyVoiceClientData(data) {
    setJobForm((prev) => ({
      ...prev,
      contractor_id: '',
      contractor_address_id: '',
      contractor_address_label: '',
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
          next.contractor_address_id = '';
          next.contractor_address_label = '';
        }
      }
      return next;
    });
  }

  function updateAddressField(field, value) {
    setJobForm((prev) => {
      const next = { ...prev, [field]: value };
      if (linkedContractor && usesCatalogAddress) {
        next.contractor_address_id = NEW_CONTRACTOR_ADDRESS_ID;
        next.contractor_address_label = explicitContractorAddress?.label || matchedHistoricalAddress?.label || '';
      }
      return next;
    });
  }

  function handleContractorSelect(contractor) {
    if (!contractor?.id) {
      setJobForm((prev) => ({ ...prev, contractor_id: '', contractor_address_id: '', contractor_address_label: '' }));
      return;
    }

    const primaryAddress = getPrimaryContractorAddress(contractor);
    setJobForm((prev) => ({
      ...prev,
      contractor_id: contractor.id,
      contractor_address_id: primaryAddress?.id || '',
      contractor_address_label: '',
      client: contractor.company_name || prev.client,
      email: contractor.email || prev.email,
      phone: contractor.phone || prev.phone,
      city: primaryAddress?.city || contractor.city || prev.city,
      street: primaryAddress?.street || contractor.street || prev.street,
    }));
  }

  function handleContractorAddressSelect(addressId) {
    if (addressId === NEW_CONTRACTOR_ADDRESS_ID) {
      setJobForm((prev) => ({
        ...prev,
        contractor_address_id: NEW_CONTRACTOR_ADDRESS_ID,
        contractor_address_label: '',
        city: '',
        street: '',
      }));
      return;
    }

    if (addressId === CUSTOM_CONTRACTOR_ADDRESS_ID) {
      setJobForm((prev) => ({ ...prev, contractor_address_id: CUSTOM_CONTRACTOR_ADDRESS_ID }));
      return;
    }

    const address = linkedContractorAddresses.find((item) => String(item.id) === String(addressId));
    if (!address) return;
    setJobForm((prev) => ({
      ...prev,
      contractor_address_id: address.id,
      contractor_address_label: '',
      city: address.city || '',
      street: address.street || '',
    }));
  }

  function saveResolvedJobForm(resolvedForm) {
    const snapshot = { ...resolvedForm, viewers: [...resolvedForm.viewers] };
    if (editingJobId) {
      saveEditedJob(snapshot);
      return;
    }
    addJob(snapshot);
  }

  function getContractorConflictForForm(resolvedForm) {
    return findJobContractorIdentityConflict({
      contractors: contractorOptions,
      contractorId: resolvedForm.contractor_id,
      client: resolvedForm.client,
      email: resolvedForm.email,
      phone: resolvedForm.phone || resolvedForm.sms_recipient_phone,
    });
  }

  function handleSubmit(e) {
    e.preventDefault();

    if (serialOnlyMode) {
      saveEditedJob({ ...jobForm, viewers: [...(jobForm.viewers || [])] });
      return;
    }

    const addressResolvedForm = linkedContractor && !jobForm.contractor_address_id && matchedHistoricalAddress?.id
      ? { ...jobForm, contractor_address_id: matchedHistoricalAddress.id }
      : jobForm;
    const { form: resolvedForm } = applyAutoLinkedContractorToJobForm(addressResolvedForm, contractorOptions);
    const identityConflict = getContractorConflictForForm(resolvedForm);

    if (identityConflict?.contractor?.id) {
      setContractorConflict({
        ...identityConflict,
        form: resolvedForm,
      });
      return;
    }

    if (duplicateContractor && !resolvedForm.contractor_id) {
      setContractorConflict({
        contractor: duplicateContractor,
        reasons: ['nazwa'],
        score: 3,
        form: resolvedForm,
      });
      return;
    }

    saveResolvedJobForm(resolvedForm);
  }

  function resolveContractorConflict(action) {
    if (!contractorConflict?.contractor?.id || !contractorConflict?.form) return;

    const target = contractorConflict.contractor;
    const baseForm = contractorConflict.form;
    const nextForm = {
      ...baseForm,
      contractor_id: target.id,
      contractor_duplicate_resolution: {
        action,
        contractor_id: target.id,
        contractor: target,
      },
    };

    if (action === 'link') {
      const matchingAddress = findContractorAddressBySnapshot(target, nextForm.city, nextForm.street);
      const primaryAddress = getPrimaryContractorAddress(target);
      nextForm.email = nextForm.email || target.email || '';
      nextForm.phone = nextForm.phone || target.phone || '';
      if (nextForm.city && nextForm.street && !matchingAddress) {
        nextForm.contractor_address_id = NEW_CONTRACTOR_ADDRESS_ID;
        nextForm.contractor_address_label = nextForm.contractor_address_label || '';
      } else {
        const selectedAddress = matchingAddress || primaryAddress;
        nextForm.contractor_address_id = selectedAddress?.id || '';
        nextForm.city = nextForm.city || selectedAddress?.city || target.city || '';
        nextForm.street = nextForm.street || selectedAddress?.street || target.street || '';
      }
    }

    setContractorConflict(null);
    setJobForm(nextForm);
    saveResolvedJobForm(nextForm);
  }

  if (serialOnlyMode) {
    return (
      <AppModal
        open={showModal}
        onClose={closeJobModal}
        overlayClassName="formOverlay mobileDeviceWizardOverlay desktopAdminDeviceWizardOverlay"
        contentClassName="card modal mobileDeviceWizardModal desktopAdminDeviceWizardModal"
      >
        <MobileDeviceWizard
          devices={jobDevices}
          pendingPhotos={Array.isArray(jobForm.pending_nameplate_photos) ? jobForm.pending_nameplate_photos : []}
          existingPhotos={existingNameplatePhotos}
          busy={busy}
          submitLabel="Zapisz urządzenia"
          onClose={closeJobModal}
          onSubmit={() => saveEditedJob({ ...jobForm, viewers: [...(jobForm.viewers || [])] })}
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

  const conflictContractor = contractorConflict?.contractor || null;
  const conflictReasonLabel = getContractorIdentityConflictLabel(contractorConflict);
  const conflictAddress = [conflictContractor?.street, conflictContractor?.city].filter(Boolean).join(', ');

  return (
    <>
    <AppModal
      open={showModal}
      onClose={closeJobModal}
      overlayClassName="formOverlay"
      contentClassName="card modal formModal"
    >
      <form onSubmit={handleSubmit}>
        <div className="jobHead">
          <h2>{editingJobId ? "Edytuj montaż" : "Nowy montaż / zlecenie"}</h2>
          <button type="button" className="btn" onClick={closeJobModal}>Zamknij</button>
        </div>
        <ClientVoiceInput onApply={applyVoiceClientData} disabled={busy} />
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
        {linkedContractor ? (
          <div className="jobAddressPicker">
            <label className="inputLabel">
              <span>Adres montażu</span>
              <select className="input" value={selectedContractorAddressValue} onChange={(e) => handleContractorAddressSelect(e.target.value)}>
                {matchedHistoricalAddress || !selectedContractorAddressValue ? null : selectedContractorAddressValue === CUSTOM_CONTRACTOR_ADDRESS_ID ? (
                  <option value={CUSTOM_CONTRACTOR_ADDRESS_ID}>Adres zapisany wcześniej w tym montażu</option>
                ) : null}
                {linkedContractorAddresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {address.is_primary ? 'Główny' : address.label || 'Adres'} — {formatContractorAddress(address) || 'Brak danych'}
                  </option>
                ))}
                <option value={NEW_CONTRACTOR_ADDRESS_ID}>+ Dodaj nowy adres klienta</option>
              </select>
            </label>
            {jobForm.contractor_address_id === NEW_CONTRACTOR_ADDRESS_ID ? (
              <label className="inputLabel">
                <span>Nazwa adresu (opcjonalnie)</span>
                <input className="input" placeholder="np. Dom, Firma, Magazyn" value={jobForm.contractor_address_label || ''} onChange={(e) => updateField("contractor_address_label", e.target.value)} />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="voiceFieldRow">
          <input className="input" placeholder="Miejscowość" value={jobForm.city} onChange={(e) => updateAddressField("city", e.target.value)} />
          <VoiceFieldButton label="Miejscowość" onValue={(value) => updateAddressField("city", value)} disabled={busy} />
        </div>
        <div className="voiceFieldRow">
          <input className="input" placeholder="Ulica i numer" value={jobForm.street} onChange={(e) => updateAddressField("street", e.target.value)} />
          <VoiceFieldButton label="Ulica i numer" onValue={(value) => updateAddressField("street", value)} disabled={busy} />
        </div>
        {usesCatalogAddress ? <div className="jobAddressHint">Adres pochodzi z karty klienta. Możesz poprawić miasto, ulicę lub dopisać numer — zmieniona wersja zostanie zapisana jako adres klienta.</div> : null}
        <select className="input" value={jobForm.status} onChange={(e) => updateField("status", e.target.value)}>
          {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
        </select>
        <label className="inputLabel">
          <div className="fieldLabelRow">
            <span>Data montażu</span>
            <button
              type="button"
              className="fieldClearBtn"
              onClick={() => updateField("installation_date", "")}
              disabled={!jobForm.installation_date}
            >
              Wyczyść datę
            </button>
          </div>
          <input className="input" type="date" value={jobForm.installation_date || ""} onChange={(e) => updateField("installation_date", e.target.value)} />
        </label>
        {editingJobId ? (
        <div className="jobDevicesSection">
          <div className="jobDevicesHeader">
            <div>
              <strong>Urządzenia w montażu</strong>
              <span>Wybierz typ single-split albo multi-split. Przycisk dodaje kolejny pełny komplet urządzenia.</span>
            </div>
            <button type="button" className="btn jobDeviceAddBtn" onClick={addDeviceRow} aria-label="Dodaj kolejne urządzenie">
              + Dodaj urządzenie
            </button>
          </div>
          <div className="jobDevicesList">
            {jobDevices.map((device, index) => {
              const deviceType = getDeviceType(device);
              const isMultiSplit = deviceType === DEVICE_TYPE_MULTI;
              const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
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
                    <label className="inputLabel">
                      <span>Model urządzenia</span>
                      <input
                        className="input"
                        placeholder="np. Gree Amber Standard 3,5 kW"
                        value={device.model || ''}
                        onChange={(e) => updateDeviceField(index, "model", e.target.value)}
                      />
                    </label>
                    <label className="inputLabel">
                      <span>Numer seryjny jednostki zewnętrznej</span>
                      <input
                        className="input"
                        placeholder="np. JZ-2026-000123"
                        value={device.outdoor_serial_number || ''}
                        onChange={(e) => updateDeviceField(index, "outdoor_serial_number", e.target.value)}
                      />
                    </label>
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
                        {indoorSerials.map((serial, indoorIndex) => (
                          <label className="inputLabel jobIndoorUnitField" key={`job-device-${index}-indoor-${indoorIndex}`}>
                            <span>{isMultiSplit ? `Numer seryjny JW ${indoorIndex + 1}` : 'Numer seryjny jednostki wewnętrznej'}</span>
                            <div className="jobIndoorUnitInputRow">
                              <input
                                className="input"
                                placeholder={`np. JW-2026-00012${indoorIndex + 1}`}
                                value={serial || ''}
                                onChange={(e) => updateIndoorUnitField(index, indoorIndex, e.target.value)}
                              />
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
                          </label>
                        ))}
                      </div>
                    </div>
                    {device.legacy_serial_number && !getDeviceIndoorSerials(device).length && !device.outdoor_serial_number ? (
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
        <div className="inputLabel desktopAdminNoteInputBlock">
          <div className="fieldLabelRow">
            <span>Komentarz administratora</span>
            <button
              type="button"
              className="fieldClearBtn"
              onClick={() => updateField("admin_note", "")}
              disabled={!jobForm.admin_note}
            >
              Wyczyść komentarz
            </button>
          </div>
          <div className="voiceFieldRow desktopAdminNoteVoiceRow">
            <textarea
              rows={3}
              className="input textarea textareaNoTop desktopAdminNoteTextarea"
              placeholder="Komentarz administratora"
              value={jobForm.admin_note}
              onChange={(e) => updateField("admin_note", e.target.value)}
            />
            <VoiceNoteButton
              label="Komentarz administratora"
              onValue={(value) => setJobForm((prev) => ({ ...prev, admin_note: appendVoiceNoteText(prev.admin_note, value) }))}
              disabled={busy}
            />
          </div>
        </div>
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
    </AppModal>

      <AppModal
        open={Boolean(contractorConflict)}
        onClose={busy ? undefined : () => setContractorConflict(null)}
        overlayClassName="confirmDeleteOverlay"
        contentClassName="card modal formModal jobContractorConflictModal"
        closeOnOverlay={!busy}
        closeOnEscape={!busy}
      >
        <div className="jobContractorConflictHeader">
          <span className="jobContractorConflictBadge">Duplikat: {conflictReasonLabel}</span>
          <h2>Znaleziono istniejącego klienta</h2>
          <p className="muted">
            W bazie jest już klient z takimi danymi. Możesz podłączyć ten montaż do istniejącej kartoteki albo nadpisać kartotekę danymi wpisanymi w formularzu.
          </p>
        </div>

        <div className="jobContractorConflictGrid">
          <div className="jobContractorConflictCard">
            <span>Istniejący klient w bazie</span>
            <strong>{conflictContractor?.company_name || 'Klient'}</strong>
            {conflictContractor?.phone ? <small>tel. {conflictContractor.phone}</small> : null}
            {conflictContractor?.email ? <small>{conflictContractor.email}</small> : null}
            {conflictAddress ? <small>{conflictAddress}</small> : null}
          </div>
          <div className="jobContractorConflictCard">
            <span>Dane wpisane w montażu</span>
            <strong>{contractorConflict?.form?.client || 'Klient z formularza'}</strong>
            {contractorConflict?.form?.phone ? <small>tel. {contractorConflict.form.phone}</small> : null}
            {contractorConflict?.form?.email ? <small>{contractorConflict.form.email}</small> : null}
            {[contractorConflict?.form?.street, contractorConflict?.form?.city].filter(Boolean).length ? (
              <small>{[contractorConflict?.form?.street, contractorConflict?.form?.city].filter(Boolean).join(', ')}</small>
            ) : null}
          </div>
        </div>

        <div className="jobContractorConflictHint">
          Najbezpieczniej wybrać „Podłącz istniejącego klienta”, gdy montaż był wcześniej wpisany roboczo jako np. „Nieznane 1”.
        </div>

        <div className="row rightAlign jobContractorConflictActions">
          <button type="button" className="btn" onClick={() => setContractorConflict(null)} disabled={busy}>Anuluj</button>
          <button type="button" className="btn primary" onClick={() => resolveContractorConflict('link')} disabled={busy}>
            Podłącz istniejącego klienta
          </button>
          <button type="button" className="btn secondary" onClick={() => resolveContractorConflict('overwrite')} disabled={busy}>
            Nadpisz dane klienta
          </button>
        </div>
      </AppModal>
    </>
  );
}
