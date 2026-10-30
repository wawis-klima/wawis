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
function readAttempt(key){
 try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}
}
function clearAttempt(key){
 try{localStorage.removeItem(key);}catch{}
}
/** Poprzednia próba bez potwierdzenia — klient MÓGŁ otrzymać e-mail. */
export function hasUncertainServiceEmailAttempt({visitId,protocolId}){
 const attempt=readAttempt(storageKey(visitId,protocolId));
 return Boolean(attempt && attempt.status==='pending');
}
async function readFunctionError(error){
 // supabase-js: FunctionsHttpError ma odpowiedź w error.context; błąd sieci/relay — nie ma.
 const status=Number(error?.context?.status)||0;
 let body=null;
 try{body=await error?.context?.json?.();}catch{}
 return {status,body:body&&typeof body==='object'?body:null};
}
export async function sendServiceProtocolEmail({supabase,visit,protocol,forceNewAttempt=false}) {
 if(!visit?.id||visit.status!=='wykonany'||!protocol?.id)throw new Error('Najpierw zakończ serwis i zapisz podpisany PDF.');
 const recipient=normalizeServiceProtocolEmail(visit.client?.email);
 if(!validServiceProtocolEmail(recipient))throw new Error('Uzupełnij prawidłowy e-mail klienta w jego danych.');
 if(typeof navigator!=='undefined'&&navigator.onLine===false)throw new Error('Do wysłania protokołu potrzebny jest internet.');
 const key=storageKey(visit.id,protocol.id);
 let attempt=readAttempt(key);
 // Ponowny świadomy klik po potwierdzonej wysyłce = nowy klucz; brak potwierdzenia = ten sam.
 // forceNewAttempt: wyłącznie po wyraźnym potwierdzeniu administratora, że świadomie ponawia
 // wysyłkę o nieustalonym wyniku (bez tego serwer zwracał 409 dla starego klucza bez końca).
 if(forceNewAttempt||!attempt||attempt.status==='sent'||attempt.recipient!==recipient||attempt.path!==protocol.storage_path){
   attempt={requestKey:crypto.randomUUID(),status:'pending',recipient,path:protocol.storage_path};
   try{localStorage.setItem(key,JSON.stringify(attempt));}catch{}
 }
 const {data,error}=await supabase.functions.invoke('send-service-visit-protocol-email',{
   body:{visitId:visit.id,protocolId:protocol.id,requestKey:attempt.requestKey,
         recipientEmail:recipient,protocolStoragePath:protocol.storage_path}
 });
 if(error){
   const {status,body}=await readFunctionError(error);
   // Jednoznaczna odmowa serwera (walidacja, uprawnienia, odrzucenie przez dostawcę):
   // e-mail na pewno nie wyszedł z tym kluczem — kolejna próba może użyć nowego.
   if(status>=400&&status<500&&status!==409&&status!==429&&body&&!body.pending){
     clearAttempt(key);
     throw new Error(body.error||'Serwer odrzucił wysyłkę protokołu.');
   }
   // Błąd sieci, dostawcy lub nieustalony stan nie jest potwierdzeniem, że e-mail NIE dotarł.
   const uncertain=new Error((body?.error?body.error+' ':'')
     +'Wynik wysyłki jest niepewny — sprawdź historię wysyłek przed ponowieniem.');
   uncertain.pending=true;
   throw uncertain;
 }
 if(data?.status!=='sent')throw new Error(data?.error||'Nie potwierdzono wysyłki e-mail.');
 attempt.status='sent';
 try{localStorage.setItem(key,JSON.stringify(attempt));}catch{}
 return {recipient,sent:true,alreadySent:Boolean(data.alreadySent)};
}
