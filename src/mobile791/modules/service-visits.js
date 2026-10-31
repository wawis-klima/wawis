// Etap 1: odrębna ewidencja serwisów. Tylko administrator; bez zmian w SMS i montażach.
export async function searchServiceDevices({ supabase, query }) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  const { data, error } = await supabase.rpc('service_visit_admin_search', { p_query: text, p_limit: 60 });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export function groupServiceSearchResults(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.contractor_id) return;
    if (!groups.has(row.contractor_id)) {
      groups.set(row.contractor_id, {
        id: row.contractor_id,
        name: row.contractor_name || row.contractor_contact || 'Klient',
        contact: row.contractor_contact || '',
        phone: row.contractor_phone || '',
        email: row.contractor_email || '',
        city: row.contractor_city || '',
        street: row.contractor_street || '',
        devices: [],
      });
    }
    const group = groups.get(row.contractor_id);
    if (!group.devices.some((device) => device.id === row.device_id)) {
      group.devices.push({
        id: row.device_id, model: row.model, serial_number: row.serial_number,
        installation_date: row.installation_date,
      });
    }
  });
  return [...groups.values()];
}

export async function loadServiceCustomerDevices({ supabase, contractorId }) {
  const { data, error } = await supabase.from('devices')
    .select('id,model,serial_number,installation_date,status')
    .eq('contractor_id', contractorId).order('model').limit(100);
  if (error) throw error;
  return data || [];
}

export async function loadServiceStaff({ supabase }) {
  const [workers,piotr] = await Promise.all([
    supabase.from('profiles').select('id,full_name,role').eq('role','Pracownik').order('full_name'),
    supabase.from('profiles').select('id,full_name,role').eq('role','Administrator').eq('full_name','Piotr Wasik').limit(1),
  ]);
  if (workers.error) throw workers.error;
  if (piotr.error) throw piotr.error;
  const byId=new Map([...(workers.data||[]),...(piotr.data||[])].map(p=>[p.id,p]));
  return [...byId.values()].sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||''),'pl'));
}

// Główny Administrator nie przechodzi walidacji istniejącego create RPC
// (akceptuje ono wyłącznie rolę Pracownik). Przypisanie admina następuje
// bezpiecznie po utworzeniu przez aktualną politykę RLS administratora.
export function resolveServiceAssignment({ staff = [], selectedIds = [] }) {
  const ids=[...new Set(selectedIds.filter(Boolean))];
  const primaryId=ids[0] || null;
  const primary=staff.find(p=>p.id===primaryId);
  const createTechnicianId=primary?.role==='Pracownik' ? primaryId : null;
  return {
    primaryId,
    createTechnicianId,
    additionalIds:ids.slice(1),
    needsAssignmentUpdate:ids.length>1 || (primaryId!==null && createTechnicianId===null),
  };
}

export async function loadAdminServiceVisits({ supabase, contractorId = null, trashed = false }) {
  let request = supabase.from('service_visits')
    .select('id,contractor_id,scheduled_date,scheduled_time,status,notes,deleted_at,deleted_by,primary_technician_id,additional_technician_ids,performed_at,completed_at,created_at,client:contractors(id,company_name,contact_person,city,street,phone,email),items:service_visit_devices(id,device_id,device_ref_id,model_snapshot,serial_snapshot,installation_date_snapshot,result,checklist,notes,performed_at,performed_by)')
    .order('scheduled_date',{ascending:false}).limit(150);
  request = trashed ? request.not('deleted_at','is',null) : request.is('deleted_at',null);
  if (contractorId) request = request.eq('contractor_id', contractorId);
  const { data,error } = await request;
  if (error) throw error;
  return data || [];
}

export async function createAdminServiceVisit({ supabase, contractorId, deviceIds, date, time, notes, technicianId, operationId }) {
  if (!contractorId || !(Array.isArray(deviceIds) && deviceIds.length) || !date) {
    throw new Error('Wybierz klienta, urządzenie i termin przeglądu.');
  }
  const { data, error } = await supabase.rpc('service_visit_admin_create', {
    p_contractor_id: contractorId,
    p_operation_id: operationId || crypto.randomUUID(),
    p_device_ids: [...new Set(deviceIds)],
    p_scheduled_date: date,
    p_scheduled_time: time || null,
    p_notes: String(notes || '').trim().slice(0,4000),
    p_primary_technician_id: technicianId || null,
  });
  if (error) throw error;
  if (!data) throw new Error('Nie otrzymano potwierdzenia zapisu z serwera.');
  return data;
}

export async function updateAdminServiceAssignment({ supabase, visitId, technicianId, additionalTechnicianIds = [] }) {
  const otherIds = [...new Set(additionalTechnicianIds)].filter((id) => id && id !== technicianId);
  const { data,error } = await supabase.from('service_visits')
    .update({ primary_technician_id: technicianId || null, additional_technician_ids: otherIds })
    .eq('id',visitId)
    .select('id,primary_technician_id,additional_technician_ids').single();
  if (error) throw error;
  if (!data) throw new Error('Nie udało się potwierdzić zmiany przydziału.');
  return data;
}

/** 13.99: termin, uwagi i obsada w JEDNYM zapisie (wszystko albo nic).
 * Wcześniej dwa osobne UPDATE — przy błędzie drugiego zostawał nowy termin ze starą obsadą. */
export async function updateAdminServiceVisitDetails({ supabase, visitId, date, time, notes, technicianIds = [] }) {
  if (!visitId) throw new Error('Brak przeglądu do zapisania.');
  if (!date) throw new Error('Podaj termin przeglądu.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Brak internetu. Zmiany nie zostały zapisane.');
  }
  const ids = [...new Set((technicianIds || []).filter(Boolean))];
  const { data, error } = await supabase.from('service_visits')
    .update({
      scheduled_date: date,
      scheduled_time: time || null,
      notes: String(notes || '').trim().slice(0, 4000),
      primary_technician_id: ids[0] || null,
      additional_technician_ids: ids.slice(1),
    })
    .eq('id', visitId)
    .select('id,scheduled_date,scheduled_time,notes,primary_technician_id,additional_technician_ids').single();
  if (error) throw error;
  if (!data) throw new Error('Brak potwierdzenia zapisu zmian z serwera.');
  return data;
}

export function formatServiceDate(date) {
  if (!date) return 'Brak daty';
  const parts = String(date).slice(0,10).split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : String(date);
}

/** 13.97: jedna, pełna mapa statusów — wcześniej „w_trakcie” i „oczekuje_na_podpis”
 * były błędnie pokazywane jako „Przydzielony” / „bez przydziału”. */
export function serviceVisitStatusLabel(visit) {
  switch (visit?.status) {
    case 'wykonany': return 'Wykonany';
    case 'odwolany': return 'Odwołany';
    case 'w_trakcie': return 'W trakcie';
    case 'oczekuje_na_podpis': return 'Oczekuje na podpis klienta';
    case 'zaplanowany': return visit?.primary_technician_id ? 'Przydzielony' : 'Zaplanowany, bez przydziału';
    default: return visit?.status ? String(visit.status) : 'Nieznany status';
  }
}

/** Data dzienna znacznika czasu (timestamptz) w strefie Europe/Warsaw, DD.MM.RRRR. */
export function formatServiceTimestampDate(value) {
  if (!value) return 'Brak daty';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return formatServiceDate(value);
  return new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}

function warsawDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
}

/** 14.04: lista „Wykonane” — zakończone przeglądy spoza Kosza, najnowsze najpierw (data zakończenia). */
export function completedServiceVisits(visits = []) {
  const key = v => String(v?.completed_at || v?.performed_at || v?.scheduled_date || '');
  return (visits || []).filter(v => v?.status === 'wykonany' && !v?.deleted_at)
    .sort((a, b) => key(b).localeCompare(key(a)));
}
export function completedServiceVisitSummary(visit) {
  const items = visit?.items || [];
  const defects = items.filter(i => i?.result === 'usterka').length;
  const checked = items.filter(i => i?.result).length;
  const devices = items.length === 1 ? '1 urządzenie' : items.length + ' urządzeń';
  const outcome = defects ? (defects === 1 ? '1 usterka' : defects + ' usterek')
    : checked ? 'wszystko sprawne' : 'bez wyników';
  return {
    dateLabel: visit?.completed_at ? 'Wykonano ' + formatServiceTimestampDate(visit.completed_at) : 'Termin ' + formatServiceDate(visit?.scheduled_date),
    detailLabel: devices + ' · ' + outcome,
    hasDefects: defects > 0,
  };
}

/** Historia pojedynczego urządzenia z już pobranych wizyt klienta (bez dodatkowego zapytania).
 * Klucz: device_ref_id — przetrwa przebudowę rekordu devices przez synchronizator montaży. */
export function buildServiceDeviceHistory({ visits = [], deviceId, nameOf = () => '' }) {
  if (!deviceId) return [];
  const rows = [];
  for (const visit of visits || []) {
    for (const item of visit?.items || []) {
      if (item?.device_ref_id !== deviceId && item?.device_id !== deviceId) continue;
      rows.push({
        visitId: visit.id,
        scheduledDate: visit.scheduled_date || null,
        performedAt: item.performed_at || null,
        dateLabel: item.performed_at ? 'Wykonano '+formatServiceTimestampDate(item.performed_at) : 'Termin '+formatServiceDate(visit.scheduled_date),
        status: visit.status,
        statusLabel: serviceVisitStatusLabel(visit),
        result: item.result || null,
        resultLabel: item.result === 'sprawne' ? 'Sprawne' : item.result === 'usterka' ? 'Usterka' : null,
        performedBy: item.result && item.performed_by ? (nameOf(item.performed_by) || 'Inny użytkownik') : null,
        notes: item.notes || '',
      });
    }
  }
  const key = row => String(row.performedAt || row.scheduledDate || '');
  return rows.sort((a,b) => key(b).localeCompare(key(a)));
}

/** Zbiorcza, tylko do odczytu historia jednej wizyty: termin/status, przydział, wysyłki e-mail.
 * Każde źródło jest niezależne — błąd jednego nie ukrywa pozostałych i jest raportowany. */
export async function loadServiceVisitHistory({ supabase, visitId, nameOf = () => '' }) {
  if (!visitId) return { entries: [], failed: [] };
  const name = id => (id ? (nameOf(id) || 'Inny użytkownik') : 'Bez przydziału');
  const [changes, assignments, emails] = await Promise.all([
    supabase.from('service_visit_change_events')
      .select('id,changed_at,changed_by,old_scheduled_date,new_scheduled_date,old_scheduled_time,new_scheduled_time,old_status,new_status,old_notes,new_notes')
      .eq('service_visit_id', visitId).order('changed_at', { ascending: false }).limit(100),
    supabase.from('service_visit_assignment_events')
      .select('id,changed_at,changed_by,old_primary_technician_id,new_primary_technician_id,old_additional_technician_ids,new_additional_technician_ids')
      .eq('service_visit_id', visitId).order('changed_at', { ascending: false }).limit(100),
    supabase.from('service_visit_protocol_email_log')
      .select('id,created_at,sent_at,recipient_email,status,error_message,sent_by')
      .eq('service_visit_id', visitId).order('created_at', { ascending: false }).limit(50),
  ]);
  const failed = [];
  const entries = [];
  if (changes.error) failed.push('terminy i statusy');
  for (const e of changes.data || []) {
    const parts = [];
    if (e.old_scheduled_date !== e.new_scheduled_date || (e.old_scheduled_time || '') !== (e.new_scheduled_time || '')) {
      parts.push(`Termin: ${formatServiceDate(e.old_scheduled_date)} ${String(e.old_scheduled_time || '').slice(0,5)} → ${formatServiceDate(e.new_scheduled_date)} ${String(e.new_scheduled_time || '').slice(0,5)}`.replace(/\s+/g,' ').trim());
    }
    if (e.old_status !== e.new_status) {
      parts.push(`Status: ${serviceVisitStatusLabel({status:e.old_status})} → ${serviceVisitStatusLabel({status:e.new_status})}`);
    }
    if ((e.old_notes || '') !== (e.new_notes || '')) parts.push('Zmieniono uwagi');
    if (parts.length) entries.push({ id: 'c'+e.id, at: e.changed_at, kind: 'change', text: parts.join(' · '), by: e.changed_by ? name(e.changed_by) : '' });
  }
  if (assignments.error) failed.push('przydziały');
  for (const e of assignments.data || []) {
    const team = (primary, extra) => [primary, ...(extra || [])].filter(Boolean).map(name).join(', ') || 'Bez przydziału';
    entries.push({ id: 'a'+e.id, at: e.changed_at, kind: 'assignment',
      text: `Przydział: ${team(e.old_primary_technician_id, e.old_additional_technician_ids)} → ${team(e.new_primary_technician_id, e.new_additional_technician_ids)}`,
      by: e.changed_by ? name(e.changed_by) : '' });
  }
  if (emails.error) failed.push('wysyłki e-mail');
  for (const e of emails.data || []) {
    const state = e.status === 'sent' ? 'wysłano' : e.status === 'error' ? 'odrzucono' : 'wynik nieustalony';
    entries.push({ id: 'e'+e.id, at: e.sent_at || e.created_at, kind: 'email', emailStatus: e.status,
      text: `E-mail z protokołem do ${e.recipient_email}: ${state}`, by: e.sent_by ? name(e.sent_by) : '' });
  }
  entries.sort((a,b) => String(b.at || '').localeCompare(String(a.at || '')));
  return { entries: entries.map(e => ({ ...e, atLabel: warsawDateTime(e.at) })), failed };
}

/** Only the server-side administrator RPC can archive or restore visits. */
export async function trashAdminServiceVisit({supabase,visitId}) {
  const {data,error}=await supabase.rpc('service_visit_admin_trash',{p_visit_id:visitId});
  if(error || data!==true)throw error || new Error('Nie potwierdzono przeniesienia do kosza.');
  return true;
}
export async function restoreAdminServiceVisit({supabase,visitId}) {
  const {data,error}=await supabase.rpc('service_visit_admin_restore',{p_visit_id:visitId});
  if(error || data!==true)throw error || new Error('Nie potwierdzono przywrócenia serwisu.');
  return true;
}

/** Hard delete is never performed directly by the browser. Edge validates JWT,
 * administrator role, trash state and the exact Storage file prefix. */
export async function purgeAdminServiceVisit({supabase,visitId}) {
  if(!visitId)throw new Error('Brak przeglądu do usunięcia.');
  const {data:session,error:authError}=await supabase.auth.getSession();
  if(authError||!session?.session?.access_token)throw new Error('Zaloguj się ponownie przed trwałym usunięciem.');
  const {data,error}=await supabase.functions.invoke('purge-service-visit',{
    body:{visitId,confirmation:'PERMANENT_DELETE'}
  });
  if(error){
    let message=error.message||'Nie udało się usunąć serwisu.';
    try {const result=await error.context?.json();if(result?.error)message=result.error;}catch(_){}
    throw new Error(message);
  }
  if(data?.ok!==true||data?.deleted!==true)throw new Error(data?.error||'Serwer nie potwierdził trwałego usunięcia.');
  return true;
}
