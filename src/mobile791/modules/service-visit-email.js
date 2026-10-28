export function normalizeServiceProtocolEmail(value) {
 return String(value||'').trim().toLowerCase();
}
export function validServiceProtocolEmail(value) {
 const email=normalizeServiceProtocolEmail(value);
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254;
}
function storageKey(visitId,protocolId) {
 return 'wawis-service-email:'+visitId+':'+protocolId;
}
export async function sendServiceProtocolEmail({supabase,visit,protocol}) {
 if(!visit?.id||visit.status!=='wykonany'||!protocol?.id)throw new Error('Najpierw zakończ serwis i zapisz podpisany PDF.');
 const recipient=normalizeServiceProtocolEmail(visit.client?.email);
 if(!validServiceProtocolEmail(recipient))throw new Error('Uzupełnij prawidłowy e-mail klienta w jego danych.');
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('Do wysłania protokołu potrzebny jest internet.');
 const key=storageKey(visit.id,protocol.id);
 let attempt=null;
 try{attempt=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 // Ponowny świadomy klik po potwierdzonej wysyłce = nowy klucz; brak potwierdzenia = ten sam.
 if(!attempt||attempt.status==='sent'||attempt.recipient!==recipient||attempt.path!==protocol.storage_path){
   attempt={requestKey:crypto.randomUUID(),status:'pending',recipient,path:protocol.storage_path};
   try{localStorage.setItem(key,JSON.stringify(attempt));}catch{}
 }
 const {data,error}=await supabase.functions.invoke('send-service-visit-protocol-email',{
   body:{visitId:visit.id,protocolId:protocol.id,requestKey:attempt.requestKey,
         recipientEmail:recipient,protocolStoragePath:protocol.storage_path}
 });
 if(error){
   // Błąd sieci/dostawcy nie jest potwierdzeniem, że e-mail NIE dotarł.
   throw new Error('Wynik wysyłki jest niepewny. Nie wysyłaj kolejnego e-maila bez sprawdzenia historii.');
 }
 if(data?.status!=='sent')throw new Error(data?.error||'Nie potwierdzono wysyłki e-mail.');
 attempt.status='sent';
 try{localStorage.setItem(key,JSON.stringify(attempt));}catch{}
 return {recipient,sent:true,alreadySent:Boolean(data.alreadySent)};
}
