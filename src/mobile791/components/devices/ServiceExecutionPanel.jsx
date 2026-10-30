import React, { useEffect, useRef, useState } from 'react';
import { SERVICE_VISIT_CHECKS, normalizeServiceChecklist } from '../../modules/service-visit-checklist.js';
import {
  loadServiceVisitExecution,loadServiceVisitPhotos,saveServiceDeviceResult,
  uploadServiceVisitPhoto,loadStoredServiceProtocol,finalizeSignedServiceVisit,
  openServiceProtocolPdf,printServiceProtocol
} from '../../modules/service-visit-execution.js';
import { sendServiceProtocolEmail, hasUncertainServiceEmailAttempt } from '../../modules/service-visit-email.js';
import { loadServiceVisitHistory } from '../../modules/service-visits.js';
import './ServiceAdminPanel.css';
import './mobile-device-wizard.css';
import AppModal from '../modals/AppModal.jsx';
import { captureServiceSignature } from '../../modules/service-visit-signature.js';
import { refreshServicePushContext } from '../../modules/service-visit-push-health.js';

function newDraft(item) {
 return {checklist:normalizeServiceChecklist(item.checklist),result:item.result||'',notes:item.notes||''};
}
export default function ServiceExecutionPanel({supabase,userId,visitId,staffNames,onBack,onFinalized}) {
 const [visit,setVisit]=useState(null);
 const [photos,setPhotos]=useState([]);
 const [drafts,setDrafts]=useState({});
 const [protocol,setProtocol]=useState(null);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [signed,setSigned]=useState(false);
 const [signatureOpen,setSignatureOpen]=useState(false);
 const [signatureDataUrl,setSignatureDataUrl]=useState('');
 const [emailHistory,setEmailHistory]=useState(null);
 const canvasRef=useRef(null);
 const drawingRef=useRef(false);
 const lastPointRef=useRef(null);

 async function refresh() {
   const info=await loadServiceVisitExecution({supabase,visitId});
   const [photoRecords,record]=await Promise.all([
      loadServiceVisitPhotos({supabase,items:info.items||[]}),
      loadStoredServiceProtocol({supabase,visitId})
   ]);
   setVisit(info);setPhotos(photoRecords);setProtocol(record);
   setDrafts(Object.fromEntries((info.items||[]).map(item=>[item.id,newDraft(item)])));
   return info;
 }
 useEffect(()=>{
   let active=true;
   Promise.all([
     loadServiceVisitExecution({supabase,visitId}),
     loadStoredServiceProtocol({supabase,visitId}),
   ]).then(async ([info,record])=>{
     const p=await loadServiceVisitPhotos({supabase,items:info.items||[]});
     if(!active)return;
     setVisit(info);setProtocol(record);setPhotos(p);
     setDrafts(Object.fromEntries((info.items||[]).map(item=>[item.id,newDraft(item)])));
   }).catch(e=>{if(active)setError(e.message||'Nie udało się pobrać przeglądu.');});
   return ()=>{active=false;};
 },[supabase,visitId]);

 async function refreshEmailHistory() {
   try {
     const {entries,failed}=await loadServiceVisitHistory({supabase,visitId});
     setEmailHistory({entries:entries.filter(e=>e.kind==='email'),failed:failed.includes('wysyłki e-mail')});
   }catch(_e){setEmailHistory({entries:[],failed:true});}
 }
 useEffect(()=>{
   if(!protocol?.id)return;
   refreshEmailHistory();
 },[protocol?.id,visitId]);
 useEffect(()=>{
   const canvas=canvasRef.current;
   if(!canvas || protocol || !signatureOpen)return;
   const bounds=canvas.getBoundingClientRect();
   const scale=Math.min(3,Math.max(1,window.devicePixelRatio||1));
   canvas.width=Math.round(Math.max(240,bounds.width)*scale);
   const canvasHeight=Math.max(164,Math.round(bounds.height || 164));
   canvas.height=Math.round(canvasHeight*scale);
   const ctx=canvas.getContext('2d');
   ctx.scale(scale,scale);
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width/scale,canvasHeight);
   ctx.strokeStyle='#142a3a';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
   setSigned(false);
 },[visitId,visit?.id,protocol,signatureOpen]);

 function canvasPoint(e) {
   const rect=canvasRef.current.getBoundingClientRect();
   return {x:e.clientX-rect.left,y:e.clientY-rect.top};
 }
 function beginStroke(e) {
   if(busy||protocol)return;
   const canvas=canvasRef.current;if(!canvas)return;
   e.preventDefault();canvas.setPointerCapture?.(e.pointerId);
   drawingRef.current=true;lastPointRef.current=canvasPoint(e);
   setSigned(true);
 }
 function moveStroke(e) {
   if(!drawingRef.current || !canvasRef.current)return;
   e.preventDefault();const p=canvasPoint(e);
   const ctx=canvasRef.current.getContext('2d');
   ctx.beginPath();ctx.moveTo(lastPointRef.current.x,lastPointRef.current.y);
   ctx.lineTo(p.x,p.y);ctx.stroke();lastPointRef.current=p;
 }
 function endStroke(e) {
   if(!drawingRef.current)return;
   e.preventDefault();
   const ctx=canvasRef.current?.getContext('2d');
   if(ctx && lastPointRef.current){
     ctx.beginPath();ctx.arc(lastPointRef.current.x,lastPointRef.current.y,1.25,0,2*Math.PI);
     ctx.fillStyle='#142a3a';ctx.fill();
   }
   drawingRef.current=false;lastPointRef.current=null;
 }
 function clearSignature(){
   const canvas=canvasRef.current;if(!canvas)return;
   const ctx=canvas.getContext('2d');const scale=canvas.width/canvas.getBoundingClientRect().width;
   ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.setTransform(scale,0,0,scale,0,0);ctx.strokeStyle='#142a3a';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';
   setSigned(false);
 }
 function patchDraft(id,change) {
   // Każda zmiana wyniku/zakresu unieważnia wcześniej zatwierdzony podpis.
   if(signatureDataUrl)setSignatureDataUrl('');
   if(signed && signatureOpen) clearSignature();
   setDrafts(old=>({...old,[id]:{...old[id],...change}}));
 }
 async function saveItem(item) {
   const draft=drafts[item.id];
   if(!draft)return;
   setBusy(item.id);setError('');setMessage('');
   try {
     await saveServiceDeviceResult({supabase,visitId,itemId:item.id,checklist:draft.checklist,result:draft.result,notes:draft.notes});
     await refresh();
     setMessage('Wynik urządzenia zapisany w systemie.');
   }catch(e){setError(e.message||'Nie udało się zapisać wyniku.');}
   finally{setBusy('');}
 }
 async function attachPhoto(item,file) {
   if(!file)return;
   if(signatureDataUrl)setSignatureDataUrl('');
   if(signed && signatureOpen)clearSignature();
   setBusy('photo:'+item.id);setError('');setMessage('');
   try {
     await uploadServiceVisitPhoto({supabase,visitId,itemId:item.id,file});
     const records=await loadServiceVisitPhotos({supabase,items:visit.items});
     setPhotos(records);setMessage('Zdjęcie przesłane i potwierdzone w systemie.');
   }catch(e){setError(e.message||'Nie udało się wysłać zdjęcia.');}
   finally{setBusy('');}
 }
 async function waitForSignature() {
   if(!visit||!doneCount||unsaved)return;
   setBusy('waiting');setError('');setMessage('');
   try {
     const {data,error}=await supabase.rpc('service_visit_admin_wait_for_signature',{p_visit_id:visitId});
     if(error||data!==true)throw error||new Error('Nie potwierdzono zapisu wizyty.');
     await refresh();
     setMessage('Czynności zapisane. Wizyta oczekuje na podpis klienta, bez oznaczania jako wykonana.');
   }catch(e){setError(e.message||'Nie udało się zapisać statusu oczekiwania na podpis.');}
   finally{setBusy('');}
 }
 function confirmSignature() {
   if(!signed || !canvasRef.current)return;
   try {
     setSignatureDataUrl(captureServiceSignature(canvasRef.current));
     setSignatureOpen(false);
     setMessage('Podpis zatwierdzony. Aby zakończyć, zapisz podpisany protokół.');
   }catch(error){
     setError(error.message || 'Nie udało się odczytać podpisu.');
   }
 }
 async function complete() {
   if(!signatureDataUrl){setError('Klient musi podpisać protokół.');return;}
   setBusy('complete');setError('');setMessage('');
   try {
     const pushReady=await refreshServicePushContext({supabase,userId});
     const record=await finalizeSignedServiceVisit({
       supabase,visitId,signatureDataUrl,technicianNames:staffNames
     });
     setProtocol(record);const info=await loadServiceVisitExecution({supabase,visitId});setVisit(info);
     setMessage(pushReady ? 'Podpisany protokół zapisany na serwerze. Przegląd zakończony.' :
       'Przegląd zakończony i PDF zapisany. Uwaga: ten iPhone nie potwierdził gotowości PUSH. Sprawdź powiadomienia aplikacji i diagnostykę PUSH.');
     onFinalized?.(info);
   }catch(e){setError(e.message||'Nie udało się zakończyć przeglądu. Dane nie zostały oznaczone jako wykonane.');}
   finally{setBusy('');}
 }
 async function protocolAction(action) {
   if(!protocol)return;
   setBusy(action);setError('');
   try {
     if(action==='open') await openServiceProtocolPdf({supabase,record:protocol});
     if(action==='print') await printServiceProtocol({supabase,record:protocol});
     if(action==='email') {
       const recipient=visit.client?.email||'';
       const uncertain=hasUncertainServiceEmailAttempt({visitId:visit.id,protocolId:protocol.id});
       // Po niepewnym wyniku: jedno wyraźne pytanie i dopiero wtedy nowa, kontrolowana próba.
       const question=uncertain
         ?'Poprzednia wysyłka do '+recipient+' ma nieustalony wynik — klient mógł już otrzymać e-mail. Sprawdź historię wysyłek poniżej.\n\nWysłać protokół ponownie?'
         :'Wyślij podpisany protokół e-mailem do '+recipient+'?';
       if(!window.confirm(question))return;
       try {
         const result=await sendServiceProtocolEmail({supabase,visit,protocol,forceNewAttempt:uncertain});
         setMessage(result.alreadySent?'Ta wiadomość była już wcześniej potwierdzona.':'Wysłano protokół na '+result.recipient+'.');
       } finally {
         await refreshEmailHistory();
       }
     }
   }catch(e){setError(e.message||'Operacja na protokole nie powiodła się.');}
   finally{setBusy('');}
 }
 if(!visit)return <section className="serviceAdminPage"><button className="btn" onClick={onBack}>← Wróć</button>
   <div className="card serviceAdminCard">{error||'Wczytuję przegląd…'}</div></section>;
 const readonly=Boolean(protocol)||visit.status==='wykonany'||visit.status==='odwolany';
 const doneCount=(visit.items||[]).filter(i=>i.result).length;
 const unsaved=(visit.items||[]).some(i=>JSON.stringify(drafts[i.id]||newDraft(i))!==JSON.stringify(newDraft(i)));
 return <section className="serviceAdminPage" aria-label="Wykonanie przeglądu">
   <button className="btn" type="button" onClick={onBack} disabled={Boolean(busy)}>← Wróć do wizyty</button>
   <header className="serviceAdminHeader"><h2>Przegląd klimatyzacji</h2>
     <p>{visit.client?.company_name||'Klient'} · {visit.client?.city||''}</p>
     <p>Zapisano wyniki: {doneCount} z {visit.items?.length||0} urządzeń</p>
   </header>
   {error?<div className="errorBox" role="alert">{error}</div>:null}
   {message?<div className="serviceAdminNotice" role="status">{message}</div>:null}
   {(visit.items||[]).map((item,index)=>{
     const draft=drafts[item.id]||newDraft(item);
     const itemPhotos=photos.filter(p=>p.service_visit_device_id===item.id);
     const needPhoto=draft.result==='usterka' && !itemPhotos.length;
     const mandatoryChecksDone=SERVICE_VISIT_CHECKS.every(({key})=>draft.checklist[key]===true);
     const changed=JSON.stringify(draft)!==JSON.stringify(newDraft(item));
     return <div className="card serviceAdminCard" key={item.id}>
       <h3>Urządzenie {index+1} — {item.model_snapshot||'Klimatyzator'}</h3>
       <p className="serviceAdminMuted">S/N: {item.serial_snapshot||'Brak'} · {item.result?'Zapisany wynik: '+(item.result==='sprawne'?'Sprawne':'Usterka'):'Jeszcze bez wyniku'}</p>
       <div className="serviceAdminSectionTitle">Wykonane czynności</div>
       {SERVICE_VISIT_CHECKS.map(({key,label})=><label key={key} className="serviceAdminCheck">
         <input type="checkbox" disabled={readonly||Boolean(busy)}
           checked={draft.checklist[key]===true}
           onChange={e=>patchDraft(item.id,{checklist:{...draft.checklist,[key]:e.target.checked}})}/>
         <span>{label}</span>
       </label>)}
       <p className="serviceAdminMuted">Przed zapisaniem wyniku potwierdź wykonanie wszystkich sześciu czynności.</p>
       <div className="serviceAdminSectionTitle">Wynik</div>
       <label className="serviceAdminCheck"><input type="radio" name={'result-'+item.id} checked={draft.result==='sprawne'} disabled={readonly||Boolean(busy)}
          onChange={()=>patchDraft(item.id,{result:'sprawne'})}/> Sprawne, bez zastrzeżeń</label>
       <label className="serviceAdminCheck"><input type="radio" name={'result-'+item.id} checked={draft.result==='usterka'} disabled={readonly||Boolean(busy)}
          onChange={()=>patchDraft(item.id,{result:'usterka'})}/> Usterka lub nieprawidłowość</label>
       <label>Uwagi i zalecenia <textarea className="input" rows={2} disabled={readonly||Boolean(busy)}
         value={draft.notes} maxLength={4000} onChange={e=>patchDraft(item.id,{notes:e.target.value})}/></label>
       <div className="serviceAdminSectionTitle">Zdjęcia ({itemPhotos.length})</div>
       <p className="serviceAdminMuted">{needPhoto?'Do wykrytej usterki dodaj co najmniej jedno zdjęcie.':'Zdjęcia opcjonalne przy sprawnym urządzeniu.'}</p>
       {!readonly?<label>Dodaj zdjęcie
         <input type="file" className="input" accept="image/jpeg,image/png,image/webp,image/*"
           disabled={Boolean(busy)} onChange={e=>{const f=e.target.files?.[0];e.target.value='';attachPhoto(item,f);}}/>
       </label>:null}
       {itemPhotos.map((p,i)=><p className="serviceAdminMuted" key={p.id}>✓ Zdjęcie {i+1} zapisane w systemie ({Math.round(p.file_size_bytes/1024)} KB)</p>)}
       {!readonly?<button type="button" className="btn primary serviceAdminWide"
         disabled={Boolean(busy)||!draft.result||needPhoto||!mandatoryChecksDone}
         onClick={()=>saveItem(item)}>
         {busy===item.id?'Zapisuję…':changed?'Zapisz wynik urządzenia':'Zapisz wynik ponownie'}
       </button>:null}
     </div>;
   })}
   {protocol ? <div className="card serviceAdminCard">
     <h3>Podpisany protokół PDF</h3>
     <p className="serviceAdminMuted">Zakończono i zapisano w archiwum WAWIS. Jeden dokument na całą wizytę.</p>
     <div className="serviceAdminTwoFields">
       <button type="button" className="btn primary" disabled={Boolean(busy)} onClick={()=>protocolAction('open')}>Otwórz PDF</button>
       <button type="button" className="btn" disabled={Boolean(busy)} onClick={()=>protocolAction('print')}>Drukuj</button>
     </div>
     <button type="button" className="btn serviceAdminWide" disabled={Boolean(busy)} onClick={()=>protocolAction('email')}>
       Wyślij e-mail klientowi {visit.client?.email?'('+visit.client.email+')':''}
     </button>
     <p className="serviceAdminMuted">Wysyłka wyłącznie ręczna. Wysłane dokumenty są zapisywane w historii wysyłek.</p>
     <div className="serviceAdminSectionTitle">Historia wysyłek e-mail</div>
     {emailHistory===null ? <p className="serviceAdminMuted">Wczytuję historię wysyłek…</p>
       : emailHistory.failed ? <p className="serviceAdminMuted">Nie udało się pobrać historii wysyłek. Nie ponawiaj wysyłki bez jej sprawdzenia.</p>
       : emailHistory.entries.length ? emailHistory.entries.map(e=><p className="serviceAdminMuted" key={e.id}>{e.emailStatus==='sent'?'✓':e.emailStatus==='error'?'✕':'?'} {e.atLabel} — {e.text}</p>)
       : <p className="serviceAdminMuted">Protokół nie był jeszcze wysyłany e-mailem.</p>}
   </div> : visit.status==='odwolany'?<div className="card serviceAdminCard">Wizyta odwołana.</div>:<div className="card serviceAdminCard">
     <h3>Potwierdzenie klienta</h3>
     <p className="serviceAdminMuted">Podpis jest obowiązkowy. Zapisz wyniki urządzeń przed podpisaniem.</p>
     <button type="button" className="btn primary serviceAdminWide" disabled={Boolean(busy)||doneCount===0||unsaved}
       onClick={()=>{setError('');setMessage('');setSigned(false);setSignatureOpen(true);}}>
       {signatureDataUrl?'✍ Podpisz ponownie':'✍ Zrób podpis'}
     </button>
     {signatureDataUrl?<p className="serviceAdminMuted">✓ Podpis klienta został zatwierdzony.</p>:null}
     {visit.status!=='oczekuje_na_podpis' ? <button type="button" className="btn serviceAdminWide"
       disabled={Boolean(busy)||doneCount===0||unsaved}
       onClick={waitForSignature}>{busy==='waiting'?'Zapisuję…':'Zapisz — oczekuje na podpis klienta'}</button> : null}
     <button type="button" className="btn primary serviceAdminWide"
       disabled={Boolean(busy)||!signatureDataUrl||doneCount===0||unsaved}
       onClick={complete}>{busy==='complete'?'Zapisuję podpisany PDF…':'Zakończ przegląd i zapisz PDF'}</button>
     <p className="serviceAdminMuted">Jeśli zmienisz wynik urządzenia, najpierw zapisz go osobno. Wizyta będzie oznaczona jako wykonana wyłącznie po zapisaniu podpisanego PDF i pozytywnej kontroli dokumentacji usterek na serwerze.</p>
   </div>}
   <AppModal open={signatureOpen} onClose={()=>setSignatureOpen(false)}
     overlayClassName="protocolSignatureOverlay" contentClassName="protocolSignatureModal"
     closeOnOverlay={false} closeOnEscape lockPagePosition>
     <div className="protocolSignatureScreen">
       <div className="protocolSignatureHeader">
         <button type="button" className="protocolSignatureBack" aria-label="Wróć" onClick={()=>setSignatureOpen(false)}>←</button>
         <div><h2>Podpis klienta</h2><p>{visit.client?.company_name||'Klient'}</p></div>
       </div>
       <p className="protocolSignatureInstruction">Proszę podpisać się palcem w białym polu. Ten ekran nie przewija się podczas podpisywania.</p>
       <div className="protocolSignatureCanvasWrap">
         <canvas ref={canvasRef} className="protocolSignatureCanvas" aria-label="Pole podpisu klienta"
           onPointerDown={beginStroke} onPointerMove={moveStroke} onPointerUp={endStroke}
           onPointerCancel={endStroke} onPointerLeave={endStroke}/>
       </div>
       <div className="protocolSignatureActions">
         <button type="button" className="btn" disabled={!signed} onClick={clearSignature}>Wyczyść podpis</button>
         <button type="button" className="btn primary" disabled={!signed} onClick={confirmSignature}>Zatwierdź podpis</button>
       </div>
     </div>
   </AppModal>
 </section>;
}
