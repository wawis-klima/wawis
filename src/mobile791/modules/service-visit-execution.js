import { makeServiceProtocolSnapshot, validateServiceResult } from './service-visit-checklist.js';

export const SERVICE_FILES_BUCKET = 'service-visit-files';

export async function loadServiceVisitExecution({ supabase, visitId }) {
  const {data,error}=await supabase.from('service_visits')
    .select('id,contractor_id,scheduled_date,scheduled_time,status,notes,primary_technician_id,additional_technician_ids,performed_at,completed_at,client:contractors(id,company_name,contact_person,city,street,phone,email),items:service_visit_devices(id,device_id,device_ref_id,model_snapshot,serial_snapshot,installation_date_snapshot,result,checklist,notes,performed_at)')
    .eq('id',visitId).single();
  if(error) throw error;
  return data;
}
export async function loadServiceVisitPhotos({supabase,items}) {
  if(!items?.length) return [];
  const {data,error}=await supabase.from('service_visit_photos')
    .select('id,service_visit_device_id,storage_path,file_size_bytes,created_at')
    .in('service_visit_device_id',items.map(i=>i.id)).order('created_at',{ascending:true});
  if(error) throw error;
  return data || [];
}
export async function saveServiceDeviceResult({supabase,visitId,itemId,checklist,result,notes}) {
  if(typeof navigator!=='undefined' && navigator.onLine===false) throw new Error('Brak internetu. Wynik nie został jeszcze zapisany w systemie.');
  const {data,error}=await supabase.rpc('service_visit_admin_save_item',{
    p_visit_id:visitId,p_item_id:itemId,p_checklist:checklist,
    p_result:result || null,p_notes:String(notes||''),
  });
  if(error) throw error;
  if(data!==true) throw new Error('Nie potwierdzono zapisu wyniku na serwerze.');
  return true;
}
function extensionForMime(type) {
  return type==='image/jpeg'?'jpg':type==='image/png'?'png':type==='image/webp'?'webp':null;
}
export async function uploadServiceVisitPhoto({supabase,visitId,itemId,file}) {
  const extension=extensionForMime(file?.type);
  if(!extension) throw new Error('Wybierz zdjęcie JPEG, PNG lub WEBP. Pliki HEIC należy najpierw zapisać jako JPEG.');
  if(!file.size || file.size>10485760) throw new Error('Zdjęcie musi mieć od 1 B do 10 MB.');
  if(typeof navigator!=='undefined' && navigator.onLine===false) throw new Error('Do przesłania zdjęcia potrzebny jest internet.');
  const storage_path=`${visitId}/photos/${itemId}/${crypto.randomUUID()}.${extension}`;
  const {error:uploadError}=await supabase.storage.from(SERVICE_FILES_BUCKET)
    .upload(storage_path,file,{contentType:file.type,upsert:false});
  if(uploadError) throw uploadError;
  const {data,error}=await supabase.from('service_visit_photos')
    .insert({service_visit_device_id:itemId,storage_path,file_size_bytes:file.size,mime_type:file.type})
    .select('id,service_visit_device_id,storage_path,file_size_bytes,created_at').single();
  if(error) throw new Error('Zdjęcie przesłano, ale nie potwierdzono wpisu w historii. Nie próbuj go usuwać: '+error.message);
  return data;
}
export async function loadStoredServiceProtocol({supabase,visitId}) {
  const {data,error}=await supabase.from('service_visit_protocols')
    .select('id,service_visit_id,storage_path,signature_path,file_name,file_size_bytes,signed_at,created_at,signed_snapshot')
    .eq('service_visit_id',visitId).maybeSingle();
  if(error) throw error;
  return data || null;
}
function signaturePngBytes(dataUrl) {
  if(typeof dataUrl!=='string'||!/^data:image\/png;base64,/.test(dataUrl))throw new Error('Brakuje podpisu klienta.');
  const bin=atob(dataUrl.split(',')[1]);
  const buffer=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)buffer[i]=bin.charCodeAt(i);
  if(buffer.length===0 || buffer.length>2000000) throw new Error('Nieprawidłowy rozmiar podpisu.');
  return buffer;
}
export async function finalizeSignedServiceVisit({supabase,visitId,signatureDataUrl,technicianNames=[]}) {
  if(typeof navigator!=='undefined' && navigator.onLine===false)throw new Error('Brak internetu. Podpisany protokół nie zostanie oznaczony jako zakończony.');
  const existing=await loadStoredServiceProtocol({supabase,visitId});
  if(existing)return existing;
  const visit=await loadServiceVisitExecution({supabase,visitId});
  if(visit.status==='odwolany'||visit.status==='wykonany')throw new Error('Nie można zakończyć tej wizyty.');
  const photos=await loadServiceVisitPhotos({supabase,items:visit.items});
  visit.items.forEach(item=>{
    if(item.result)validateServiceResult(item,photos.filter(p=>p.service_visit_device_id===item.id).length);
  });
  const snapshot=makeServiceProtocolSnapshot(visit);
  const {createServiceVisitPdf}=await import('./service-visit-pdf.js');
  const {orientSignatureForPdf}=await import('./protocol-signature-orientation.js');
  const oriented=await orientSignatureForPdf(signatureDataUrl,'auto');
  const {pdfBlob,fileName}=await createServiceVisitPdf({snapshot,signatureDataUrl:oriented,technicianNames});
  if(!(pdfBlob instanceof Blob)||pdfBlob.size===0)throw new Error('Nie udało się utworzyć pliku PDF.');
  if(pdfBlob.size>10485760)throw new Error('Protokół PDF przekracza limit 10 MB.');
  const token=crypto.randomUUID();
  const signature_path=`${visitId}/signatures/${token}.png`;
  const pdf_path=`${visitId}/pdf/${token}.pdf`;
  // Pliki muszą być rzeczywiście zapisane przed finalizacją w Postgres.
  const {error:signError}=await supabase.storage.from(SERVICE_FILES_BUCKET)
    .upload(signature_path,signaturePngBytes(signatureDataUrl),{contentType:'image/png',upsert:false});
  if(signError)throw signError;
  const {error:pdfError}=await supabase.storage.from(SERVICE_FILES_BUCKET)
    .upload(pdf_path,pdfBlob,{contentType:'application/pdf',upsert:false});
  if(pdfError)throw pdfError;
  try {
    const {data,error}=await supabase.rpc('service_visit_admin_complete',{
      p_visit_id:visitId,p_pdf_path:pdf_path,p_signature_path:signature_path,
      p_file_name:fileName,p_pdf_size:pdfBlob.size,p_snapshot:snapshot,
    });
    if(error)throw error;
    if(!data)throw new Error('Brak potwierdzenia zamknięcia wizyty.');
  }catch(error){
    // Niejednoznaczny błąd sieci może ukrywać udany COMMIT: sprawdź stan serwera.
    const reconciled=await loadStoredServiceProtocol({supabase,visitId}).catch(()=>null);
    if(reconciled?.storage_path===pdf_path)return reconciled;
    throw error;
  }
  const record=await loadStoredServiceProtocol({supabase,visitId});
  if(!record || record.storage_path!==pdf_path)throw new Error('Nie potwierdzono ostatecznego zapisu podpisanego protokołu.');
  return record;
}
export async function getServiceProtocolPdfBlob({supabase,record}) {
  if(!record?.storage_path)throw new Error('Brak podpisanego protokołu.');
  const {data,error}=await supabase.storage.from(SERVICE_FILES_BUCKET).download(record.storage_path);
  if(error)throw error;
  if(!data?.size)throw new Error('Zapisany PDF jest pusty.');
  return data;
}
export async function openServiceProtocolPdf({supabase,record}) {
  const popup=window.open('','_blank');
  if(!popup)throw new Error('Zezwól aplikacji na otwieranie podglądu PDF.');
  popup.opener=null;
  try {
    const {data,error}=await supabase.storage.from(SERVICE_FILES_BUCKET)
      .createSignedUrl(record.storage_path,180);
    if(error||!data?.signedUrl)throw error||new Error('Nie udało się otworzyć PDF.');
    popup.location.replace(data.signedUrl);
  }catch(err){popup.close();throw err;}
}
export async function printServiceProtocol({supabase,record}) {
  const blob=await getServiceProtocolPdfBlob({supabase,record});
  if(typeof navigator!=='undefined' && navigator.share){
    const {createProtocolPrintImage}=await import('./job-protocol-storage.js');
    const image=await createProtocolPrintImage(blob,record.file_name);
    if(navigator.canShare?.({files:[image]})){
      await navigator.share({files:[image],title:'Protokół WAWIS'});
      return;
    }
  }
  if(typeof window==='undefined')throw new Error('Drukuj protokół na urządzeniu z przeglądarką.');
  const url=URL.createObjectURL(blob);
  const popup=window.open(url,'_blank');
  if(!popup){URL.revokeObjectURL(url);throw new Error('Zezwól na otwieranie okien do wydruku.');}
  window.setTimeout(()=>URL.revokeObjectURL(url),300000);
}
