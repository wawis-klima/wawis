import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEVICE_TYPE_MULTI,
  DEVICE_TYPE_SINGLE,
  MAX_INDOOR_UNITS_PER_DEVICE,
  getDeviceIndoorModels,
  getDeviceIndoorSerials,
  getDeviceOutdoorModel,
  getDeviceType,
} from '../../modules/job-devices.js';
import NameplatePhotoCapture from '../nameplate/NameplatePhotoCapture.jsx';
import { getAllRotensoPowerOptions, getRotensoModelGroups, getRotensoPowerOptions } from '../../modules/rotenso-models.js';
import { getRotensoModelHistorySections, recordRotensoModelUsage } from '../../modules/rotenso-model-history.js';
import './mobile-device-wizard.css';

const BRANDS = ['Rotenso', 'LG', 'Gree', 'Midea'];
const DEFAULT_POWERS = ['2,1 kW', '2,6 kW', '2,7 kW', '3,5 kW', '3,6 kW', '5,0 kW', '5,1 kW', '5,2 kW', '5,3 kW', '7,0 kW'];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function DeviceIcon({ multi = false }) {
  if (multi) {
    return (
      <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <rect x="3" y="16" width="6" height="5" rx="1" />
        <rect x="15" y="16" width="6" height="5" rx="1" />
        <path d="M12 8v4M6 16v-4h12v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="27" height="27" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M4 11h16M9 15h6" />
    </svg>
  );
}

function UnitIcon({ outdoor = false }) {
  if (outdoor) return <DeviceIcon />;
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="18" height="11" rx="3" />
      <path d="M6 13h12M8 17v2M16 17v2" />
    </svg>
  );
}

function SelectorIcon({ kind }) {
  if (kind === 'power') {
    return (
      <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />
      </svg>
    );
  }
  if (kind === 'model') {
    return (
      <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 2 8 4.5v11L12 22l-8-4.5v-11L12 2Z" />
        <path d="m4 6.5 8 4.5 8-4.5M12 11v11" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13 11 22l-9-9V4a2 2 0 0 1 2-2h9l7 7v4Z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}

function normalizePower(value) {
  return String(value || '').replace('.', ',').replace(/\s+/g, ' ').trim();
}

function parseDescriptor(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { brand: '', model: '', power: '' };

  const powerMatch = raw.match(/(\d+(?:[.,]\d+)?\s*kW)$/i);
  const power = powerMatch ? normalizePower(powerMatch[1]) : '';
  const withoutPower = powerMatch ? raw.slice(0, powerMatch.index).trim() : raw;
  const knownBrand = BRANDS.find((brand) => withoutPower.toLowerCase().startsWith(`${brand.toLowerCase()} `) || withoutPower.toLowerCase() === brand.toLowerCase());
  if (knownBrand) {
    return {
      brand: knownBrand,
      model: withoutPower.slice(knownBrand.length).trim(),
      power,
    };
  }
  const parts = withoutPower.split(' ').filter(Boolean);
  if (power && parts.length >= 2) {
    return { brand: parts[0], model: parts.slice(1).join(' '), power };
  }
  if (parts.length === 1 && !/\d/.test(parts[0])) {
    return { brand: parts[0], model: '', power };
  }
  return { brand: '', model: withoutPower, power };
}

function formatDescriptor(descriptor = {}) {
  return [descriptor.brand, descriptor.model, normalizePower(descriptor.power)].filter(Boolean).join(' ').trim();
}

function getUnitModel(device, unitRef) {
  if (unitRef === 'jz') return getDeviceOutdoorModel(device);
  const indoorIndex = Math.max(0, Number(String(unitRef).split('-')[1] || 1) - 1);
  return getDeviceIndoorModels(device, { keepEmpty: true })[indoorIndex] || '';
}

function getPhotoState({ pendingPhotos, existingPhotos, deviceIndex, unitRef }) {
  const pending = pendingPhotos.find((item) => Number(item.deviceIndex) === Number(deviceIndex) && String(item.unitRef) === unitRef) || null;
  const existing = existingPhotos.find((item) => Number(item.deviceIndex) === Number(deviceIndex) && String(item.unitRef) === unitRef) || null;
  const existingUrl = String(existing?.uploadStatus || '').toLowerCase() === 'error' ? '' : (existing?.url || '');
  return {
    file: pending?.file || null,
    existingUrl,
    hasPhoto: Boolean(pending?.file || existingUrl),
  };
}

function getRequiredUnitRefs(device) {
  const indoorCount = Math.max(1, getDeviceIndoorSerials(device, { keepEmpty: true }).length, getDeviceIndoorModels(device, { keepEmpty: true }).length);
  return ['jz', ...Array.from({ length: indoorCount }, (_, index) => `jw-${index + 1}`)];
}

function getDevicePhotoCompletion({ device, deviceIndex, pendingPhotos, existingPhotos }) {
  const refs = getRequiredUnitRefs(device);
  const ready = refs.filter((unitRef) => getPhotoState({ pendingPhotos, existingPhotos, deviceIndex, unitRef }).hasPhoto).length;
  return { ready, total: refs.length, complete: ready === refs.length };
}

function getDeviceSummary(device) {
  const type = getDeviceType(device);
  const outdoor = getDeviceOutdoorModel(device);
  const indoorModels = getDeviceIndoorModels(device).filter(Boolean);
  if (type === DEVICE_TYPE_MULTI) {
    return [outdoor ? `JZ ${outdoor}` : 'JZ bez modelu', `${Math.max(2, getDeviceIndoorSerials(device, { keepEmpty: true }).length)} JW`].join(' + ');
  }
  return outdoor || indoorModels[0] || 'Dane urządzenia do uzupełnienia';
}

function StepPill({ current }) {
  return <div className="mobileDeviceWizardStep"><span>•••</span>Krok {current} z 4</div>;
}

function WizardHeader({ title, step, onBack, onClose }) {
  return (
    <>
      <div className="mobileDeviceWizardHeader">
        <button type="button" className="mobileDeviceWizardBack" onClick={onBack || onClose} aria-label={onBack ? 'Wróć' : 'Zamknij'}><BackIcon /></button>
        <h2>{title}</h2>
        <button type="button" className="mobileDeviceWizardClose" onClick={onClose}>Zamknij</button>
      </div>
      <StepPill current={step} />
    </>
  );
}

function SelectionRow({ kind, label, value, placeholder, disabled = false, onClick }) {
  return (
    <button type="button" className="mobileDeviceWizardSelection" onClick={onClick} disabled={disabled}>
      <span className="mobileDeviceWizardSelectionIcon"><SelectorIcon kind={kind} /></span>
      <span className="mobileDeviceWizardSelectionText"><strong>{label}</strong><span>{value || placeholder}</span></span>
      <ChevronIcon />
    </button>
  );
}

function PickerSheet({ picker, descriptor, deviceType, unitRef, onApply, onClose }) {
  const [customValue, setCustomValue] = useState('');
  const [modelQuery, setModelQuery] = useState('');

  useEffect(() => {
    if (picker?.kind !== 'model') setModelQuery('');
    if (!picker?.kind?.startsWith('custom')) setCustomValue('');
  }, [picker]);

  if (!picker) return null;

  let title = '';
  let options = [];
  const rotensoContext = { deviceType, unitRef };
  const isRotensoModelPicker = picker.kind === 'model' && descriptor.brand === 'Rotenso';
  const rotensoModelGroups = isRotensoModelPicker ? getRotensoModelGroups(rotensoContext) : [];
  const rotensoModelNames = rotensoModelGroups.flatMap((group) => group.models.map((model) => model.name));
  const rotensoHistory = isRotensoModelPicker
    ? getRotensoModelHistorySections(rotensoModelNames, rotensoContext)
    : { recent: [], frequent: [] };
  const normalizedModelQuery = modelQuery.trim().toLowerCase();
  const filteredRotensoGroups = rotensoModelGroups
    .map((group) => ({
      ...group,
      models: group.models.filter((model) => !normalizedModelQuery || model.name.toLowerCase().includes(normalizedModelQuery)),
    }))
    .filter((group) => group.models.length);

  if (picker.kind === 'brand') {
    title = 'Wybierz markę';
    options = [...BRANDS, 'Inna marka'];
  } else if (picker.kind === 'model') {
    title = 'Wybierz model';
    options = descriptor.brand === 'Rotenso' ? [] : ['Inny model'];
  } else if (picker.kind === 'power') {
    title = 'Wybierz moc';
    const rotensoPowers = descriptor.brand === 'Rotenso'
      ? (getRotensoPowerOptions(descriptor.model, rotensoContext).length
        ? getRotensoPowerOptions(descriptor.model, rotensoContext)
        : getAllRotensoPowerOptions(rotensoContext))
      : DEFAULT_POWERS;
    options = [...rotensoPowers, 'Inna moc'];
  } else {
    title = picker.kind === 'customBrand' ? 'Wpisz markę' : picker.kind === 'customPower' ? 'Wpisz moc' : 'Wpisz model';
  }

  const isCustom = picker.kind.startsWith('custom');
  return (
    <div className="mobileDevicePickerOverlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="mobileDevicePickerSheet" role="dialog" aria-modal="true">
        <div className="mobileDevicePickerHandle" />
        <div className="mobileDevicePickerTitleRow"><h3>{title}</h3><button type="button" onClick={onClose}>Anuluj</button></div>
        {isCustom ? (
          <div className="mobileDevicePickerCustom">
            <input
              className="input"
              autoFocus
              value={customValue}
              placeholder={picker.kind === 'customBrand' ? 'np. AUX' : picker.kind === 'customPower' ? 'np. 10,5 kW' : 'Wpisz nazwę modelu'}
              onChange={(event) => setCustomValue(event.target.value)}
            />
            <button type="button" className="btn primary" disabled={!customValue.trim()} onClick={() => onApply(picker.kind, customValue.trim())}>Zapisz</button>
          </div>
        ) : isRotensoModelPicker ? (
          <div className="mobileDevicePickerModelCatalog">
            <input
              className="input mobileDevicePickerSearch"
              value={modelQuery}
              placeholder="Szukaj modelu Rotenso"
              onChange={(event) => setModelQuery(event.target.value)}
            />
            {!normalizedModelQuery && rotensoHistory.recent.length ? (
              <section className="mobileDevicePickerGroup mobileDevicePickerHistoryGroup">
                <h4>Ostatnio używane</h4>
                <div className="mobileDevicePickerQuickModels">
                  {rotensoHistory.recent.map((modelName) => (
                    <button key={`recent-${modelName}`} type="button" className={descriptor.model === modelName ? 'selected' : ''} onClick={() => onApply('model', modelName)}>
                      <span>{modelName}</span>{descriptor.model === modelName ? <span className="mobileDevicePickerCheck"><CheckIcon /></span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            {!normalizedModelQuery && rotensoHistory.frequent.length ? (
              <section className="mobileDevicePickerGroup mobileDevicePickerHistoryGroup">
                <h4>Najczęściej wybierane</h4>
                <div className="mobileDevicePickerQuickModels">
                  {rotensoHistory.frequent.map((modelName) => (
                    <button key={`frequent-${modelName}`} type="button" className={descriptor.model === modelName ? 'selected' : ''} onClick={() => onApply('model', modelName)}>
                      <span>{modelName}</span>{descriptor.model === modelName ? <span className="mobileDevicePickerCheck"><CheckIcon /></span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <div className="mobileDevicePickerFullCatalogLabel">Pełny katalog</div>
            {filteredRotensoGroups.map((group) => (
              <section className="mobileDevicePickerGroup" key={group.label}>
                <h4>{group.label}</h4>
                <div className="mobileDevicePickerOptions">
                  {group.models.map((model) => {
                    const selected = descriptor.model === model.name;
                    return (
                      <button key={model.name} type="button" className={selected ? 'selected' : ''} onClick={() => onApply('model', model.name)}>
                        <span>{model.name}</span>{selected ? <span className="mobileDevicePickerCheck"><CheckIcon /></span> : <span className="mobileDevicePickerRadio" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {!filteredRotensoGroups.length ? <div className="mobileDevicePickerEmpty">Nie znaleziono modelu.</div> : null}
            <div className="mobileDevicePickerOptions mobileDevicePickerManualOption">
              <button type="button" onClick={() => onApply('model', 'Inny model')}><span>Inny model</span><span className="mobileDevicePickerRadio" /></button>
            </div>
          </div>
        ) : (
          <div className="mobileDevicePickerOptions">
            {options.map((option) => {
              const selected = picker.kind === 'brand'
                ? descriptor.brand === option
                : picker.kind === 'model'
                  ? descriptor.model === option
                  : normalizePower(descriptor.power) === option;
              return (
                <button key={option} type="button" className={selected ? 'selected' : ''} onClick={() => onApply(picker.kind, option)}>
                  <span>{option}</span>{selected ? <span className="mobileDevicePickerCheck"><CheckIcon /></span> : <span className="mobileDevicePickerRadio" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MobileDeviceWizard({
  devices,
  pendingPhotos = [],
  existingPhotos = [],
  busy = false,
  submitLabel = 'Zapisz montaż',
  onClose,
  onSubmit,
  onAddDevice,
  onRemoveDevice,
  onChangeDeviceType,
  onSetUnitDescriptor,
  onAddIndoorUnit,
  onRemoveIndoorUnit,
  onPhotoSelect,
  onPhotoRemove,
}) {
  const initializedRef = useRef(false);
  const [screen, setScreen] = useState('overview');
  const [activeDeviceIndex, setActiveDeviceIndex] = useState(0);
  const [activeUnitRef, setActiveUnitRef] = useState('jz');
  const [picker, setPicker] = useState(null);
  const [selectedType, setSelectedType] = useState(DEVICE_TYPE_SINGLE);

  const safeDevices = Array.isArray(devices) && devices.length ? devices : [];
  const activeDevice = safeDevices[activeDeviceIndex] || safeDevices[0] || null;
  const activeDescriptor = useMemo(() => parseDescriptor(activeDevice ? getUnitModel(activeDevice, activeUnitRef) : ''), [activeDevice, activeUnitRef]);

  useEffect(() => {
    if (initializedRef.current || !safeDevices.length) return;
    initializedRef.current = true;
    const first = safeDevices[0];
    const firstCompletion = getDevicePhotoCompletion({ device: first, deviceIndex: 0, pendingPhotos, existingPhotos });
    const hasDeviceData = Boolean(getDeviceOutdoorModel(first) || getDeviceIndoorModels(first).some(Boolean) || firstCompletion.ready);
    setActiveDeviceIndex(0);
    setSelectedType(getDeviceType(first));
    setScreen(hasDeviceData ? 'overview' : 'type');
  }, [existingPhotos, pendingPhotos, safeDevices]);

  useEffect(() => {
    if (!safeDevices.length) return;
    if (activeDeviceIndex >= safeDevices.length) setActiveDeviceIndex(Math.max(0, safeDevices.length - 1));
  }, [activeDeviceIndex, safeDevices.length]);

  function openDevice(index) {
    const device = safeDevices[index];
    if (!device) return;
    setActiveDeviceIndex(index);
    setSelectedType(getDeviceType(device));
    setActiveUnitRef('jz');
    setScreen(getDeviceType(device) === DEVICE_TYPE_MULTI ? 'multi' : 'single');
  }

  function openUnit(unitRef) {
    setActiveUnitRef(unitRef);
    setScreen('unit');
  }

  function startAddingDevice() {
    const nextIndex = safeDevices.length;
    onAddDevice?.();
    setActiveDeviceIndex(nextIndex);
    setSelectedType(DEVICE_TYPE_SINGLE);
    setScreen('type');
  }

  function applyPicker(kind, value) {
    if (!activeDevice) return;
    const descriptor = { ...activeDescriptor };
    if (kind === 'brand') {
      if (value === 'Inna marka') {
        setPicker({ kind: 'customBrand' });
        return;
      }
      descriptor.brand = value;
      descriptor.model = '';
    } else if (kind === 'customBrand') {
      descriptor.brand = value;
      descriptor.model = '';
    } else if (kind === 'model') {
      if (value === 'Inny model') {
        setPicker({ kind: 'customModel' });
        return;
      }
      descriptor.model = value;
      if (descriptor.brand === 'Rotenso') {
        recordRotensoModelUsage(value, { deviceType: getDeviceType(activeDevice), unitRef: activeUnitRef });
      }
      const allowedPowers = descriptor.brand === 'Rotenso'
        ? getRotensoPowerOptions(value, { deviceType: getDeviceType(activeDevice), unitRef: activeUnitRef })
        : [];
      if (allowedPowers.length && !allowedPowers.includes(normalizePower(descriptor.power))) descriptor.power = '';
    } else if (kind === 'customModel') {
      descriptor.model = value;
    } else if (kind === 'power') {
      if (value === 'Inna moc') {
        setPicker({ kind: 'customPower' });
        return;
      }
      descriptor.power = value;
    } else if (kind === 'customPower') {
      descriptor.power = normalizePower(value.toLowerCase().includes('kw') ? value : `${value} kW`);
    }

    onSetUnitDescriptor?.(activeDeviceIndex, activeUnitRef, formatDescriptor(descriptor));
    if (screen === 'single') {
      const otherUnitRef = activeUnitRef === 'jz' ? 'jw-1' : 'jz';
      onSetUnitDescriptor?.(activeDeviceIndex, otherUnitRef, formatDescriptor(descriptor));
    }
    setPicker(null);
  }

  function renderPhotoCapture(unitRef, label) {
    const photoState = getPhotoState({ pendingPhotos, existingPhotos, deviceIndex: activeDeviceIndex, unitRef });
    return (
      <NameplatePhotoCapture
        compact
        fieldLabel={label}
        file={photoState.file}
        existingPhotoUrl={photoState.existingUrl}
        onSelect={(file) => onPhotoSelect?.(activeDeviceIndex, unitRef, file)}
        onRemove={() => onPhotoRemove?.(activeDeviceIndex, unitRef)}
      />
    );
  }

  function renderSelectorPanel() {
    return (
      <div className="mobileDeviceWizardSelectors">
        <SelectionRow kind="brand" label="Marka" value={activeDescriptor.brand} placeholder="Wybierz markę" onClick={() => setPicker({ kind: 'brand' })} />
        <SelectionRow kind="model" label="Model" value={activeDescriptor.model} placeholder={activeDescriptor.brand ? 'Wybierz model' : 'Najpierw wybierz markę'} disabled={!activeDescriptor.brand} onClick={() => setPicker({ kind: 'model' })} />
        <SelectionRow kind="power" label="Moc" value={activeDescriptor.power} placeholder="Wybierz moc" onClick={() => setPicker({ kind: 'power' })} />
      </div>
    );
  }

  if (screen === 'type') {
    return (
      <div className="mobileDeviceWizard">
        <WizardHeader title="Dodaj urządzenie" step={1} onBack={safeDevices.length > 1 || getDeviceOutdoorModel(activeDevice || {}) ? () => setScreen('overview') : null} onClose={onClose} />
        <div className="mobileDeviceWizardBody">
          <h3>Typ urządzenia</h3>
          <button type="button" className={`mobileDeviceTypeCard${selectedType === DEVICE_TYPE_SINGLE ? ' selected' : ''}`} onClick={() => setSelectedType(DEVICE_TYPE_SINGLE)}>
            <span className="mobileDeviceTypeIcon"><DeviceIcon /></span>
            <span><strong>Single</strong><small>1 JZ + 1 JW</small></span>
            <span className="mobileDeviceTypeRadio">{selectedType === DEVICE_TYPE_SINGLE ? <CheckIcon /> : null}</span>
          </button>
          <button type="button" className={`mobileDeviceTypeCard${selectedType === DEVICE_TYPE_MULTI ? ' selected' : ''}`} onClick={() => setSelectedType(DEVICE_TYPE_MULTI)}>
            <span className="mobileDeviceTypeIcon"><DeviceIcon multi /></span>
            <span><strong>Multi</strong><small>1 JZ + 2–5 JW</small></span>
            <span className="mobileDeviceTypeRadio">{selectedType === DEVICE_TYPE_MULTI ? <CheckIcon /> : null}</span>
          </button>
        </div>
        <div className="mobileDeviceWizardFooter"><button type="button" className="btn primary" onClick={() => { onChangeDeviceType?.(activeDeviceIndex, selectedType); setActiveUnitRef('jz'); setScreen(selectedType === DEVICE_TYPE_MULTI ? 'multi' : 'single'); }}>Dalej</button></div>
      </div>
    );
  }

  if (screen === 'single') {
    const outdoorPhoto = getPhotoState({ pendingPhotos, existingPhotos, deviceIndex: activeDeviceIndex, unitRef: 'jz' });
    const indoorPhoto = getPhotoState({ pendingPhotos, existingPhotos, deviceIndex: activeDeviceIndex, unitRef: 'jw-1' });
    return (
      <div className="mobileDeviceWizard">
        <WizardHeader title="Dodaj urządzenie" step={2} onBack={() => setScreen('type')} onClose={onClose} />
        <div className="mobileDeviceWizardBody">
          <div className="mobileDeviceModeChip"><DeviceIcon /> Tryb: Single</div>
          {renderSelectorPanel()}
          <div className="mobileDeviceWizardPhotoGroup">
            {renderPhotoCapture('jz', 'Jednostka zewnętrzna JZ')}
            {renderPhotoCapture('jw-1', 'Jednostka wewnętrzna JW')}
            <div className={`mobileDeviceWizardCompletion${outdoorPhoto.hasPhoto && indoorPhoto.hasPhoto ? ' ready' : ''}`}>
              {outdoorPhoto.hasPhoto && indoorPhoto.hasPhoto ? 'Komplet zdjęć dodany' : `Dodano ${(outdoorPhoto.hasPhoto ? 1 : 0) + (indoorPhoto.hasPhoto ? 1 : 0)} z 2 tabliczek`}
            </div>
          </div>
        </div>
        <div className="mobileDeviceWizardFooter"><button type="button" className="btn primary" onClick={() => setScreen('overview')}>Zapisz urządzenie</button></div>
        <PickerSheet picker={picker} descriptor={activeDescriptor} deviceType={activeDevice ? getDeviceType(activeDevice) : selectedType} unitRef={activeUnitRef} onApply={applyPicker} onClose={() => setPicker(null)} />
      </div>
    );
  }

  if (screen === 'unit' && activeDevice) {
    const unitNumber = Number(String(activeUnitRef).split('-')[1] || 0);
    const unitLabel = activeUnitRef === 'jz' ? 'Jednostka zewnętrzna JZ' : `Jednostka wewnętrzna JW${unitNumber}`;
    return (
      <div className="mobileDeviceWizard">
        <WizardHeader title={activeUnitRef === 'jz' ? 'Jednostka zewnętrzna' : `Jednostka JW${unitNumber}`} step={3} onBack={() => setScreen('multi')} onClose={onClose} />
        <div className="mobileDeviceWizardBody">
          <div className="mobileDeviceModeChip"><UnitIcon outdoor={activeUnitRef === 'jz'} /> {unitLabel}</div>
          {renderSelectorPanel()}
          <div className="mobileDeviceWizardPhotoGroup">
            {renderPhotoCapture(activeUnitRef, unitLabel)}
          </div>
        </div>
        <div className="mobileDeviceWizardFooter"><button type="button" className="btn primary" onClick={() => setScreen('multi')}>Zapisz jednostkę</button></div>
        <PickerSheet picker={picker} descriptor={activeDescriptor} deviceType={activeDevice ? getDeviceType(activeDevice) : selectedType} unitRef={activeUnitRef} onApply={applyPicker} onClose={() => setPicker(null)} />
      </div>
    );
  }

  if (screen === 'multi' && activeDevice) {
    const indoorSerials = getDeviceIndoorSerials(activeDevice, { keepEmpty: true });
    const indoorModels = getDeviceIndoorModels(activeDevice, { keepEmpty: true, minimumLength: indoorSerials.length });
    const outdoorPhoto = getPhotoState({ pendingPhotos, existingPhotos, deviceIndex: activeDeviceIndex, unitRef: 'jz' });
    return (
      <div className="mobileDeviceWizard">
        <WizardHeader title="Dodaj urządzenie" step={2} onBack={() => setScreen('type')} onClose={onClose} />
        <div className="mobileDeviceWizardBody">
          <div className="mobileDeviceModeChip"><DeviceIcon multi /> Tryb: Multi</div>
          <h3>Jednostka zewnętrzna</h3>
          <button type="button" className="mobileMultiOutdoorCard" onClick={() => openUnit('jz')}>
            <span className="mobileMultiOutdoorIcon"><UnitIcon outdoor /></span>
            <span className="mobileMultiOutdoorText"><strong>JZ</strong><small>{getDeviceOutdoorModel(activeDevice) || 'Uzupełnij markę, model i moc'}</small><em className={outdoorPhoto.hasPhoto ? 'ready' : ''}>{outdoorPhoto.hasPhoto ? 'Tabliczka dodana' : 'Brak tabliczki'}</em></span>
            <ChevronIcon />
          </button>
          <h3>Jednostki wewnętrzne</h3>
          <div className="mobileMultiIndoorList">
            {indoorSerials.map((_, indoorIndex) => {
              const unitRef = `jw-${indoorIndex + 1}`;
              const photo = getPhotoState({ pendingPhotos, existingPhotos, deviceIndex: activeDeviceIndex, unitRef });
              return (
                <button key={unitRef} type="button" className="mobileMultiIndoorCard" onClick={() => openUnit(unitRef)}>
                  <span className="mobileMultiIndoorIcon"><UnitIcon /></span>
                  <span className="mobileMultiIndoorText"><strong>JW{indoorIndex + 1}</strong><small>{indoorModels[indoorIndex] || 'Uzupełnij dane jednostki'}</small></span>
                  <span className={`mobileMultiIndoorStatus${photo.hasPhoto ? ' ready' : ''}`}>{photo.hasPhoto ? <CheckIcon /> : '!'}<small>{photo.hasPhoto ? 'Tabliczka dodana' : 'Brak tabliczki'}</small></span>
                  <ChevronIcon />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="mobileDeviceWizardSecondaryAction"
            disabled={indoorSerials.length >= MAX_INDOOR_UNITS_PER_DEVICE}
            onClick={() => {
              const nextUnitRef = `jw-${indoorSerials.length + 1}`;
              onAddIndoorUnit?.(activeDeviceIndex);
              setActiveUnitRef(nextUnitRef);
              setScreen('unit');
            }}
          >+ Dodaj JW</button>
          {indoorSerials.length > 2 ? (
            <button type="button" className="mobileDeviceWizardRemoveUnit" onClick={() => onRemoveIndoorUnit?.(activeDeviceIndex, indoorSerials.length - 1)}>Usuń ostatnią JW</button>
          ) : null}
        </div>
        <div className="mobileDeviceWizardFooter"><button type="button" className="btn primary" onClick={() => setScreen('overview')}>Zapisz urządzenie</button></div>
      </div>
    );
  }

  return (
    <div className="mobileDeviceWizard">
      <WizardHeader title="Urządzenia" step={4} onClose={onClose} />
      <div className="mobileDeviceWizardBody">
        <h3>Dodane urządzenia</h3>
        <div className="mobileDeviceOverviewList">
          {safeDevices.map((device, index) => {
            const type = getDeviceType(device);
            const completion = getDevicePhotoCompletion({ device, deviceIndex: index, pendingPhotos, existingPhotos });
            return (
              <div className="mobileDeviceOverviewCard" key={`device-overview-${index}`}>
                <button type="button" className="mobileDeviceOverviewOpen" onClick={() => openDevice(index)}>
                  <span className="mobileDeviceOverviewIcon"><DeviceIcon multi={type === DEVICE_TYPE_MULTI} /></span>
                  <span className="mobileDeviceOverviewText"><strong>Urządzenie {index + 1}</strong><small>{getDeviceSummary(device)}</small><em className={completion.complete ? 'ready' : ''}>{completion.complete ? 'Wszystkie tabliczki dodane' : `${completion.ready} z ${completion.total} tabliczek gotowe`}</em></span>
                  <span className="mobileDeviceOverviewBadge">{type === DEVICE_TYPE_MULTI ? 'Multi' : 'Single'}</span>
                  <ChevronIcon />
                </button>
                {safeDevices.length > 1 ? <button type="button" className="mobileDeviceOverviewRemove" onClick={() => onRemoveDevice?.(index)}>Usuń urządzenie</button> : null}
              </div>
            );
          })}
        </div>
        <button type="button" className="mobileDeviceWizardSecondaryAction mobileDeviceAddAnother" onClick={startAddingDevice}>+ Dodaj kolejne urządzenie</button>
      </div>
      <div className="mobileDeviceWizardFooter"><button type="button" className="btn primary" disabled={busy} onClick={onSubmit}>{busy ? 'Zapisuję…' : submitLabel}</button></div>
    </div>
  );
}
