import React from 'react';
import './collapsible-card.css';

// WAWIS 14.77 — Diagnostyka: działy zwijane (decyzja właściciela 22.11.2026). Domyślnie zwinięte; w nagłówku
// tytuł i krótki stan, żeby bez rozwijania było widać, czy coś wymaga uwagi.
export default function CollapsibleCard({
  title, status = '', statusTone = '', statusTestId, defaultOpen = false, variant = 'desktop', testId, children,
}) {
  const mobile = variant === 'mobile';
  const cardClass = mobile ? 'mobileDiagnosticsCard collapsibleCard' : 'diagnosticsEventsCard collapsibleCard';
  const toneClass = statusTone === 'ok'
    ? (mobile ? 'isOk' : 'diagnosticsOk')
    : statusTone === 'warn' ? (mobile ? 'isWarn' : 'diagnosticsError') : '';
  return (
    <details className={cardClass} data-testid={testId} open={defaultOpen || undefined}>
      <summary className="collapsibleCardSummary" data-testid={testId ? `${testId}-toggle` : undefined}>
        <h2>{title}</h2>
        {status ? <span className={`collapsibleCardStatus ${toneClass}`.trim()} data-testid={statusTestId || (testId ? `${testId}-status` : undefined)}>{status}</span> : null}
      </summary>
      <div className="collapsibleCardBody">{children}</div>
    </details>
  );
}
