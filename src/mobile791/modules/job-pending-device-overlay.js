// Odświeżenie z Supabase nie może wymazać urządzenia zapisanego trwale w
// kolejce IndexedDB, dopóki jego zależności (JW/JZ) nie uzyskają ACK serwera.
// Nie nakładamy lokalnego modelu na niezależną zmianę danych na serwerze.
const normalized = (value) => String(value ?? '').trim();
export function overlayPendingDeviceOperation(job, operations = []) {
  if (!job?.id || !Array.isArray(operations)) return job;
  const operation = [...operations].reverse().find((item) => (
    String(item?.job_id || '') === String(job.id)
    && item?.type === 'device'
    && !['conflict', 'synced', 'completed'].includes(String(item?.status || '').toLowerCase())
    && item?.payload?.device_fields
  ));
  if (!operation) return job;

  const desired = operation.payload.device_fields;
  const base = operation.base || {};
  const sameAsBase = normalized(job.device_model) === normalized(base.device_model)
    && normalized(job.device_serial_number) === normalized(base.device_serial_number);
  const sameAsDesired = normalized(job.device_model) === normalized(desired.device_model)
    && normalized(job.device_serial_number) === normalized(desired.device_serial_number);
  // Ochrona CAS: jeżeli serwer nie ma wartości bazowej ani docelowej, nie
  // przesłaniamy serwera optymistycznym stanem w przypadku konfliktu.
  if (!sameAsBase && !sameAsDesired) return job;
  return {
    ...job,
    device_model: desired.device_model || null,
    device_serial_number: desired.device_serial_number || null,
    offline_pending: true,
  };
}
