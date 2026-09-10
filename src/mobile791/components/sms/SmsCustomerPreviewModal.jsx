import React from 'react';
import { buildReminderMessage, formatSmsDate } from '../../modules/sms.js';

export default function SmsCustomerPreviewModal({ job, settings, onClose, onSendNow, sendBusy }) {
  if (!job) return null;

  const customerName = job.client || job.title || '-';
  const smsText = buildReminderMessage(job, settings);

  return (
    <div className="modalOverlay" role="presentation" onClick={onClose}>
      <div className="modalCard smsCustomerPreviewModal" role="dialog" aria-modal="true" aria-label={`Podgląd SMS dla ${customerName}`} onClick={(event) => event.stopPropagation()}>
        <div className="modalHead">
          <div>
            <div className="sectionPill">Podgląd przed wysyłką</div>
            <h3>Klient: {customerName}</h3>
          </div>
          <button type="button" className="btn secondary" onClick={onClose}>Zamknij</button>
        </div>

        <div className="smsPreviewMetaGrid">
          <div className="smsPreviewMetaItem">
            <span>Telefon SMS</span>
            <strong>{job.sms_recipient_phone || job.phone || '-'}</strong>
          </div>
          <div className="smsPreviewMetaItem">
            <span>Termin przeglądu</span>
            <strong>{formatSmsDate(job.service_due_date)}</strong>
          </div>
          <div className="smsPreviewMetaItem">
            <span>Data montażu</span>
            <strong>{formatSmsDate(job.installation_date)}</strong>
          </div>
          <div className="smsPreviewMetaItem">
            <span>Status</span>
            <strong>{job.rowStatus || '-'}</strong>
          </div>
        </div>

        <div className="smsPreviewMessageCard">
          <div className="smsPreviewMessageLabel">Treść wiadomości</div>
          <p>{smsText}</p>
        </div>

        <div className="smsPreviewActionsRow">
          <button type="button" className="btn secondary smsActionBtn" onClick={onClose}>Anuluj</button>
          <button type="button" className="btn premiumActionBtn smsActionBtn" disabled={sendBusy} onClick={() => onSendNow(job)}>
            {sendBusy ? 'Wysyłanie...' : 'Wyślij'}
          </button>
        </div>
      </div>
    </div>
  );
}
