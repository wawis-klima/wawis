export const SERVICE_VISIT_CHECKS = Object.freeze([
  { key:'filtry', label:'Kontrola i czyszczenie filtrów' },
  { key:'jednostka_wewnetrzna', label:'Czyszczenie jednostki wewnętrznej' },
  { key:'skropliny', label:'Kontrola odpływu skroplin' },
  { key:'jednostka_zewnetrzna', label:'Kontrola jednostki zewnętrznej' },
  { key:'dzialanie', label:'Sprawdzenie działania klimatyzacji' },
  { key:'instalacja', label:'Kontrola instalacji i połączeń' },
]);
export const EMPTY_SERVICE_CHECKLIST = Object.freeze(
  Object.fromEntries(SERVICE_VISIT_CHECKS.map(({key})=>[key,false]))
);
export function normalizeServiceChecklist(value) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(SERVICE_VISIT_CHECKS.map(({key})=>[key,src[key]===true]));
}
export function makeServiceProtocolSnapshot(visit) {
  if (!visit?.id || !Array.isArray(visit.items)) throw new Error('Brak danych wizyty serwisowej.');
  const items = visit.items.map(item=>({
    id: item.id,
    device_ref_id:item.device_ref_id,
    model: item.model_snapshot || '',
    serial: item.serial_snapshot || '',
    result: item.result || null,
    checklist:item.checklist || {},
    notes:item.notes || '',
    performed_at:item.performed_at || null,
  }));
  if (!items.some(item=>item.result)) throw new Error('Zapisz wynik przynajmniej jednego urządzenia.');
  if (items.some(item=>item.result && !['sprawne','usterka'].includes(item.result))) {
    throw new Error('Nieprawidłowy wynik urządzenia.');
  }
  return {
    visit_id:visit.id,
    client:visit.client?.company_name || visit.client?.contact_person || 'Klient',
    phone:visit.client?.phone || '',
    email:visit.client?.email || '',
    address:[visit.client?.street,visit.client?.city].filter(Boolean).join(', '),
    scheduled_date:visit.scheduled_date || null,
    signed_at:new Date().toISOString(),
    performed_by:visit.primary_technician_id || null,
    additional_technicians:visit.additional_technician_ids || [],
    items,
  };
}
export function validateServiceResult(item, photoCount) {
  if (!['sprawne','usterka'].includes(item?.result)) throw new Error('Wybierz wynik przeglądu urządzenia.');
  if (item.result==='usterka' && !(Number(photoCount)>0)) {
    throw new Error('Przy usterce dodaj i zapisz w systemie co najmniej jedno zdjęcie.');
  }
  return true;
}
