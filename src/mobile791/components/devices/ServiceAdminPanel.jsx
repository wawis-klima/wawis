import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  searchServiceDevices, groupServiceSearchResults, loadServiceCustomerDevices,
  loadServiceStaff, loadAdminServiceVisits, createAdminServiceVisit,
  updateAdminServiceAssignment, formatServiceDate,
} from '../../modules/service-visits.js';
import './ServiceAdminPanel.css';
import ServiceExecutionPanel from './ServiceExecutionPanel.jsx';

const TODAY = () => {
  const now = new Date();
  // Data według lokalnego zegara telefonu, bez przesunięcia przez UTC.
  const y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
};
function friendlyError(error) {
  const message = String(error?.message || error || 'Nie udało się pobrać danych.');
  return /service_visit_admin_search|service_visits|service_visit_admin_create|schema cache|PGRST205/i.test(message)
    ? 'Nowy moduł serwisowy nie jest jeszcze dostępny w bazie. Nie dokonano żadnego zapisu.'
    : message;
}
function CustomerAddress({ client }) {
  const address = [client?.street, client?.city].filter(Boolean).join(', ');
  return <span className="serviceAdminMuted">{address || 'Brak adresu'}</span>;
}
function DeviceItem({ device, children }) {
  return <div className="serviceAdminDevice">
    <div className="serviceAdminDeviceInfo"><strong>{device.model || device.model_snapshot || 'Klimatyzator'}</strong>
      <small>Nr seryjny: {device.serial_number || device.serial_snapshot || 'Brak numeru'}</small>
      {device.installation_date || device.installation_date_snapshot
        ? <small>Montaż: {formatServiceDate(device.installation_date || device.installation_date_snapshot)}</small>
        : null}
    </div>{children}
  </div>;
}

export default function ServiceAdminPanel({ supabase, isAdmin, userId }) {
  const [screen,setScreen] = useState('search');
  const [search,setSearch] = useState('');
  const [groups,setGroups] = useState([]);
  const [customer,setCustomer] = useState(null);
  const [customerDevices,setCustomerDevices] = useState([]);
  const [visits,setVisits] = useState([]);
  const [staff,setStaff] = useState([]);
  const [currentVisit,setCurrentVisit] = useState(null);
  const [selectedIds,setSelectedIds] = useState([]);
  const [createOperationId,setCreateOperationId] = useState(()=>crypto.randomUUID());
  const [date,setDate] = useState(TODAY);
  const [time,setTime] = useState('');
  const [notes,setNotes] = useState('');
  const [primary,setPrimary] = useState('');
  const [additional,setAdditional] = useState([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const [refreshKey,setRefreshKey] = useState(0);

  const staffName = useCallback(id => staff.find(p => p.id === id)?.full_name || (id ? 'Pracownik' : 'Bez przydziału'),[staff]);
  useEffect(() => {
    if (!isAdmin || !supabase) return;
    let active = true;
    loadServiceStaff({supabase}).then(rows => { if(active) setStaff(rows); })
      .catch(() => { if(active) setStaff([]); });
    return () => { active = false; };
  },[isAdmin,supabase,userId]);

  useEffect(() => {
    if (!isAdmin || !supabase || screen !== 'search' || search.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let active=true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchServiceDevices({ supabase,query:search }).then(rows => {
        if (active) { setGroups(groupServiceSearchResults(rows)); setError(''); }
      }).catch(err => { if(active) { setGroups([]);setError(friendlyError(err)); } })
        .finally(() => { if(active) setLoading(false); });
    },300);
    return () => { active=false;window.clearTimeout(timer); };
  },[isAdmin,supabase,screen,search,refreshKey]);

  const loadVisits = useCallback(async contractorId => {
    const rows=await loadAdminServiceVisits({supabase,contractorId});
    setVisits(rows);
    return rows;
  },[supabase]);

  async function openCustomer(group) {
    setBusy(true);setError('');setMessage('');
    try {
      const [devices,history] = await Promise.all([
        loadServiceCustomerDevices({supabase,contractorId:group.id}),
        loadAdminServiceVisits({supabase,contractorId:group.id}),
      ]);
      setCustomer(group);setCustomerDevices(devices);setVisits(history);setScreen('customer');
    } catch(err) { setError(friendlyError(err)); }
    finally {setBusy(false);}
  }
  async function showVisits() {
    setBusy(true);setError('');setMessage('');
    try { await loadVisits(null);setScreen('visits'); }
    catch(err) {setError(friendlyError(err));}
    finally {setBusy(false);}
  }
  function startPlan() {
    setSelectedIds([]);setCreateOperationId(crypto.randomUUID());setDate(TODAY());setTime('');setNotes('');
    setPrimary('');setAdditional([]);setError('');setMessage('');setScreen('plan');
  }
  function toggleId(id) {
    setSelectedIds(current => current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  }
  async function savePlan(event) {
    event.preventDefault();
    if (selectedIds.length<1) {setError('Wybierz urządzenia objęte umówionym przeglądem.');return;}
    if (!date) {setError('Podaj termin umówiony z klientem.');return;}
    if (typeof navigator !== 'undefined' && navigator.onLine===false) {setError('Brak internetu. Zaplanuj przegląd po przywróceniu połączenia.');return;}
    setBusy(true);setError('');
    try {
      const visitId=await createAdminServiceVisit({supabase,contractorId:customer.id,deviceIds:selectedIds,date,time,notes,technicianId:primary,operationId:createOperationId});
      // Osoby dodatkowe mogą być dodane po zapisie. Nie ukrywamy częściowego błędu.
      if (additional.length) {
        try { await updateAdminServiceAssignment({supabase,visitId,technicianId:primary,additionalTechnicianIds:additional}); }
        catch(err) { setMessage('Zlecenie zapisane, ale nie udało się przypisać dodatkowych osób: '+friendlyError(err)); }
      }
      const rows=await loadVisits(customer.id);
      const newVisit=rows.find(v=>v.id===visitId);
      if(newVisit) {setCurrentVisit(newVisit);setScreen('detail');}
      else setScreen('customer');
      setMessage(current => current || 'Przegląd został umówiony i zapisany w systemie.');
    } catch(err) {setError(friendlyError(err));}
    finally {setBusy(false);}
  }
  function openVisit(visit) {
    setCurrentVisit(visit);setPrimary(visit.primary_technician_id || '');
    setAdditional(visit.additional_technician_ids || []);
    setDate(visit.scheduled_date || TODAY());setTime(visit.scheduled_time?.slice(0,5) || '');
    setNotes(visit.notes || '');setError('');setMessage('');setScreen('detail');
  }
  async function saveAssignment(event) {
    event.preventDefault();
    if(!currentVisit) return;
    setBusy(true);setError('');setMessage('');
    try {
      // Przydział, nowy termin i notatki są niezależne od harmonogramu SMS.
      const {data,error:writeError}=await supabase.from('service_visits')
        .update({scheduled_date:date,scheduled_time:time || null,notes:notes.trim().slice(0,4000)})
        .eq('id',currentVisit.id).select('id').single();
      if(writeError || !data) throw writeError || new Error('Brak potwierdzenia zmiany terminu.');
      await updateAdminServiceAssignment({supabase,visitId:currentVisit.id,technicianId:primary,additionalTechnicianIds:additional});
      const rows=await loadVisits(currentVisit.contractor_id);
      setCurrentVisit(rows.find(v=>v.id===currentVisit.id) || currentVisit);
      setMessage('Zmiany terminu i przydziału zapisano.');
    } catch(err){setError(friendlyError(err));}
    finally{setBusy(false);}
  }
  async function cancelVisit() {
    if (!currentVisit || !window.confirm('Odwołać tę umówioną wizytę? Historia zlecenia pozostanie zapisana.')) return;
    setBusy(true);setError('');
    try {
      const {data,error:writeError}=await supabase.rpc('service_visit_admin_cancel',{p_visit_id:currentVisit.id});
      if(writeError || data!==true) throw writeError || new Error('Nie potwierdzono odwołania.');
      const rows=await loadVisits(currentVisit.contractor_id);
      setCurrentVisit(rows.find(v=>v.id===currentVisit.id) || {...currentVisit,status:'odwolany'});
      setMessage('Wizyta została odwołana.');
    } catch(err){setError(friendlyError(err));}
    finally {setBusy(false);}
  }
  const countSelected=selectedIds.length;
  const planned=useMemo(()=>visits.filter(v=>v.status!=='wykonany'&&v.status!=='odwolany').sort((a,b)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date))),[visits]);
  const completed=useMemo(()=>visits.filter(v=>v.status==='wykonany'),[visits]);

  if (!isAdmin) return null;
  if (screen==='execution' && currentVisit) return <ServiceExecutionPanel
    supabase={supabase} visitId={currentVisit.id}
    staffNames={[staffName(currentVisit.primary_technician_id),...(currentVisit.additional_technician_ids||[]).map(staffName)].filter(s=>s && s!=='Bez przydziału')}
    onBack={()=>{setScreen('detail');setMessage('');}}
    onFinalized={async (finished)=>{
      const rows=await loadVisits(currentVisit.contractor_id);
      setCurrentVisit(rows.find(v=>v.id===finished.id)||currentVisit);
    }}/>
  ;
  return <section className="serviceAdminPage" aria-label="Urządzenia i przeglądy — administrator">
    <header className="serviceAdminHeader">
      <h2>Urządzenia</h2>
      <p>Wyszukaj klienta lub zaplanuj uzgodniony telefonicznie przegląd.</p>
    </header>
    <nav className="serviceAdminNav" aria-label="Widoki serwisu">
      <button type="button" className={screen==='search'?'btn primary':'btn'} onClick={()=>{setScreen('search');setError('');setMessage('');}}>Szukaj</button>
      <button type="button" className={screen==='visits'?'btn primary':'btn'} disabled={busy} onClick={showVisits}>Zaplanowane</button>
    </nav>
    {error ? <div className="errorBox" role="alert">{error}</div> : null}
    {message ? <div className="serviceAdminNotice" role="status">{message}</div> : null}
    {screen==='search' ? <div className="card serviceAdminCard">
      <label htmlFor="service-device-search">Wyszukaj urządzenie lub klienta</label>
      <input id="service-device-search" className="input" type="search" autoComplete="off"
        value={search} onChange={e=>setSearch(e.target.value)}
        placeholder="Nazwisko, adres, telefon, model, numer seryjny…"/>
      {search.trim().length<2 ? <p className="serviceAdminMuted">Wpisz przynajmniej dwa znaki. Lista pozostaje ukryta, dopóki nie wyszukasz klienta.</p>
        : loading ? <p className="serviceAdminMuted">Wyszukiwanie…</p>
        : !groups.length ? <p className="serviceAdminMuted">Brak pasujących urządzeń.</p>
        : <div className="serviceAdminStack" aria-live="polite">
            {groups.map(group=><button type="button" className="serviceAdminClientRow" key={group.id} onClick={()=>openCustomer(group)} disabled={busy}>
              <strong>{group.name}</strong><span>{[group.street,group.city].filter(Boolean).join(', ')}</span>
              <small>{group.phone} · Pasujące urządzenia: {group.devices.length}</small>
            </button>)}
          </div>}
    </div> : null}
    {screen==='customer' && customer ? <>
      <button type="button" className="btn" onClick={()=>setScreen('search')}>← Wróć do wyszukiwarki</button>
      <div className="card serviceAdminCard">
        <h3>{customer.name}</h3><CustomerAddress client={customer}/>
        {customer.phone ? <a href={`tel:${customer.phone.replace(/[^\d+]/g,'')}`}>{customer.phone}</a> : null}
        <div className="serviceAdminSectionTitle">Urządzenia klienta ({customerDevices.length})</div>
        <div className="serviceAdminStack">{customerDevices.map(d=><DeviceItem key={d.id} device={d}/>)}</div>
        <button className="btn primary serviceAdminWide" type="button" onClick={startPlan} disabled={busy||customerDevices.length===0}>Zaplanuj przegląd</button>
        <div className="serviceAdminSectionTitle">Historia i umówione wizyty</div>
        {visits.length ? visits.map(v=><button className="serviceAdminVisitRow" type="button" key={v.id} onClick={()=>openVisit(v)}>
          <strong>{formatServiceDate(v.scheduled_date)} {v.scheduled_time?.slice(0,5)||''}</strong>
          <span>{v.items?.length||0} urządzeń · {v.status==='wykonany'?'Wykonany':v.status==='odwolany'?'Odwołany':v.primary_technician_id?'Przydzielony':'Bez przydziału'}</span>
        </button>) : <p className="serviceAdminMuted">Nie ma jeszcze umówionych ani wykonanych przeglądów.</p>}
      </div>
    </> : null}
    {screen==='plan' && customer ? <>
      <button type="button" className="btn" onClick={()=>setScreen('customer')}>← Wróć do klienta</button>
      <form className="card serviceAdminCard" onSubmit={savePlan}>
        <h3>Umówiony przegląd</h3><strong>{customer.name}</strong><CustomerAddress client={customer}/>
        <div className="serviceAdminSectionTitle">Urządzenia objęte wizytą</div>
        <div className="serviceAdminStack">{customerDevices.map(d=><label className="serviceAdminCheck" key={d.id}>
          <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={()=>toggleId(d.id)}/>
          <DeviceItem device={d}/>
        </label>)}</div><small className="serviceAdminMuted">Wybrano: {countSelected}</small>
        <div className="serviceAdminTwoFields">
          <label>Data <input className="input" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
          <label>Godzina <input className="input" type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
        </div>
        <label>Główny serwisant (opcjonalny)
          <select className="input" value={primary} onChange={e=>{setPrimary(e.target.value);setAdditional(x=>x.filter(id=>id!==e.target.value));}}>
            <option value="">Bez przydziału — do podjęcia w przyszłości</option>
            {staff.map(p=><option value={p.id} key={p.id}>{p.full_name||'Pracownik'}</option>)}
          </select>
        </label>
        <fieldset className="serviceAdminExtras"><legend>Dodatkowi pracownicy (opcjonalnie)</legend>
          {staff.filter(p=>p.id!==primary).map(p=><label key={p.id} className="serviceAdminCheck">
            <input type="checkbox" checked={additional.includes(p.id)} onChange={e=>setAdditional(x=>e.target.checked?[...x,p.id]:x.filter(y=>y!==p.id))}/>
            <span>{p.full_name||'Pracownik'}</span>
          </label>)}
        </fieldset>
        <label>Uwagi <textarea className="input" rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ustalenia z rozmowy telefonicznej…"/></label>
        <button className="btn primary serviceAdminWide" type="submit" disabled={busy||countSelected===0||!date}>{busy?'Zapisuję…':'Zapisz umówiony przegląd'}</button>
        <p className="serviceAdminMuted">SMS sam w sobie nie tworzy zlecenia. Termin kolejnego przypomnienia nadal wynika z daty montażu.</p>
      </form>
    </> : null}
    {screen==='visits' ? <div className="card serviceAdminCard">
      <h3>Zaplanowane przeglądy ({planned.length})</h3>
      {planned.length ? planned.map(v=><button className="serviceAdminVisitRow" type="button" key={v.id} onClick={()=>openVisit(v)}>
        <strong>{formatServiceDate(v.scheduled_date)} · {v.scheduled_time?.slice(0,5)||'Godzina nieustalona'}</strong>
        <span>{v.client?.company_name||'Klient'} · {v.client?.city||''}</span>
        <small>{(v.items||[]).length} urządzeń · {staffName(v.primary_technician_id)}</small>
      </button>) : <p className="serviceAdminMuted">Brak umówionych przeglądów.</p>}
      {completed.length ? <><div className="serviceAdminSectionTitle">Ostatnio wykonane</div>
        {completed.map(v=><button className="serviceAdminVisitRow" type="button" key={v.id} onClick={()=>openVisit(v)}>
          {formatServiceDate(v.scheduled_date)} · {v.client?.company_name||'Klient'}
        </button>)}</> : null}
    </div> : null}
    {screen==='detail' && currentVisit ? <>
      <button className="btn" type="button" onClick={()=>customer?.id===currentVisit.contractor_id?setScreen('customer'):showVisits()}>← Wróć</button>
      <form className="card serviceAdminCard" onSubmit={saveAssignment}>
        <h3>Przegląd — {formatServiceDate(currentVisit.scheduled_date)}</h3>
        <strong>{currentVisit.client?.company_name||customer?.name||'Klient'}</strong>
        <CustomerAddress client={currentVisit.client||customer}/>
        <span className="serviceAdminMuted">Status: {currentVisit.status==='odwolany'?'Odwołany':currentVisit.status==='wykonany'?'Wykonany':currentVisit.primary_technician_id?'Przydzielony':'Zaplanowany, bez przydziału'}</span>
        <div className="serviceAdminSectionTitle">Urządzenia ({currentVisit.items?.length||0})</div>
        {currentVisit.items?.map(d=><DeviceItem device={d} key={d.id}/>)}
        {currentVisit.status!=='odwolany'?<button className="btn primary serviceAdminWide" type="button" onClick={()=>{setScreen('execution');setError('');setMessage('');}}>
          {currentVisit.status==='wykonany'?'Zobacz podpisany protokół':'Wykonaj przegląd'}
        </button>:null}
        <div className="serviceAdminSectionTitle">Termin i przydział</div>
        <div className="serviceAdminTwoFields">
          <label>Data <input type="date" className="input" value={date} required onChange={e=>setDate(e.target.value)} disabled={currentVisit.status==='odwolany'||currentVisit.status==='wykonany'}/></label>
          <label>Godzina <input type="time" className="input" value={time} onChange={e=>setTime(e.target.value)} disabled={currentVisit.status==='odwolany'||currentVisit.status==='wykonany'}/></label>
        </div>
        <label>Główny serwisant
          <select className="input" value={primary} onChange={e=>{setPrimary(e.target.value);setAdditional(x=>x.filter(id=>id!==e.target.value));}} disabled={currentVisit.status==='odwolany'||currentVisit.status==='wykonany'}>
            <option value="">Nieprzydzielony</option>
            {staff.map(p=><option value={p.id} key={p.id}>{p.full_name||'Pracownik'}</option>)}
          </select>
        </label>
        <fieldset className="serviceAdminExtras" disabled={currentVisit.status==='odwolany'||currentVisit.status==='wykonany'}><legend>Dodatkowi pracownicy</legend>
          {staff.filter(p=>p.id!==primary).map(p=><label key={p.id} className="serviceAdminCheck">
            <input type="checkbox" checked={additional.includes(p.id)} onChange={e=>setAdditional(x=>e.target.checked?[...x,p.id]:x.filter(y=>y!==p.id))}/>
            <span>{p.full_name||'Pracownik'}</span>
          </label>)}
        </fieldset>
        <label>Uwagi <textarea className="input" value={notes} rows={3} onChange={e=>setNotes(e.target.value)} disabled={currentVisit.status==='odwolany'||currentVisit.status==='wykonany'}/></label>
        {currentVisit.status!=='odwolany'&&currentVisit.status!=='wykonany' ? <>
          <button className="btn primary serviceAdminWide" type="submit" disabled={busy}>{busy?'Zapisuję…':'Zapisz zmiany'}</button>
          <button className="btn serviceAdminWide" type="button" onClick={cancelVisit} disabled={busy}>Odwołaj wizytę</button>
        </> : null}
        <p className="serviceAdminMuted">Podpisany protokół jest wymagany do zakończenia. Montaże i terminarz SMS pozostają bez zmian.</p>
      </form>
    </> : null}
  </section>;
}
