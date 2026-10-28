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
  const { data, error } = await supabase.from('profiles')
    .select('id,full_name,role').eq('role','Pracownik').order('full_name');
  if (error) throw error;
  return data || [];
}

export async function loadAdminServiceVisits({ supabase, contractorId = null }) {
  let request = supabase.from('service_visits')
    .select('id,contractor_id,scheduled_date,scheduled_time,status,notes,primary_technician_id,additional_technician_ids,performed_at,completed_at,created_at,client:contractors(id,company_name,contact_person,city,street,phone,email),items:service_visit_devices(id,device_id,device_ref_id,model_snapshot,serial_snapshot,installation_date_snapshot,result,checklist,notes,performed_at,performed_by)')
    .order('scheduled_date',{ascending:false}).limit(150);
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
