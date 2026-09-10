import React from 'react';
import { formatSmsDate } from '../../modules/sms.js';

function renderValue(value) {
  const normalized = String(value || '').trim();
  return normalized || '—';
}

const DETAIL_ROWS = [
  ['Klient', (client) => client.client || client.contractor_name || client.title],
  ['Telefon SMS', (client) => client.sms_recipient_phone || client.phone],
  ['E-mail', (client) => client.email || client.contractor_email],
  ['Miasto', (client) => client.city || client.contractor_city],
  ['Ulica', (client) => client.street],
  ['Model urządzenia', (client) => client.model],
  ['Numer seryjny', (client) => client.serial_number],
  ['Data montażu', (client) => formatSmsDate(client.installation_date)],
  ['Termin przeglądu', (client) => formatSmsDate(client.service_due_date || client.reminder_due_date)],
  ['Źródło', (client) => (client.target_type === 'device' ? 'Urządzenie' : 'Montaż')],
];

export default function SmsClientDetailsCard({ client, onClose, onOpenJob, onOpenContractor }) {
  if (!client) return null;

  const clientName = client.client || client.contractor_name || client.title || 'Klient';
  const hasJobLink = Boolean(client?.source_job_id || client?.job_id);
  const hasContractorLink = Boolean(client?.contractor_id);

  return (
    <div className="smsCard smsClientDetailsCard">
      <div className="smsCardHeader smsCardHeaderStack smsClientDetailsHeader">
        <div>
          <h3>Dane klienta</h3>
          <div className="muted smsClientDetailsSubtitle">{clientName}</div>
        </div>
        <div className="smsClientDetailsActions">
          <button type="button" className="btn secondary" onClick={() => onOpenJob?.(client)} disabled={!hasJobLink}>
            Przejdź do montażu
          </button>
          <button type="button" className="btn secondary" onClick={() => onOpenContractor?.(client)} disabled={!hasContractorLink}>
            Przejdź do kontrahenta
          </button>
          <button type="button" className="btn secondary smsClientDetailsCloseBtn" onClick={onClose}>
            Zamknij podgląd
          </button>
        </div>
      </div>

      <div className="tableWrap smsClientDetailsTableWrap">
        <table className="jobTable smsClientDetailsTable">
          <tbody>
            {DETAIL_ROWS.map(([label, getter]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{renderValue(getter(client))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
