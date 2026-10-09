'use strict';
/* WAWIS DESIGN LAB 0.3 — bez sieci, Supabase, SMS, PUSH, PWA i faktur. */
(() => {
  const $=x=>document.getElementById(x);
  const STORE='wawis-design-lab-concept2-v02';
  const statusNames=['Nowe','W trakcie','Zakończone','Niezrealizowane'];
  const modules=['Montaże','Kontrahenci','Urządzenia','Kalendarz','SMS serwis','Panel paliwa','Centrum 360','Diagnostyka'];
  const towns=['Zakopane','Wieliczka','Kraków','Piaseczno','Oświęcim','Zawiercie','Myszków','Poręba','Ogrodzieniec','Łazy','Pilica'];
  const models=['Rotenso Imoto I35','Rotenso Roni R35','Mitsubishi MSZ-AP25','Rotenso Teta T35','Rotenso Xo E26','Mitsubishi MSZ-HR35'];
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svg=(inner,extra='')=>'<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linejoin="round" stroke-linecap="round" '+extra+'>'+inner+'</svg>';
  const ico={
    Montaże:svg('<path d="M7 8 24 25M11 5 5 11l5 5 6-6-5-5ZM25 6 13 18m7-12 6 6m-2-8 3 3"/>'),
    Kontrahenci:svg('<path d="M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM3 27v-3c0-5 4-8 9-8s9 3 9 8v3ZM24 8a4 4 0 0 1 0 8m1 2c3 1 4 3 4 7v2"/>'),
    Urządzenia:svg('<rect x="5" y="5" width="22" height="20" rx="3"/><circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="1.2"/><path d="M16 10v4m0 3v5m-5-9 3 2m5 3 3 2m-11-1 3-3m5-1 3-3M5 28h22"/>'),
    Kalendarz:svg('<rect x="4" y="7" width="24" height="21" rx="3"/><path d="M10 4v7M22 4v7M4 13h24"/><path d="M10 18h2m6 0h2m-10 6h2" class="accent" stroke="#128eec"/>'),
    'SMS serwis':svg('<path d="M5 6h22v16H14l-7 5v-5H5Z"/><circle cx="11" cy="14" r="1" fill="#188eea" stroke="none"/><circle cx="16" cy="14" r="1" fill="#188eea" stroke="none"/><circle cx="21" cy="14" r="1" fill="#188eea" stroke="none"/>'),
    'Panel paliwa':svg('<rect x="5" y="4" width="14" height="24" rx="2"/><path d="M5 12h14m-14 16h17M22 7l5 5v10c0 4-3 4-3 0v-3c0-2-2-3-5-3"/><path d="M9 8h6"/>'),
    'Centrum 360':svg('<ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(-35 16 16)"/><ellipse cx="16" cy="16" rx="13" ry="8" transform="rotate(35 16 16)"/><circle cx="16" cy="16" r="3.5" stroke="#1687ce"/><path d="M14 16h4"/>'),
    Diagnostyka:svg('<rect x="3" y="5" width="26" height="21" rx="3"/><path d="M7 16h5l2-5 3 10 3-7 2 2h3M10 29h12"/>'),
    Użytkownik:svg('<circle cx="16" cy="10" r="5"/><path d="M6 29v-4c0-6 4-9 10-9s10 3 10 9v4"/>'),
    house:svg('<path d="m4 15 12-10 12 10M8 13v15h16V13M13 28V18h6v10"/>'),
    date:svg('<rect x="4" y="6" width="24" height="22" rx="3"/><path d="M4 12h24M10 3v7M22 3v7m-12 9h3m5 0h3" />'),
    pin:svg('<path d="M16 29S6 18 6 12a10 10 0 0 1 20 0c0 6-10 17-10 17Z"/><circle cx="16" cy="12" r="3.2"/>'),
    doc:svg('<path d="M9 3h12l6 6v20H9zM21 3v7h6M13 16h10m-10 5h10"/>'),
    photo:svg('<rect x="3" y="5" width="26" height="22" rx="3"/><circle cx="11" cy="12" r="2"/><path d="m5 24 8-7 5 4 4-5 5 8"/>'),
    new:svg('<path d="M8 3h12l6 6v20H8Z"/><path d="M20 3v7h6M12 14h7"/><path d="M22 19v9m-4.5-4.5h9" class="accent" stroke="#0a9ae7"/>'),
    progress:svg('<path d="M16 3a13 13 0 1 0 13 13"/><path class="accent" stroke="#1099ea" d="M16 3a13 13 0 0 1 13 13"/><path d="M16 9v8l6 5"/>'),
    done:svg('<circle cx="16" cy="16" r="13"/><path d="m9 17 5 5 10-12" stroke="#0a98e5" stroke-width="2.4"/>'),
    missed:svg('<circle cx="16" cy="16" r="13"/><path d="m11 11 10 10m0-10L11 21"/>')
  };
  const statusType={'Nowe':'new','W trakcie':'progress','Zakończone':'done','Niezrealizowane':'missed'};
  const set=()=>Array.from({length:36},(_,i)=>({
    id:'DEMO-'+String(i+1).padStart(3,'0'),client:'Klient demonstracyjny '+String(i+1).padStart(2,'0'),
    city:towns[i%towns.length],street:'ul. Przykładowa '+(i+12),
    date:'2026-10-'+String(7+i%21).padStart(2,'0'),status:statusNames[[1,0,3,2,1,0,2,1,3][i%9]],
    model:models[i%models.length],installer:'Monter '+String.fromCharCode(65+i%4),
    photos:i%4===0?0:3,devices:i%7===0?3:1,note:i%5===0?'Przygotować miejsce pod montaż. Kontakt z klientem w dniu montażu.':''
  }));
  const read=()=>{try{const x=JSON.parse(localStorage.getItem(STORE));if(Array.isArray(x)&&x.length&&x.every(y=>typeof y.id==='string'&&typeof y.client==='string'))return x}catch(e){}return set()};
  let jobs=read(),mode='Montaże',role='admin',selected=jobs[0].id,filter=null,query='',editing=null;
  const save=()=>{try{localStorage.setItem(STORE,JSON.stringify(jobs))}catch(e){}};
  let toastTimer;
  function toast(s){const t=$('toast');t.textContent=s;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3400)}
  const icoLabel=(name)=>ico[name]||ico.doc;
  function nav(){
    $('desktop-nav').innerHTML=modules.map(m=>'<button type="button" class="navitem '+(mode===m?'active':'')+'" data-module="'+escape(m)+'" aria-current="'+(mode===m?'page':'false')+'"><span class="ic">'+icoLabel(m)+'</span><span>'+escape(m)+'</span></button>').join('');
    const allowed=role==='admin'?['Montaże','Kontrahenci','Panel paliwa']:['Montaże','Panel paliwa'];
    if(!allowed.includes(mode) && window.innerWidth<731)mode='Montaże';
    $('mobile-nav').innerHTML=allowed.map(m=>'<button class="mobmod '+(mode===m?'active':'')+'" type="button" data-module="'+escape(m)+'">'+icoLabel(m)+'<span>'+escape(m==='Panel paliwa'?'Paliwo':m)+'</span></button>').join('');
    document.querySelectorAll('[data-role]').forEach(x=>x.classList.toggle('role-active',x.dataset.role===role));
    $('role-caption').textContent=role==='admin'?'Administrator':'Pracownik';
    $('greeting-name').textContent=role==='admin'?'Administrator':'Monter';
    $('main-title').textContent=mode;
    $('main-sub').innerHTML=mode==='Montaże'?'Zarządzaj montażami, zleceniami<br> i dokumentacją w jednym miejscu.':escape('Podgląd graficzny modułu '+mode);
  }
  function statusbar(){
    $('statusbar').innerHTML=statusNames.map(s=>'<button class="statusbutton '+(filter===s?'active':'')+'" type="button" data-filter="'+escape(s)+'" data-status="'+escape(s)+'" aria-label="'+escape(s)+'" title="'+escape(s)+'" aria-pressed="'+(filter===s?'true':'false')+'">'+ico[statusType[s]]+'</button>').join('');
  }
  function iconbadge(s){return '<span class="righticon '+statusType[s]+'">'+ico[statusType[s]]+'</span>'}
  function selectedJob(){return jobs.find(x=>x.id===selected)||jobs[0]}
  function list(){
    const visible=jobs.filter(j=>(filter===null||j.status===filter)&&[j.client,j.city,j.model,j.id].some(x=>String(x).toLowerCase().includes(query.toLowerCase())));
    $('total-items').textContent=visible.length+' pozycji';
    $('joblist').innerHTML=visible.length?visible.map(j=>'<button class="jobcard '+(j.id===selected?'selected':'')+'" type="button" data-job="'+escape(j.id)+'"><span class="housebox">'+ico.house+'</span><span class="jobtext"><strong>'+escape(j.client)+'</strong><small>'+escape(j.city)+' · '+escape(j.date)+' · '+escape(j.model)+'</small></span>'+iconbadge(j.status)+'<span class="arrow">›</span></button>').join(''):'<div class="empty">Nie ma montaży w tym widoku.</div>';
  }
  const fact=(icon,main,desc)=>'<div class="fact"><span class="facticon">'+(ico[icon]||ico.doc)+'</span><div class="facttext"><b>'+escape(main)+'</b><small>'+escape(desc)+'</small></div></div>';
  function details(){
    const j=selectedJob();
    if(!j){$('details').innerHTML='';return;}
    $('details').innerHTML='<div class="detail-top"><div class="detail-eyebrow">KARTA MONTAŻU · '+escape(j.id)+'</div><div class="detail-titleline"><h2>'+escape(j.client)+'</h2><span class="statusbadge '+statusType[j.status]+'">'+ico[statusType[j.status]]+escape(j.status)+'</span></div><div class="detail-address">'+escape(j.street)+', '+escape(j.city)+'</div></div><div class="detail-content"><div class="detail-section"><div class="sectionheading">Podstawowe informacje</div><div class="facts">'+fact('date',j.date,'Termin montażu')+fact('Użytkownik',j.installer,'Przypisany')+fact('pin',j.city,'Miasto')+fact('doc',j.devices+' kpl.','Urządzenia')+'</div></div><div class="detail-section"><div class="sectionheading">Urządzenia <small>'+j.devices+' kpl.</small></div><div class="device-preview"><div class="unit-illustration"></div><div><b>'+escape(j.model)+'</b><small>Jednostka wewnętrzna + zewnętrzna · DEMO</small></div></div></div><div class="detail-section"><div class="sectionheading">Zdjęcia <small>'+j.photos+' plików</small></div><div class="photoplace">'+ico.photo+'<span>'+ (j.photos?'Przykładowe zdjęcia (demo)':'Brak zdjęć w tym zleceniu')+'</span></div></div><div class="detail-section"><div class="sectionheading">Uwagi</div><div class="notes">'+escape(j.note||'Brak dodatkowych uwag.')+'</div></div></div><div class="detail-actions"><button class="outlinebtn" type="button" data-action="protocol">▣ Protokół (demo)</button><button class="primarybtn" type="button" data-action="edit">✎ Edytuj</button></div>';
  }
  function other(){
    const el=$('other-panel');
    el.innerHTML=window.WawisLabPanels.render({mode,role,jobs});
  }
  function render(){
    nav();
    const isJobs=mode==='Montaże';
    $('work').classList.toggle('hidden',!isJobs);
    $('other-panel').classList.toggle('hidden',isJobs);
    if(isJobs){statusbar();list();details()}else other();
  }
  function edit(j){
    editing=j||null;
    const f=$('editform');
    f.reset();
    $('modal-title').textContent=editing?'Edytuj montaż — demo':'Nowy montaż — demo';
    const x=editing||{client:'',city:'Zawiercie',date:'2026-10-09',model:'',status:'Nowe'};
    for(const k of ['client','city','date','model','status'])f.elements[k].value=x[k];
    $('modal-backdrop').classList.remove('hidden');f.elements.client.focus();
  }
  function close(){$('modal-backdrop').classList.add('hidden')}
  document.addEventListener('click',e=>{
    const b=e.target.closest('button');
    if(!b)return;
    if (window.WawisLabPanels && (b.dataset.demoAction||b.dataset.demoClient||b.dataset.demoDevice||b.dataset.demoTab||b.dataset.demoSms||b.dataset.demoDay||b.dataset.demoVehicle)) {
      const action=window.WawisLabPanels.action(b);
      const destinations={'goto-devices':'Urządzenia','goto-contractors':'Kontrahenci','goto-sms':'SMS serwis','goto-calendar':'Kalendarz'};
      if(destinations[action])mode=destinations[action];
      if(action==='toast')toast('Funkcja demonstracyjna — bez zapisu do produkcji.');
      render();return;
    }
    if(b.dataset.module){mode=b.dataset.module;render();return;}
    if(b.dataset.role){role=b.dataset.role;render();return;}
    if(b.dataset.filter){filter=(filter===b.dataset.filter)?null:b.dataset.filter;render();return;}
    if(b.dataset.job){selected=b.dataset.job;render();if(window.innerWidth<731)toast('Wybrano '+selected+'. Szczegóły można sprawdzić na desktopie.');return;}
    if(b.dataset.action==='edit'){edit(selectedJob());return;}
    if(b.dataset.action==='protocol'){toast('Protokół jest tylko prezentacją graficzną — bez generowania PDF.');return;}
  });
  document.addEventListener('input',e=>{
    const kind=e.target?.dataset?.demoSearch;
    if(!kind)return;
    const pos=e.target.selectionStart;
    window.WawisLabPanels.searchChange(kind,e.target.value);
    other();
    const input=document.querySelector('[data-demo-search="'+kind+'"]');
    if(input){input.focus();try{input.setSelectionRange(pos,pos)}catch(e){}}
  });
  document.addEventListener('change',e=>{
    const kind=e.target?.dataset?.demoSelect;
    if(!kind)return;
    window.WawisLabPanels.selectChange(kind,e.target.value);other();
  });
  document.addEventListener('submit',e=>{
    if(e.target.id!=='demo-client-form'&&e.target.id!=='demo-fuel-form')return;
    e.preventDefault();
    if(window.WawisLabPanels.form(e)){other();toast('Zapisano tylko w demonstracji.');}
  });
  $('notify-btn').addEventListener('click',()=>toast('W laboratorium powiadomienia są wyłączone.'));
  $('search').addEventListener('input',e=>{
    const pos=e.target.selectionStart;
    query=e.target.value;list();
    const input=$('search');input.focus();try{input.setSelectionRange(pos,pos)}catch(e){}
  });
  $('editform').addEventListener('submit',e=>{
    e.preventDefault();
    const form=e.currentTarget;
    const data=Object.fromEntries(new FormData(form).entries());
    if(editing)Object.assign(editing,data);
    else{const j={id:'DEMO-'+String(jobs.length+1).padStart(3,'0'),...data,installer:'Monter A',street:'ul. Przykładowa 1',photos:0,devices:1,note:''};jobs.unshift(j);selected=j.id}
    save();filter=null;query='';$('search').value='';close();render();toast('Dane zapisano wyłącznie w demonstracji.');
  });
  $('close-modal').addEventListener('click',close);
  $('cancel-modal').addEventListener('click',close);
  $('modal-backdrop').addEventListener('click',e=>{if(e.target.id==='modal-backdrop')close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  render();
})();