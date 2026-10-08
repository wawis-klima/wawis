// The reminder_cycle value is based on the installation schedule (11, 23, 35... months),
// not the number of SMS send attempts. Retry of the same cycle must not increment it.
function normalizeCycle(value) {
  if (value == null || String(value).trim() === '') return null;
  const cycle = Number(value);
  return Number.isSafeInteger(cycle) && cycle > 0 && cycle <= 100 ? cycle : null;
}

export function getSmsReminderCycleLabel(row = {}) {
  const grouped = Array.isArray(row.grouped_sms_rows) && row.grouped_sms_rows.length
    ? row.grouped_sms_rows
    : null;
  const cycles = grouped
    ? [...new Set(grouped.map((entry) => normalizeCycle(entry?.reminder_cycle)).filter(Boolean))].sort((a, b) => a - b)
    : [normalizeCycle(row.reminder_cycle)].filter(Boolean);

  if (!cycles.length) return '';
  if (cycles.length > 1) return `Cykle przypomnień: ${cycles.map((cycle) => `${cycle}.`).join(', ')}`;
  return `${cycles[0]}. cykl przypomnienia`;
}
