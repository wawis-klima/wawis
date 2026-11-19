import React from 'react';
import { formatSmsDate } from '../../modules/sms.js';

function renderValue(value) {
  const normalized = String(value || '').trim();
  return normalized || '—';
}

const DEVICE_ROWS = [
  ['Model urządzenia', (device) => device.model],
  ['Numer seryjny', (device) => device.serial_number],
  ['Klient', (device) => device.client || device.contractor_name || device.title],
  ['Adres', (device) => device.addressLine || [device.street, device.city].filter(Boolean).join(', ')],
  ['Telefon', (device) => device.sms_recipient_phone || device.phone],
  ['E-mail', (device) => device.email || device.contractor_email],
  ['Data montażu', (device) => formatSmsDate(device.installation_date)],
  ['Termin przeglądu', (device) => formatSmsDate(device.service_due_date || device.reminder_due_date)],
  ['Źródło', (device) => (device.target_type === 'device' ? 'Katalog urządzeń' : 'Montaż')],
];

export default function SmsDeviceDetailsCard({ device, onClose, onOpenJob, onOpenContractor }) {
  const [message, setMessage] = React.useState('');
  React.useEffect(() => { setMessage(''); }, [device]);
  if (!device) return null;
  // 14.47: te same przejścia co w „Dane klienta”.
  const hasJobLink = Boolean(device?.source_job_id || device?.job_id);
  const hasContractorLink = Boolean(device?.contractor_id);

  return (
    <div className="smsCard smsClientDetailsCard smsDeviceDetailsCard">
      <div className="smsCardHeader smsCardHeaderStack smsClientDetailsHeader">
        <div>
          <h3>Dane urządzenia</h3>
          <div className="muted smsClientDetailsSubtitle">{renderValue(device.serial_number)} · {renderValue(device.model)}</div>
        </div>
        <div className="smsClientDetailsActions">
          {onOpenJob ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() => { if (onOpenJob(device) === false) setMessage('Nie znaleziono tego montażu na liście montaży.'); }}
              disabled={!hasJobLink}
              title={hasJobLink ? undefined : 'To urządzenie nie ma montażu w WAWIS (np. import starej bazy).'}
            >
              Przejdź do montażu
            </button>
          ) : null}
          {onOpenContractor ? (
            <button type="button" className="btn secondary" onClick={() => onOpenContractor(device)} disabled={!hasContractorLink} title={hasContractorLink ? undefined : 'Brak powiązanego kontrahenta.'}>
              Przejdź do kontrahenta
            </button>
          ) : null}
          <button type="button" className="btn secondary smsClientDetailsCloseBtn" onClick={onClose}>
            Zamknij podgląd
          </button>
        </div>
      </div>

      {message ? <div className="muted smsClientDetailsMessage" role="status">{message}</div> : null}

      <div className="tableWrap smsClientDetailsTableWrap">
        <table className="jobTable smsClientDetailsTable">
          <tbody>
            {DEVICE_ROWS.map(([label, getter]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{renderValue(getter(device))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
