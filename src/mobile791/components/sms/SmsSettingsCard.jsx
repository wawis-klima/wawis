import React from 'react';

export default function SmsSettingsCard({ settings, setSettings, onSave, saveBusy, isAdmin }) {
  function updateField(field, value) {
    setSettings((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="smsCard">
      <div className="smsCardHeader">
        <div>
          <h3>Ustawienia modułu SMS</h3>
          <p>Tu ustawiasz tylko dane nadawcy, numer serwisowy i treść szablonu. Wysyłka pozostaje wyłącznie ręczna.</p>
        </div>
      </div>

      <label className="inputLabel smsToggleRow">
        <span>Moduł aktywny</span>
        <input
          type="checkbox"
          checked={!!settings.is_enabled}
          disabled={!isAdmin}
          onChange={(event) => updateField('is_enabled', event.target.checked)}
        />
      </label>

      <input className="input" placeholder="Nazwa nadawcy" value={settings.sender_name || ''} disabled={!isAdmin} onChange={(event) => updateField('sender_name', event.target.value)} />
      <input className="input" placeholder="Telefon serwisowy" value={settings.service_phone || ''} disabled={!isAdmin} onChange={(event) => updateField('service_phone', event.target.value)} />
      <input className="input" placeholder="Nazwa firmy" value={settings.company_name || ''} disabled={!isAdmin} onChange={(event) => updateField('company_name', event.target.value)} />
      <textarea className="input textarea" rows={7} placeholder="Treść przypomnienia SMS" value={settings.template_service_reminder || ''} disabled={!isAdmin} onChange={(event) => updateField('template_service_reminder', event.target.value)} />

      <button type="button" className="btn primary smsSettingsSaveBtn" disabled={!isAdmin || saveBusy} onClick={onSave}>
        {saveBusy ? 'Zapisywanie...' : 'Zapisz ustawienia'}
      </button>
    </div>
  );
}
