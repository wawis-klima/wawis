import React, { useMemo, useState } from 'react';
import DesktopNameplateOcrButton from './DesktopNameplateOcrButton.jsx';
import { getDesktopNameplateTarget } from '../../modules/desktop-nameplate-ocr-save.js';
import {
  DEVICE_TYPE_MULTI,
  getDeviceIndoorUnits,
  getDeviceOutdoorModel,
  getDeviceType,
} from '../../modules/job-devices.js';
import {
  getManualNameplateVerification,
  setManualNameplateVerification,
} from '../../modules/nameplate-verification.js';

function safeText(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim() || fallback;
  }
  if (Array.isArray(value)) {
    const text = value.map((item) => safeText(item)).filter(Boolean).join(', ');
    return text || fallback;
  }
  if (typeof value === 'object') {
    const candidate = value.model || value.name || value.value || value.label || value.serial_number || value.serialNumber;
    if (candidate !== undefined) return safeText(candidate, fallback);
  }
  try {
    const text = String(value).trim();
    return text && text !== '[object Object]' ? text : fallback;
  } catch {
    return fallback;
  }
}

function safeNameplateTarget(photo) {
  try {
    return getDesktopNameplateTarget(photo || {});
  } catch (error) {
    console.warn('Pominięto nieprawidłowy rekord tabliczki w widoku desktopowym.', error, photo);
    return null;
  }
}

function buildPhotoMap(photos = []) {
  const map = new Map();
  const safePhotos = Array.isArray(photos) ? photos : [];
  safePhotos.forEach((photo, photoIndex) => {
    const target = safeNameplateTarget(photo);
    if (!target) return;
    map.set(`${target.deviceIndex}:${target.unitRef}`, { photo, photoIndex, target });
  });
  return map;
}

function getPhotoUrl(photo = {}) {
  return safeText(photo?.thumbnail_image_url || photo?.image_url || photo?.signed_url || photo?.original_image_url || '');
}

class OcrActionBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Błąd kontrolki odczytu tabliczki. Widok montażu pozostaje dostępny.', error, info);
  }

  render() {
    if (this.state.failed) {
      return <span className="desktopDeviceOcrUnavailable">Odczyt chwilowo niedostępny</span>;
    }
    return this.props.children;
  }
}

class DeviceCardsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Błąd kart urządzeń w szczegółach montażu.', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="desktopDeviceCardsFallback" role="alert">
          <strong>Nie udało się wyświetlić pełnej karty urządzeń.</strong>
          <span>Pozostałe dane montażu są nadal dostępne. Odśwież stronę; jeśli problem wróci, rekord urządzenia wymaga sprawdzenia.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

function OcrStatus({ photo, manualVerification }) {
  const approved = safeText(photo?.ocr_status).toLowerCase() === 'approved';
  if (approved) return <span className="desktopDeviceOcrStatus approved">zatwierdzony</span>;
  if (manualVerification) return <span className="desktopDeviceOcrStatus manual">potwierdzony ręcznie</span>;
  if (!photo) return <span className="desktopDeviceOcrStatus missing">brak tabliczki</span>;
  return <span className="desktopDeviceOcrStatus review">do sprawdzenia</span>;
}

function UnitRow({
  unitLabel,
  model,
  serialNumber,
  photoEntry,
  job,
  supabase,
  disabled,
  onOpenPhoto,
  onOcrSaved,
  manualVerification,
  manualVerificationBusy,
  onToggleManualVerification,
}) {
  const photo = photoEntry?.photo || null;
  const photoUrl = getPhotoUrl(photo);
  const labelText = safeText(unitLabel, 'Jednostka');
  const modelText = safeText(model, 'Brak modelu');
  const serialText = safeText(serialNumber, 'brak');
  const validOcrTarget = Boolean(photoEntry?.target || safeNameplateTarget(photo));
  const photoApproved = safeText(photo?.ocr_status).toLowerCase() === 'approved';

  return (
    <div className="desktopDeviceUnitRow">
      <div className="desktopDeviceUnitIdentity">
        <strong>{labelText} — {modelText}</strong>
        <span>Numer seryjny: <b>{serialText}</b></span>
      </div>

      <div className="desktopDeviceUnitMeta desktopDeviceNameplateMeta">
        <span className="desktopDeviceUnitMetaLabel">Tabliczka</span>
        {photoUrl ? (
          <button
            type="button"
            className="btn ghostBtn desktopDeviceNameplateOpen"
            onClick={() => {
              if (typeof onOpenPhoto === 'function') onOpenPhoto(photo, photoEntry?.photoIndex);
            }}
          >
            Otwórz
          </button>
        ) : (
          <span className="desktopDeviceNameplateMissing">Brak</span>
        )}
      </div>

      <div className="desktopDeviceUnitMeta desktopDeviceOcrMeta">
        <span className="desktopDeviceUnitMetaLabel">Status</span>
        <OcrStatus photo={photo} manualVerification={manualVerification} />
      </div>

      <div className="desktopDeviceUnitAction">
        {photo && validOcrTarget ? (
          <OcrActionBoundary>
            <DesktopNameplateOcrButton
              photo={photo}
              job={job || {}}
              supabase={supabase}
              disabled={Boolean(!photo)}
              compact
              onSaved={onOcrSaved}
            />
          </OcrActionBoundary>
        ) : photo ? (
          <span className="desktopDeviceOcrUnavailable">Brak danych przypisania JZ/JW</span>
        ) : null}

        {!photoApproved ? (
          <button
            type="button"
            className={`btn ghostBtn desktopDeviceManualVerifyBtn ${manualVerification ? 'revoke' : 'active'}`}
            disabled={Boolean(disabled || manualVerificationBusy)}
            onClick={() => onToggleManualVerification?.(!manualVerification)}
            title={manualVerification
              ? 'Cofnij ręczne potwierdzenie tej tabliczki.'
              : 'Potwierdź administracyjnie tę tabliczkę także wtedy, gdy zdjęcia nie ma.'}
          >
            {manualVerificationBusy
              ? 'Zapisywanie...'
              : (manualVerification ? 'Cofnij ręczne' : 'Potwierdź ręcznie')}
          </button>
        ) : null}
        {!photo && !manualVerification ? (
          <span className="desktopDeviceManualVerifyNote">Możesz potwierdzić bez zdjęcia.</span>
        ) : null}
      </div>
    </div>
  );
}

function getSafeDevicePresentation(device, deviceIndex, photoMap) {
  try {
    const safeDevice = device && typeof device === 'object' ? device : {};
    const outdoorModel = safeText(getDeviceOutdoorModel(safeDevice) || safeDevice.model || '');
    const photoIndoorNumbers = [...photoMap.keys()]
      .map((key) => safeText(key).match(new RegExp(`^${deviceIndex}:jw-(\\d+)$`)))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter((value) => Number.isFinite(value) && value > 0 && value <= 5);
    const minimumIndoorCount = Math.max(
      1,
      ...photoIndoorNumbers,
      getDeviceType(safeDevice) === DEVICE_TYPE_MULTI ? 2 : 1,
    );
    const indoorUnits = getDeviceIndoorUnits(safeDevice, {
      keepEmpty: true,
      minimumLength: minimumIndoorCount,
    }).map((unit, unitOffset) => ({
      unitNumber: Number(unit?.unitNumber || unitOffset + 1),
      model: safeText(unit?.model || ''),
      serialNumber: safeText(unit?.serialNumber || ''),
    }));
    const isMulti = getDeviceType(safeDevice) === DEVICE_TYPE_MULTI || indoorUnits.length > 1;
    const outdoorSerial = safeText(
      safeDevice.outdoor_serial_number
      || (safeDevice.legacy_serial_number && !safeDevice.indoor_serial_number ? safeDevice.legacy_serial_number : ''),
    );
    return { safeDevice, outdoorModel, outdoorSerial, indoorUnits, isMulti };
  } catch (error) {
    console.warn(`Nie udało się znormalizować urządzenia ${deviceIndex}. Pokazano bezpieczny widok awaryjny.`, error, device);
    return {
      safeDevice: {},
      outdoorModel: safeText(device?.model || device?.device_model || '', 'Brak modelu'),
      outdoorSerial: safeText(device?.serial_number || device?.device_serial_number || ''),
      indoorUnits: [{ unitNumber: 1, model: '', serialNumber: '' }],
      isMulti: false,
    };
  }
}

function DesktopJobDeviceCardsContent({
  job,
  devices = [],
  photos = [],
  supabase,
  disabled = false,
  onOpenPhoto,
  onOcrSaved,
  manualVerifications = [],
  onManualVerificationChanged,
  onDeleteDevice,
}) {
  const safeDevices = Array.isArray(devices) ? devices.filter(Boolean) : [];
  const photoMap = useMemo(() => buildPhotoMap(photos), [photos]);
  const [manualVerificationBusyKey, setManualVerificationBusyKey] = useState('');

  const toggleManualVerification = async (deviceIndex, unitRef, approved) => {
    const busyKey = `${deviceIndex}:${unitRef}`;
    setManualVerificationBusyKey(busyKey);
    try {
      const result = await setManualNameplateVerification({
        supabase,
        jobId: job?.id,
        deviceIndex,
        unitRef,
        approved,
      });
      onManualVerificationChanged?.(result);
    } catch (error) {
      alert(error?.message || 'Nie udało się zmienić ręcznego potwierdzenia tabliczki.');
    } finally {
      setManualVerificationBusyKey('');
    }
  };

  if (!safeDevices.length) {
    return <div className="muted">Brak zapisanych urządzeń.</div>;
  }

  return (
    <div className="desktopJobDeviceCards">
      {safeDevices.map((device, deviceOffset) => {
        const deviceIndex = deviceOffset + 1;
        const presentation = getSafeDevicePresentation(device, deviceIndex, photoMap);

        return (
          <article className="desktopJobDeviceCard" key={`desktop-device-card-${deviceIndex}`}>
            <header className="desktopJobDeviceCardHeader">
              <div>
                <span>Urządzenie {deviceIndex}</span>
                <strong>{presentation.isMulti ? 'Multi-split' : 'Single-split'}</strong>
              </div>
              <div className="desktopJobDeviceHeaderActions">
                <span className={`desktopJobDeviceTypeBadge ${presentation.isMulti ? 'multi' : 'single'}`}>
                  {presentation.isMulti ? 'Multi' : 'Single'}
                </span>
                {typeof onDeleteDevice === 'function' ? (
                  <button
                    type="button"
                    className="btn premiumActionBtn premiumDangerBtn desktopJobDeviceDeleteBtn"
                    disabled={disabled}
                    onClick={() => onDeleteDevice(deviceIndex)}
                  >
                    Usuń urządzenie
                  </button>
                ) : null}
              </div>
            </header>

            <div className="desktopJobDeviceUnits">
              <UnitRow
                unitLabel="JZ"
                model={presentation.outdoorModel}
                serialNumber={presentation.outdoorSerial}
                photoEntry={photoMap.get(`${deviceIndex}:jz`)}
                job={job}
                supabase={supabase}
                disabled={disabled}
                onOpenPhoto={onOpenPhoto}
                onOcrSaved={onOcrSaved}
                manualVerification={getManualNameplateVerification(manualVerifications, deviceIndex, 'jz')}
                manualVerificationBusy={manualVerificationBusyKey === `${deviceIndex}:jz`}
                onToggleManualVerification={(approved) => toggleManualVerification(deviceIndex, 'jz', approved)}
              />

              {presentation.indoorUnits.map((unit, unitOffset) => (
                <UnitRow
                  key={`desktop-device-${deviceIndex}-jw-${unit.unitNumber || unitOffset + 1}`}
                  unitLabel={`JW${unit.unitNumber || unitOffset + 1}`}
                  model={unit.model || (!presentation.isMulti ? presentation.outdoorModel : '')}
                  serialNumber={unit.serialNumber || ''}
                  photoEntry={photoMap.get(`${deviceIndex}:jw-${unit.unitNumber || unitOffset + 1}`)}
                  job={job}
                  supabase={supabase}
                  disabled={disabled}
                  onOpenPhoto={onOpenPhoto}
                  onOcrSaved={onOcrSaved}
                  manualVerification={getManualNameplateVerification(manualVerifications, deviceIndex, `jw-${unit.unitNumber || unitOffset + 1}`)}
                  manualVerificationBusy={manualVerificationBusyKey === `${deviceIndex}:jw-${unit.unitNumber || unitOffset + 1}`}
                  onToggleManualVerification={(approved) => toggleManualVerification(deviceIndex, `jw-${unit.unitNumber || unitOffset + 1}`, approved)}
                />
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export default function DesktopJobDeviceCards(props) {
  return (
    <DeviceCardsBoundary>
      <DesktopJobDeviceCardsContent {...props} />
    </DeviceCardsBoundary>
  );
}
