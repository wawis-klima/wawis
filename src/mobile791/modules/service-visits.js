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
  request = request.is('deleted_at', null);
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

export function formatServiceDate(date) {
  if (!date) return 'Brak daty';
  const parts = String(date).slice(0,10).split('-');
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : String(date);
}

export async function loadTrashedServiceVisits({supabase}) {
  const {data,error}=await supabase.from('service_visits')
    .select('id,contractor_id,scheduled_date,scheduled_time,status,deleted_at,client:contractors(company_name,city)')
    .not('deleted_at','is',null).order('deleted_at',{ascending:false}).limit(100);
  if(error)throw error;
  return data || [];
}
export async function trashAdminServiceVisit({supabase,visitId}){
  const {data,error}=await supabase.rpc('service_visit_admin_trash_v1394',{p_visit_id:visitId});
  if(error || data!==true)throw error||new Error('Nie potwierdzono przeniesienia serwisu do kosza.');
  return true;
}
export async function restoreAdminServiceVisit({supabase,visitId}){
  const {data,error}=await supabase.rpc('service_visit_admin_restore_v1394',{p_visit_id:visitId});
  if(error || data!==true)throw error||new Error('Nie potwierdzono przywrócenia serwisu.');
  return true;
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
