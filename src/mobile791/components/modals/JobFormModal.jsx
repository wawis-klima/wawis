import React, { useEffect, useMemo, useRef, useState } from "react";
import { STATUSES } from "../../utils/jobHelpers.jsx";
import AppModal from "./AppModal.jsx";
import ClientVoiceInput, { VoiceNoteButton, appendVoiceNoteText } from "../../../components/voice/ClientVoiceInput.jsx";
import { composePostalCity, lookupPostalCode, normalizePostalCode, splitPostalCity } from "../../modules/postal-code.js";
import { lookupCompanyByNip, normalizeGusNip } from "../../modules/gus-bir.js";
import {
  applyAutoLinkedContractorToJobForm,
  buildContractorOptionLabel,
  filterContractorsByQuery,
  findContractorByNip,
  getDuplicateContractorMatch,
} from "../../modules/job-contractors.js";
import { DEVICE_TYPE_MULTI, DEVICE_TYPE_SINGLE, MAX_INDOOR_UNITS_PER_DEVICE, createEmptyJobDevice, getDeviceIndoorModels, getDeviceIndoorSerials, getDeviceOutdoorModel, getDeviceType, normalizeJobDevices, serializeJobDevicesToFields } from "../../modules/job-devices.js";
import {
  CUSTOM_CONTRACTOR_ADDRESS_ID,
  formatContractorAddress,
  getPrimaryContractorAddress,
  normalizeContractorAddresses,
} from "../../modules/contractors.js";
import NameplatePhotoCapture from "../nameplate/NameplatePhotoCapture.jsx";
import MobileDeviceWizard from "../devices/MobileDeviceWizard.jsx";


// iOS can paint the native date text too high. Keep the system date picker
// interactive beneath a consistently centered, read-only display layer.
function formatWorkerInstallationDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return 'Wybierz datę';
  const day = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }).format(day);
}

export default function JobFormModal({
  showModal,
  closeJobModal,
  editingJobId,
  serialOnlyMode = false,
  jobForm,
  jobFormDirty = false,
  setJobForm,
  profiles,
  contractors = [],
  supabase,
  isAdmin = false,
  addJob,
  saveEditedJob,
  busy,
}) {
  // WAWIS 13.02: expand the admin edit client field only when its text wraps.
  // The persisted client value remains a single line of text; only its display is multiline.
  const adminClientNameRefV1302 = useRef(null);
  useEffect(() => {
    if (!showModal || !editingJobId || !isAdmin) return undefined;
    const field = adminClientNameRefV1302.current;
    if (!field) return undefined;
    const fit = () => {
      field.style.height = '32px';
      field.style.height = `${Math.min(56, Math.max(32, field.scrollHeight))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [showModal, editingJobId, isAdmin, jobForm.client]);

  const contractorOptions = useMemo(
    () => [...contractors].sort((left, right) => String(left?.company_name || '').localeCompare(String(right?.company_name || ''), 'pl')),
    [contractors],
  );

  const contractorSuggestions = useMemo(() => {
    const queries = [jobForm.client, jobForm.nip]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    if (!queries.length) return [];

    const seen = new Set();
    return queries
      .flatMap((query) => filterContractorsByQuery(contractorOptions, query))
      .filter((item) => {
        const id = String(item?.id || '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        if (!jobForm.contractor_id) return true;
        return id !== String(jobForm.contractor_id);
      })
      .slice(0, 3);
  }, [contractorOptions, jobForm.client, jobForm.nip, jobForm.contractor_id]);

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
  const explicitContractorAddress = linkedContractorAddresses.find(
    (address) => String(address.id) === String(jobForm.contractor_address_id || ''),
  ) || null;
  const selectedContractorAddressValue = explicitContractorAddress?.id
    || (linkedContractor ? CUSTOM_CONTRACTOR_ADDRESS_ID : '');
  const usesCatalogAddress = Boolean(explicitContractorAddress);
  const cityAddressParts = splitPostalCity(jobForm.city);
  const [postalLookupBusy, setPostalLookupBusy] = useState(false);
  const postalLookupAttemptRef = useRef("");
  const [gusLookupBusy, setGusLookupBusy] = useState(false);
  const [gusLookupMessage, setGusLookupMessage] = useState('');
  const gusLookupAttemptRef = useRef('');
  const gusLookupInFlightRef = useRef(false);


  const jobDevices = useMemo(
    () => normalizeJobDevices(jobForm, { keepEmptyRow: true, keepEmptyIndoor: true }),
    [jobForm.devices, jobForm.device_model, jobForm.device_serial_number],
  );

  const existingNameplatePhotos = Array.isArray(jobForm.existing_nameplate_photos) ? jobForm.existing_nameplate_photos : [];

  function handleClose() {
    closeJobModal({ busy });
  }

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

  function applyNameplatePhoto(deviceIndex, unitRef, file, reading = {}) {
    setJobForm((prev) => {
      const existingDocuments = Array.isArray(prev.pending_nameplate_photos) ? prev.pending_nameplate_photos : [];
      const remainingDocuments = existingDocuments.filter((item) => (
        Number(item.deviceIndex) !== Number(deviceIndex) || String(item.unitRef) !== unitRef
      ));
      const unitNumber = unitRef.startsWith('jw-') ? Number(unitRef.split('-')[1] || 1) : 0;
      const unitLabel = unitRef === 'jz' ? 'JZ' : `JW ${unitNumber}`;
      const modelValue = String(reading.modelValue || '').replace(/\s+/g, ' ').trim();
      const serialNumber = String(reading.serialNumber || '').replace(/\s+/g, '').trim().toUpperCase();

      const rows = normalizeJobDevices(prev, { keepEmptyRow: true, keepEmptyIndoor: true });
      const nextRows = rows.map((device, rowIndex) => {
        if (rowIndex !== Number(deviceIndex)) return device;
        if (unitRef === 'jz') {
          return {
            ...device,
            outdoor_model: modelValue || device.outdoor_model || '',
            outdoor_serial_number: serialNumber || device.outdoor_serial_number || '',
          };
        }

        const indoorIndex = Math.max(0, unitNumber - 1);
        const indoorSerials = getDeviceIndoorSerials(device, { keepEmpty: true });
        const indoorModels = getDeviceIndoorModels(device, {
          keepEmpty: true,
          minimumLength: Math.max(indoorSerials.length, indoorIndex + 1),
        });
        while (indoorModels.length <= indoorIndex) indoorModels.push('');
        while (indoorSerials.length <= indoorIndex) indoorSerials.push('');
        if (modelValue) indoorModels[indoorIndex] = modelValue;
        if (serialNumber) indoorSerials[indoorIndex] = serialNumber;
        return {
          ...device,
          indoor_model: indoorModels[0] || '',
          indoor_models: indoorModels,
          indoor_serial_number: indoorSerials[0] || '',
          indoor_serial_numbers: indoorSerials,
        };
      });

      return {
        ...applyDeviceRows(prev, nextRows),
        pending_nameplate_photos: [...remainingDocuments, {
          file,
          deviceIndex,
          unitRef,
          deviceRef: `device-${deviceIndex + 1}-${unitRef}`,
          serialNumber,
          verified: Boolean(reading.verified),
          verificationMethod: String(reading.verificationMethod || ''),
          ocrStatus: String(reading.ocrStatus || ''),
          ocrCheckedAt: reading.ocrCheckedAt || null,
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
    const currentDevice = jobDevices[deviceIndex] || {};
    const currentIndoorCount = Math.max(
      getDeviceIndoorSerials(currentDevice, { keepEmpty: true }).length,
      getDeviceIndoorModels(currentDevice, { keepEmpty: true }).length,
      1,
    );
    if (editingJobId && indoorIndex < currentIndoorCount - 1) {
      alert('W zapisanym montażu można usunąć tylko ostatnią jednostkę JW. Dzięki temu istniejące tabliczki i potwierdzenia pozostają przypisane do właściwych jednostek.');
      return;
    }

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
      contractor_id: editingJobId ? prev.contractor_id : '',
      nip: editingJobId ? prev.nip : '',
      client: data.clientName || prev.client,
      phone: data.phone || prev.phone,
      email: data.email || prev.email,
      city: data.formattedCity || prev.city,
      street: data.formattedStreet || prev.street,
    }));
  }

  function updateField(field, value) {
    if (field === 'nip') setGusLookupMessage('');
    setJobForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'device_model' || field === 'device_serial_number') {
        return applyDeviceRows(next, normalizeJobDevices(next, { keepEmptyRow: true, keepEmptyIndoor: true }));
      }
      if (field === 'client' && prev.contractor_id && !editingJobId) {
        const selectedContractor = contractorOptions.find((item) => String(item.id) === String(prev.contractor_id));
        const normalizedSelectedName = String(selectedContractor?.company_name || '').trim();
        if (normalizedSelectedName && String(value || '').trim() !== normalizedSelectedName) {
          next.contractor_id = '';
          next.contractor_address_id = '';
          next.contractor_address_label = '';
          next.nip = '';
        }
      }
      if (field === 'nip' && prev.contractor_id && !editingJobId) {
        const selectedContractor = contractorOptions.find((item) => String(item.id) === String(prev.contractor_id));
        const selectedNip = String(selectedContractor?.nip || '').replace(/\D+/g, '');
        const nextNip = String(value || '').replace(/\D+/g, '');
        if (selectedNip && nextNip && selectedNip !== nextNip) {
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
        // Ręczna zmiana lokalizacji jest świadomym odejściem od zapisanego adresu.
        // Nie wolno zostawiać ID starego adresu przy nowym snapshocie.
        next.contractor_address_id = '';
        next.contractor_address_label = '';
      }
      return next;
    });
  }

  function updateCityName(value) {
    const current = splitPostalCity(jobForm.city);
    const nextCity = String(value || '').trim();
    const sameCity = current.city.localeCompare(nextCity, 'pl', { sensitivity: 'base' }) === 0;
    updateAddressField('city', composePostalCity(nextCity, sameCity ? current.postalCode : ''));
  }

  function updatePostalCode(value) {
    const current = splitPostalCity(jobForm.city);
    updateAddressField('city', composePostalCity(current.city, normalizePostalCode(value)));
  }

  async function refreshPostalCode(cityValue = null, streetValue = null) {
    if (postalLookupBusy || !supabase) return;
    const current = splitPostalCity(cityValue ?? jobForm.city);
    const city = current.city;
    const street = String(streetValue ?? jobForm.street ?? '').trim();
    if (!city || current.postalCode) return;

    setPostalLookupBusy(true);
    try {
      const result = await lookupPostalCode({ supabase, city, street });
      if (result?.postalCode) {
        updateAddressField('city', composePostalCity(city, result.postalCode));
      }
    } catch (error) {
      console.warn('Nie udało się automatycznie dobrać kodu pocztowego.', error?.message || error);
    } finally {
      setPostalLookupBusy(false);
    }
  }

  async function refreshGusByNip(nipValue) {
    const nip = normalizeGusNip(nipValue);
    if (!supabase || nip.length !== 10 || gusLookupInFlightRef.current) return;

    const localMatch = findContractorByNip(contractorOptions, nip);
    if (localMatch) return;

    gusLookupInFlightRef.current = true;
    setGusLookupBusy(true);
    setGusLookupMessage('Pobieram dane z GUS…');
    try {
      const result = await lookupCompanyByNip({ supabase, nip });
      if (!result?.found) {
        setGusLookupMessage('Nie znaleziono firmy w GUS.');
        return;
      }

      setJobForm((prev) => {
        if (normalizeGusNip(prev.nip) !== nip || prev.contractor_id) return prev;
        return {
          ...prev,
          client: result.name || prev.client,
          city: result.city ? composePostalCity(result.city, result.postalCode) : prev.city,
          street: result.street || prev.street,
        };
      });
      setGusLookupMessage('Dane firmy pobrane z GUS.');
    } catch (error) {
      const message = String(error?.message || error || '');
      setGusLookupMessage(message.includes('sumę kontrolną') ? 'Nieprawidłowy NIP.' : 'Nie udało się pobrać danych z GUS.');
      console.warn('Nie udało się pobrać danych firmy z GUS.', message);
    } finally {
      gusLookupInFlightRef.current = false;
      setGusLookupBusy(false);
    }
  }

  useEffect(() => {
    if (!showModal || !supabase || postalLookupBusy) return undefined;
    const current = splitPostalCity(jobForm.city);
    if (!current.city || current.postalCode) return undefined;

    const lookupKey = `${current.city.toLocaleLowerCase('pl-PL')}|${String(jobForm.street || '').trim().toLocaleLowerCase('pl-PL')}`;
    if (postalLookupAttemptRef.current === lookupKey) return undefined;

    const timer = window.setTimeout(() => {
      postalLookupAttemptRef.current = lookupKey;
      void refreshPostalCode(jobForm.city, jobForm.street);
    }, 550);

    return () => window.clearTimeout(timer);
  }, [showModal, supabase, jobForm.city, jobForm.street, postalLookupBusy]);

  useEffect(() => {
    if (!showModal || editingJobId || jobForm.contractor_id) return;
    const match = findContractorByNip(contractorOptions, jobForm.nip);
    if (!match) return;
    handleContractorSelect(match);
  }, [showModal, editingJobId, contractorOptions, jobForm.nip, jobForm.contractor_id]);

  useEffect(() => {
    if (!showModal || editingJobId || !supabase || jobForm.contractor_id) return undefined;
    const nip = normalizeGusNip(jobForm.nip);
    if (nip.length !== 10) return undefined;
    if (findContractorByNip(contractorOptions, nip)) return undefined;
    if (gusLookupAttemptRef.current === nip) return undefined;

    const timer = window.setTimeout(() => {
      gusLookupAttemptRef.current = nip;
      void refreshGusByNip(nip);
    }, 650);

    return () => window.clearTimeout(timer);
  }, [showModal, editingJobId, supabase, contractorOptions, jobForm.nip, jobForm.contractor_id]);


  function handleContractorSelect(contractor) {
    if (!contractor?.id) {
      setJobForm((prev) => ({
        ...prev,
        contractor_id: '',
        contractor_address_id: '',
        contractor_address_label: '',
        nip: '',
      }));
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
      nip: contractor.nip || '',
      city: primaryAddress?.city || contractor.city || prev.city,
      street: primaryAddress?.street || contractor.street || prev.street,
    }));
  }

  function handleContractorAddressSelect(addressId) {
    if (addressId === CUSTOM_CONTRACTOR_ADDRESS_ID) {
      setJobForm((prev) => ({
        ...prev,
        contractor_address_id: '',
        contractor_address_label: '',
      }));
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

  function handleSubmit(e) {
    e?.preventDefault?.();

    const { form: resolvedForm } = serialOnlyMode
      ? { form: jobForm }
      : editingJobId && jobForm.contractor_id
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
        warnBeforeUnload={Boolean(jobFormDirty || busy)}
        onClose={handleClose}
        overlayClassName="formOverlay mobileDeviceWizardOverlay"
        contentClassName="card modal mobileDeviceWizardModal"
      >
        <MobileDeviceWizard
          jobId={editingJobId}
          devices={jobDevices}
          pendingPhotos={Array.isArray(jobForm.pending_nameplate_photos) ? jobForm.pending_nameplate_photos : []}
          existingPhotos={existingNameplatePhotos}
          busy={busy}
          onClose={handleClose}
          onSubmit={() => handleSubmit()}
          submitLabel="Zapisz urządzenia i tabliczki"
          onAddDevice={addDeviceRow}
          onRemoveDevice={removeDeviceRow}
          onChangeDeviceType={updateDeviceType}
          onSetUnitDescriptor={setUnitDescriptor}
          onAddIndoorUnit={addIndoorUnit}
          onRemoveIndoorUnit={removeIndoorUnit}
          onPhotoSelect={(deviceIndex, unitRef, file, reading) => applyNameplatePhoto(deviceIndex, unitRef, file, reading)}
          onPhotoRemove={removePendingNameplatePhoto}
        />
      </AppModal>
    );
  }

  return (
    <AppModal
      open={showModal}
        warnBeforeUnload={Boolean(jobFormDirty || busy)}
      onClose={handleClose}
      overlayClassName="formOverlay"
      contentClassName={`card modal formModal${editingJobId && !isAdmin ? " workerMobileEditModalV1295" : ""}${editingJobId && isAdmin ? " adminMobileEditModalV1297" : ""}`}
    >
      <form onSubmit={handleSubmit} className={`${serialOnlyMode ? "jobSerialOnlyForm " : ""}${!editingJobId ? "jobFormCreateMode" : ""}`.trim()}>
        <div className="jobHead">
          <h2>{serialOnlyMode ? "Zdjęcia tabliczek znamionowych" : (editingJobId ? "Edytuj montaż" : (isAdmin ? "Nowy montaż / zlecenie" : "Dodaj nowego klienta"))}</h2>
          {editingJobId ? <button type="button" className="btn" onClick={handleClose}>Zamknij</button> : null}
        </div>
        {!editingJobId ? (
          <div className="jobFormQuickActions">
            <button type="button" className="btn jobFormCloseBtn" onClick={handleClose}>Zamknij</button>
            <ClientVoiceInput onApply={applyVoiceClientData} disabled={busy} />
          </div>
        ) : null}
        {serialOnlyMode ? (
          <div className="jobSerialOnlyIntro">
            Dodaj zdjęcie tabliczki jednostki zewnętrznej JZ i każdej jednostki wewnętrznej JW. Zdjęcia są wymagane do zakończenia zlecenia.
          </div>
        ) : null}
        <div className="jobFormGeneralFields" hidden={serialOnlyMode}>
        {editingJobId ? <ClientVoiceInput onApply={applyVoiceClientData} disabled={busy} iconOnly={isAdmin} /> : null}
        {editingJobId && isAdmin ? (
          <textarea
            ref={adminClientNameRefV1302}
            rows={1}
            className="input adminClientNameV1302"
            aria-label="Klient"
            placeholder="Klient"
            value={jobForm.client}
            onChange={(e) => updateField("client", e.target.value.replace(/[\r\n]+/g, ' '))}
          />
        ) : (
          <input className="input" placeholder="Klient" value={jobForm.client} onChange={(e) => updateField("client", e.target.value)} />
        )}
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
        <input className="input" placeholder="Email klienta" value={jobForm.email} onChange={(e) => updateField("email", e.target.value)} />
        {editingJobId && isAdmin ? (
          <div className="adminContactPairV1302">
            <input className="input" placeholder="Telefon klienta / SMS" aria-label="Telefon klienta / SMS" value={jobForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
            <input className="input jobNipCompactInput" inputMode="numeric" aria-label="NIP (opcjonalnie)" placeholder={gusLookupBusy ? "Pobieram z GUS…" : "NIP (opcjonalnie)"} value={jobForm.nip || ''} onChange={(e) => updateField("nip", e.target.value)} />
          </div>
        ) : (
          <>
            <input className="input" placeholder="Telefon klienta / SMS" value={jobForm.phone} onChange={(e) => updateField("phone", e.target.value)} />
            <input
              className="input jobNipCompactInput"
              inputMode="numeric"
              placeholder={gusLookupBusy ? "Pobieram z GUS…" : "NIP (opcjonalnie)"}
              value={jobForm.nip || ''}
              onChange={(e) => updateField("nip", e.target.value)}
            />
          </>
        )}
        {gusLookupMessage ? <small className="jobNipLookupStatus" role="status">{gusLookupMessage}</small> : null}
        {linkedContractor ? (
          <label className="inputLabel jobAddressPicker">
            <span>Adres montażu</span>
            <select className="input" value={selectedContractorAddressValue} onChange={(e) => handleContractorAddressSelect(e.target.value)}>
              {!explicitContractorAddress ? (
                <option value={CUSTOM_CONTRACTOR_ADDRESS_ID}>Adres zapisany wcześniej w tym montażu</option>
              ) : null}
              {linkedContractorAddresses.map((address) => (
                <option key={address.id} value={address.id}>
                  {address.is_primary ? 'Główny' : address.label || 'Adres'} — {formatContractorAddress(address) || 'Brak danych'}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <input className="input" placeholder="Ulica i numer" value={jobForm.street} onChange={(e) => updateAddressField("street", e.target.value)} />
        <div className="postalCityFieldRow">
          <input
            className="input"
            placeholder="Miejscowość"
            value={cityAddressParts.city}
            onChange={(e) => updateCityName(e.target.value)}
            onBlur={() => refreshPostalCode()}
          />
          <input
            className="input postalCodeInput"
            inputMode="numeric"
            maxLength={6}
            placeholder={postalLookupBusy ? "Szukam…" : "Kod pocztowy"}
            value={cityAddressParts.postalCode}
            onChange={(e) => updatePostalCode(e.target.value)}
          />
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
            <textarea
              rows={3}
              className="input textarea textareaNoTop workerNewClientCommentTextarea"
              style={{ width: '100%', minWidth: 0, minHeight: 76, maxHeight: 130, margin: 0, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Komentarz do montażu"
              value={jobForm.worker_comment || ''}
              onChange={(e) => updateField("worker_comment", e.target.value)}
            />
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
            {editingJobId && isAdmin ? (
              <span className="adminDateVisibleLabelV1297" aria-hidden="true">
                {formatWorkerInstallationDate(jobForm.installation_date)}
              </span>
            ) : null}
            {editingJobId && !isAdmin ? (
              <span className="workerDateVisibleLabelV1296" aria-hidden="true">
                {formatWorkerInstallationDate(jobForm.installation_date)}
              </span>
            ) : null}
            <input
              className="installationDateNativeInput"
              style={{ display: 'block', width: '100%', minWidth: 0, maxWidth: '100%', height: '100%', boxSizing: 'border-box', border: 0, outline: 0, background: 'transparent', padding: '0 12px', font: 'inherit', color: 'inherit' }}
              aria-label={editingJobId && !isAdmin ? "Data montażu" : undefined}
              type="date"
              value={jobForm.installation_date || ""}
              onChange={(e) => updateField("installation_date", e.target.value)}
            />
          </div>
        </div>
        </div>
        {isAdmin && editingJobId ? (
          <div className="jobFormAdminFields" hidden={serialOnlyMode}>
            <div className="inputLabel adminNoteInputBlock" style={{ width: '100%', minWidth: 0, maxWidth: '100%' }}>
              <div
                className="fieldLabelRow adminNoteLabelRow"
                style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', minWidth: 0 }}
              >
                <span style={{ margin: 0 }}>Komentarz administratora</span>
                <div className="adminNoteHeaderActionsV1303">
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
                  <VoiceNoteButton
                    label="Komentarz administratora"
                    onValue={(value) => setJobForm((prev) => ({ ...prev, admin_note: appendVoiceNoteText(prev.admin_note, value) }))}
                    disabled={busy}
                  />
                </div>
              </div>
              <textarea
                rows={2}
                className="input textarea textareaNoTop adminNoteTextareaCompact"
                style={{ width: '100%', minWidth: 0, height: 68, minHeight: 68, maxHeight: 108, marginTop: 8, resize: 'vertical', boxSizing: 'border-box' }}
                placeholder="Komentarz administratora"
                value={jobForm.admin_note}
                onChange={(e) => updateField("admin_note", e.target.value)}
              />
            </div>
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
