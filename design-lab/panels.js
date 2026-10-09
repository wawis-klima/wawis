'use strict';
/* WAWIS LAB: only synthetic fixtures; no external I/O. */
window.WawisLabPanels=(()=>{
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cities=['Zawiercie','Myszków','Ogrodzieniec','Łazy','Pilica','Poręba','Kroczyce'];
const models=['Rotenso Imoto I35','Rotenso Roni R35','Mitsubishi MSZ-AY25VGK','Rotenso Teta T35','Rotenso Xo E26'];
const names=['Anna Kowalska','Tomasz Nowak','Marta Wiśniewska','Jan Zieliński','Karolina Maj','Adam Wójcik','Ewa Kaczmarek','Michał Mazur','Alicja Lewandowska','Jakub Kamiński','Natalia Pawlak','Paweł Król','Barbara Krawczyk','Dawid Malinowski','Maria Lis'];
const clients=names.map((name,i)=>({id:'C'+i,name,city:cities[i%7],street:'ul. Testowa '+(i+8),email:'demo'+(i+1)+'@example.com',phone:'+48 000 000 000',date:'2026-10-'+String(i%9+1).padStart(2,'0'),model:models[i%5],type:i%5===0?'Firma (demo)':'Osoba prywatna'}));
const devices=clients.flatMap((c,i)=>['JW','JZ'].map(type=>({id:'D'+i+type,cid:c.id,client:c.name,city:c.city,model:c.model,serial:'DEMO-'+type+'-'+String(i+1).padStart(5,'0'),date:c.date,type,status:i%5===0?'Do serwisu':'Aktywne'})));
const vehicles=['Doblo 1','Doblo 2','Vivaro','Master','Podnośnik'];
let clientId=clients[0].id,deviceId=devices[0].id,clientSearch='',deviceSearch='',smsSearch='',clientTab='all',smsTab='queue',deviceStatus='Wszystkie',fuelVehicle='Wszystkie',month=9,year=2026,day=9,fuelForm=false,tankStock=3620;
const fuelLog=[{date:'2026-10-08',vehicle:'Doblo 1',litres:51.7,odo:185240},{date:'2026-10-07',vehicle:'Vivaro',litres:69.4,odo:276820},{date:'2026-10-06',vehicle:'Master',litres:77.3,odo:145090},{date:'2026-10-05',vehicle:'Doblo 2',litres:49.5,odo:162170},{date:'2026-10-03',vehicle:'Podnośnik',litres:27.2,odo:8450}];
const head=(name,sub,actions='')=>'<div class="demo-header"><div class="demo-eyebrow">MODUŁ WAWIS · DANE DEMONSTRACYJNE</div><div class="demo-header-line"><div><h2>'+E(name)+'</h2><p>'+E(sub)+'</p></div><div class="demo-actions">'+actions+'</div></div></div>';
const button=(name,action,primary=false)=>'<button type="button" data-demo-action="'+E(action)+'" class="demo-btn '+(primary?'primary':'')+'">'+E(name)+'</button>';
const pill=(name,color='blue')=>'<span class="demo-pill '+E(color)+'">'+E(name)+'</span>';
const search=(text,value,key)=>'<label class="demo-search">⌕ <input data-demo-search="'+E(key)+'" type="search" value="'+E(value)+'" placeholder="'+E(text)+'" aria-label="'+E(text)+'"></label>';
const table=(heads,rows)=>'<div class="demo-table-scroll"><table class="demo-table"><thead><tr>'+heads.map(h=>'<th>'+E(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(c=>'<tr>'+c.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const card=(name,body)=>'<section class="demo-card"><h3>'+E(name)+'</h3>'+body+'</section>';
const field=(name,value)=>'<div class="demo-field"><small>'+E(name)+'</small><strong>'+E(value)+'</strong></div>';
const metrics=items=>'<div class="demo-metrics">'+items.map(([label,v,sub])=>'<div class="demo-metric"><small>'+E(label)+'</small><strong>'+E(v)+'</strong><span>'+E(sub)+'</span></div>').join('')+'</div>';
function contractors(){
 const filtered=clients.filter(c=>[c.name,c.city,c.street,c.email].join(' ').toLowerCase().includes(clientSearch.toLowerCase()));
 const x=clients.find(c=>c.id===clientId)||clients[0];
 const tabs='<div class="demo-tabs">'+[['all','Wszyscy kontrahenci'],['new','Nowy kontrahent'],['import','Import XLSX']].map(([t,n])=>'<button data-demo-tab="'+t+'" class="'+(clientTab===t?'active':'')+'">'+E(n)+'</button>').join('')+'</div>';
 let content;
 if(clientTab==='new'){
 content=card('Nowy kontrahent','<form class="demo-form" id="demo-client-form"><label>Nazwa firmy / osoba kontaktowa<input name="name" required placeholder="Klient demonstracyjny"></label><label>Telefon<input name="phone" value="+48 000 000 000"></label><label>E-mail<input name="email" type="email" placeholder="demo@example.com"></label><label>Miejscowość<input name="city" value="Zawiercie" required></label><label>Ulica i nr domu<input name="street" value="ul. Testowa 1"></label><label>NIP (opcjonalny)<input name="nip"></label><button class="demo-btn primary" type="submit">Dodaj w demonstracji</button></form>');
 }else if(clientTab==='import'){
 content=card('Import kontrahentów XLSX','<p class="demo-muted">W prawdziwej aplikacji import analizuje duplikaty. W laboratorium operacja jest tylko symulowana.</p><div class="demo-upload">⇪ <b>Przeciągnij plik XLSX</b><small>Import plików wyłączony w laboratorium</small></div>'+metrics([['Wiersze','20','Przykładowa analiza'],['Nowe','16','Do importu'],['Duplikaty','3','Do weryfikacji'],['Niepoprawne','1','Do poprawy']]));
 }else{
 content='<div class="demo-split"><section class="demo-card"><div class="demo-card-top"><h3>Lista kontrahentów <small>'+filtered.length+' pozycji</small></h3>'+search('Szukaj po nazwie, mieście, e-mailu',clientSearch,'client')+'</div>'+table(['Kontrahent','Miasto i adres','Telefon','E-mail','Akcje'],filtered.map(c=>['<strong>'+E(c.name)+'</strong><small>'+E(c.type)+'</small>',E(c.city)+'<small>'+E(c.street)+'</small>',E(c.phone),E(c.email),'<button class="demo-link" data-demo-client="'+E(c.id)+'">Szczegóły ›</button>']))+'</section><aside class="demo-card demo-details"><div class="demo-eyebrow">SZCZEGÓŁY KONTRAHENTA</div><h3>'+E(x.name)+'</h3><p class="demo-muted">'+E(x.city)+', '+E(x.street)+'</p><div class="demo-fields">'+field('Typ',x.type)+field('Telefon',x.phone)+field('E-mail',x.email)+field('Miejscowość',x.city)+field('Adres',x.street)+field('NIP','Nie podano')+'</div><h4>Powiązane urządzenia</h4><div class="demo-device-box"><div class="demo-ac"></div><div><b>'+E(x.model)+'</b><small>JW + JZ · data montażu '+E(x.date)+'</small></div></div><div class="demo-detail-actions">'+button('Edytuj (demo)','client-new')+button('Urządzenia','goto-devices',true)+'</div></aside></div>';
 }
 return head('Kontrahenci','Baza klientów, adresy, dane kontaktowe i powiązane montaże.',button('Eksport XLSX (demo)','fake')+button('Nowy kontrahent','client-new',true))+tabs+content;
}
function unitspage(){
 const filtered=devices.filter(d=>(deviceStatus==='Wszystkie'||d.status===deviceStatus)&&[d.client,d.city,d.model,d.serial].join(' ').toLowerCase().includes(deviceSearch.toLowerCase()));
 const x=devices.find(d=>d.id===deviceId)||devices[0];
 return head('Urządzenia','Katalog jednostek JW/JZ, modeli i numerów seryjnych.',button('Import XLSX (demo)','fake')+button('Eksport XLSX (demo)','fake'))+metrics([['Urządzenia',String(devices.length),'Jednostki JW i JZ'],['Aktywne',String(devices.filter(d=>d.status==='Aktywne').length),'W katalogu'],['Do serwisu',String(devices.filter(d=>d.status==='Do serwisu').length),'Do przeglądu'],['Klienci',String(clients.length),'Powiązane']])+
 '<div class="demo-split"><section class="demo-card"><div class="demo-card-top"><h3>Lista urządzeń</h3>'+search('Szukaj klienta, modelu, numeru seryjnego',deviceSearch,'device')+'<select data-demo-select="device-status"><option>Wszystkie</option><option '+(deviceStatus==='Aktywne'?'selected':'')+'>Aktywne</option><option '+(deviceStatus==='Do serwisu'?'selected':'')+'>Do serwisu</option></select></div>'+table(['Klient','Urządzenie','Numer seryjny','Data montażu','Status','Akcje'],filtered.map(d=>['<strong>'+E(d.client)+'</strong><small>'+E(d.city)+'</small>',E(d.model)+'<small>'+E(d.type)+'</small>',E(d.serial),E(d.date),pill(d.status,d.status==='Aktywne'?'green':'amber'),'<button class="demo-link" data-demo-device="'+E(d.id)+'">Szczegóły ›</button>']))+'</section><aside class="demo-card demo-details"><div class="demo-eyebrow">PODGLĄD URZĄDZENIA</div><h3>'+E(x.model)+'</h3><div class="demo-device-box"><div class="demo-ac"></div><div><b>Jednostka '+E(x.type)+'</b><small>'+E(x.serial)+'</small></div></div><div class="demo-fields">'+field('Status',x.status)+field('Klient',x.client)+field('Numer seryjny',x.serial)+field('Rodzaj',x.type)+field('Data montażu',x.date)+field('Miejscowość',x.city)+'</div><h4>Powiązany montaż</h4><p>'+E(x.client)+' · '+E(x.date)+'</p><div class="demo-detail-actions">'+button('Edytuj urządzenie (demo)','fake',true)+'</div></aside></div>';
}
function calendar(jobs){
 const last=new Date(year,month+1,0).getDate(), offset=(new Date(year,month,1).getDay()+6)%7,iso=[year,String(month+1).padStart(2,'0')].join('-');
 const all=jobs.filter(j=>j.date?.slice(0,7)===iso), cells=[];
 for(let i=0;i<offset;i++)cells.push('<span class="demo-day empty"></span>');
 for(let n=1;n<=last;n++){const task=all.filter(j=>Number(j.date.slice(-2))===n);cells.push('<button class="demo-day '+(day===n?'active':'')+'" data-demo-day="'+n+'"><b>'+n+'</b>'+task.slice(0,2).map(j=>'<small>'+E(j.client)+'</small>').join('')+'</button>')}
 const today=all.filter(j=>Number(j.date.slice(-2))===day);
 return head('Kalendarz','Terminy montaży i szczegóły prac w wybranym dniu.',button('Dzisiaj','today',true))+'<div class="demo-split"><section class="demo-card"><div class="demo-cal-title">'+button('‹ Poprzedni','prev')+'<h3>'+E(['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'][month])+' '+year+'</h3>'+button('Następny ›','next')+'</div><div class="demo-calendar">'+['Pon','Wt','Śr','Czw','Pt','Sob','Nd'].map(s=>'<b class="demo-week">'+s+'</b>').join('')+cells.join('')+'</div></section><aside class="demo-card demo-details"><div class="demo-eyebrow">PLAN MONTAŻY</div><h3>'+day+' '+E(['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'][month])+'</h3><p>'+today.length+' montaży w tym dniu</p>'+ (today.length?today.map(j=>'<div class="demo-event"><b>'+E(j.client)+'</b><small>'+E(j.model)+' · '+E(j.city)+'</small>'+pill(j.status,'blue')+'</div>').join(''):'<p class="demo-muted">Brak montaży na ten dzień.</p>')+'</aside></div>';
}
function smspanel(){
 const m=clients.slice(0,14).map((c,i)=>({id:i,name:c.name,city:c.city,model:c.model,due:'2026-10-'+String(10+i).padStart(2,'0'),status:i%5===0?'Niewysłane':i%4===0?'Doręczono':'Oczekuje'}));
 const filtered=m.filter(v=>(smsTab==='queue'||smsTab==='history'||smsTab==='sent'&&v.status==='Doręczono'||smsTab==='unsent'&&v.status==='Niewysłane')&&[v.name,v.model,v.city].join(' ').toLowerCase().includes(smsSearch.toLowerCase()));
 return head('SMS – przypomnienia serwisowe','Kolejka, historia, szablony i statusy wiadomości. Bez wysyłania SMS.',button('Szablony SMS (demo)','fake'))+metrics([['Klienci na liście','14','Kolejka demonstracyjna'],['Wysłane w tym miesiącu','3','Historia próbna'],['Niewysłane','3','Wymagają uwagi'],['Historia','14','Rekordy próbne']])+'<section class="demo-card demo-full"><div class="demo-tabs">'+[['queue','Klienci na liście'],['sent','Wysłane w tym miesiącu'],['unsent','Niewysłane'],['history','Historia']].map(([v,t])=>'<button data-demo-sms="'+v+'" class="'+(smsTab===v?'active':'')+'">'+E(t)+'</button>').join('')+'</div><div class="demo-card-top">'+search('Szukaj klienta, miasta lub modelu',smsSearch,'sms')+pill('Wysyłka wyłączona','amber')+'</div>'+table(['Klient','Urządzenie','Telefon','Termin serwisu','Status','Akcje'],filtered.map(v=>['<strong>'+E(v.name)+'</strong><small>'+E(v.city)+'</small>',E(v.model),'+48 000 000 000',E(v.due),pill(v.status,v.status==='Niewysłane'?'red':v.status==='Doręczono'?'green':'amber'),'<button class="demo-link" data-demo-action="fake">Podgląd ›</button>']))+'<p class="demo-muted demo-inset">Wszystkie numery są fikcyjne. SMSAPI nie jest podłączone.</p></section>';
}
function fuel(role){
 const shown=fuelLog.filter(x=>fuelVehicle==='Wszystkie'||x.vehicle===fuelVehicle);
 return head('Paliwo i tankowania','Tankowania do pełna, zbiornik, flota i historia wpisów.',button('Nowe tankowanie','new-fuel',true))+
 (role==='admin'?'<section class="demo-tank"><small>STAN ZBIORNIKA · TYLKO ADMINISTRATOR</small><h3>Olej napędowy</h3><strong>'+tankStock.toLocaleString('pl-PL')+' l</strong><p>Start: 5 000 litrów · wartości demonstracyjne</p><div class="demo-progress"><span></span></div><div class="demo-tank-foot">Wydano: '+(5000-tankStock).toLocaleString('pl-PL')+' l <span>Pojemność: 5 000 l</span></div></section>':'')+
 '<div class="demo-split demo-fuel-grid"><section class="demo-card"><h3>1. Nowe tankowanie</h3><p class="demo-muted">Pojazd, ilość paliwa i przebieg. Tylko do pełna.</p>'+(fuelForm?'<form id="demo-fuel-form" class="demo-form"><label>Pojazd<select name="vehicle">'+vehicles.map(x=>'<option>'+E(x)+'</option>').join('')+'</select></label><label>Liczba litrów<input type="number" min="1" max="130" step=".1" required name="litres"></label><label>Przebieg w km<input type="number" min="1" required name="odo"></label><label>Data<input name="date" type="date" value="2026-10-09"></label><button type="submit" class="demo-btn primary">Zapisz tylko w demo</button></form>':button('Dodaj tankowanie','new-fuel',true))+'</section>'+card('2. Tankowania według samochodu','<div class="demo-vehicles">'+vehicles.map((v,i)=>'<button data-demo-vehicle="'+E(v)+'"><span>▣</span><b>'+E(v)+'</b><small>'+E(fuelLog[i]?.litres.toLocaleString('pl-PL')||'0')+' l</small></button>').join('')+'</div>')+'</div><section class="demo-card demo-full"><h3>3. Raport miesięczny floty</h3>'+metrics([['Tankowania',String(fuelLog.length),'Październik 2026'],['Zatankowano','275,1 l','Przykładowy raport'],['Pojazdy','5','Flota'],['Metoda','Do pełna','Bez cząstkowych']])+'</section><section class="demo-card demo-full"><div class="demo-card-top"><h3>4. Historia tankowań</h3><select data-demo-select="fuel"><option value="Wszystkie">Wszystkie pojazdy</option>'+vehicles.map(v=>'<option '+(v===fuelVehicle?'selected':'')+'>'+E(v)+'</option>').join('')+'</select></div>'+table(['Data','Pojazd','Litry','Przebieg','Dodał'],shown.map(v=>[E(v.date),'<strong>'+E(v.vehicle)+'</strong>',v.litres.toLocaleString('pl-PL')+' l',v.odo.toLocaleString('pl-PL')+' km','Monter demo']))+'</section>';
}
function centre(jobs){
 return head('Centrum 360','Przegląd statusów, pracy zespołu i nadchodzących montaży.',button('Kalendarz','goto-calendar',true))+metrics([['Montaże',String(jobs.length),'Wszystkie statusy'],['W trakcie',String(jobs.filter(j=>j.status==='W trakcie').length),'W realizacji'],['Zakończone',String(jobs.filter(j=>j.status==='Zakończone').length),'Zrealizowane'],['Kontrahenci',String(clients.length),'Dane testowe']])+'<div class="demo-split"><section class="demo-card"><h3>Montaże w bieżącym tygodniu</h3><div class="demo-bars">'+[38,71,55,93,77,28,46].map((v,i)=>'<div class="demo-baritem"><div class="demo-bar b'+(i+1)+'"></div><small>'+['Pn','Wt','Śr','Cz','Pt','So','Nd'][i]+'</small></div>').join('')+'</div><h3>Status zleceń</h3>'+['Nowe','W trakcie','Zakończone','Niezrealizowane'].map(s=>'<div class="demo-statusline"><span>'+s+'</span>'+pill(String(jobs.filter(j=>j.status===s).length),s==='Zakończone'?'green':'blue')+'</div>').join('')+'</section>'+card('Nadchodzące montaże','<div class="demo-events">'+jobs.slice(0,8).map(j=>'<div><b>'+E(j.client)+'</b><small>'+E(j.date)+' · '+E(j.city)+'</small>'+pill(j.status,'blue')+'</div>').join('')+'</div><h3>Szybkie filtry</h3>'+button('Kontrahenci','goto-contractors')+button('Urządzenia','goto-devices')+button('SMS','goto-sms'))+'</div>';
}
function diagnostics(){
 return head('Diagnostyka','Status techniczny i dziennik zdarzeń — wyłącznie widok graficzny.',button('Odśwież dane (demo)','fake',true))+'<div class="demo-warning"><b>WAWIS DESIGN LAB — diagnostyka demonstracyjna</b><p>Brak prawdziwych odczytów, powiadomień PUSH, dostępu do zdjęć i raportów produkcyjnych.</p></div>'+metrics([['Aplikacja','DEMO','Interfejs dostępny'],['PUSH','OFF','Nie wysyłamy'],['SMS','OFF','Brak integracji'],['Kopie zdjęć','DEMO','Bez Supabase']])+'<div class="demo-split">'+card('Status PUSH zespołu','<p class="demo-muted">Subskrypcja i przyjęcie wiadomości przez dostawcę nie oznaczają jej wyświetlenia na telefonie.</p>'+table(['Użytkownik','Urządzenie','Stan'],['Administrator','Monter A','Monter B','Monter C'].map(x=>[E(x),'iPhone · demo',pill('Nie sprawdzano','amber')])))+card('Ostatnie zdarzenia techniczne — 24 godziny',table(['Godzina','Zdarzenie','Status'],[['08:41','Uruchomienie','Symulacja'],['09:15','Synchronizacja','Wyłączona'],['10:02','Kontrola dostępu','Tryb demo']].map(x=>[E(x[0]),E(x[1]),pill(x[2],'blue')])))+'</div><div class="demo-split">'+card('Cicha diagnostyka urządzeń','<p>Brak potwierdzonych danych z urządzeń — widok demonstracyjny.</p>')+card('Kopie zdjęć i protokołów','<p>Brak połączenia ze Storage. Żadne pliki klientów nie są pobierane.</p>')+'</div>';
}
function render({mode,role,jobs}){
 switch(mode){case 'Kontrahenci':return contractors();case 'Urządzenia':return unitspage();case 'Kalendarz':return calendar(jobs);case 'SMS serwis':return smspanel();case 'Panel paliwa':return fuel(role);case 'Centrum 360':return centre(jobs);case 'Diagnostyka':return diagnostics();default:return '<p>Moduł demonstracyjny.</p>'}
}
function action(b){
 if(b.dataset.demoClient){clientId=b.dataset.demoClient;return 'render'}
 if(b.dataset.demoDevice){deviceId=b.dataset.demoDevice;return 'render'}
 if(b.dataset.demoTab){clientTab=b.dataset.demoTab;return 'render'}
 if(b.dataset.demoSms){smsTab=b.dataset.demoSms;return 'render'}
 if(b.dataset.demoDay){day=Number(b.dataset.demoDay);return 'render'}
 if(b.dataset.demoVehicle){fuelVehicle=b.dataset.demoVehicle;return 'render'}
 const a=b.dataset.demoAction;if(!a)return '';
 if(a==='client-new'){clientTab='new';return 'render'}
 if(a==='new-fuel'){fuelForm=!fuelForm;return 'render'}
 if(a==='prev'){month--;if(month<0){month=11;year--}day=1;return 'render'}
 if(a==='next'){month++;if(month>11){month=0;year++}day=1;return 'render'}
 if(a==='today'){month=9;year=2026;day=9;return 'render'}
 if(a.startsWith('goto-'))return a;
 return 'toast';
}
function searchChange(kind,value){if(kind==='client')clientSearch=value;if(kind==='device')deviceSearch=value;if(kind==='sms')smsSearch=value}
function selectChange(kind,value){if(kind==='device-status')deviceStatus=value;if(kind==='fuel')fuelVehicle=value}
function form(event){
 if(event.target.id==='demo-client-form'){
 const d=Object.fromEntries(new FormData(event.target).entries());
 const x={id:'DEMO-NEW',name:d.name,city:d.city,street:d.street,phone:d.phone,email:d.email,date:'2026-10-09',model:'Brak urządzenia',type:'Osoba prywatna'};clients.unshift(x);clientId=x.id;clientTab='all';return true;
 }
 if(event.target.id==='demo-fuel-form'){
 const d=Object.fromEntries(new FormData(event.target).entries());fuelLog.unshift({date:d.date,vehicle:d.vehicle,litres:+d.litres,odo:+d.odo});tankStock=Math.max(0,tankStock-(+d.litres));fuelForm=false;return true;
 }
 return false;
}
return{render,action,searchChange,selectChange,form};
})();