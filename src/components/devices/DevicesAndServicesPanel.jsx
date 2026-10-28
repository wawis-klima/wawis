import React,{Suspense,useState} from 'react';
import {lazy} from '../../modules/lazy-safe.jsx';
const DevicesPanel=lazy(()=>import('./DevicesPanel.jsx'));
const ServiceAdminPanel=lazy(()=>import('../../mobile791/components/devices/ServiceAdminPanel.jsx'));

export default function DevicesAndServicesPanel({
 supabase,isAdmin,userId,...deviceProps
}) {
 const [tab,setTab]=useState('catalog');
 if(!isAdmin)return null;
 return <div className="desktopModuleShell">
   <div className="card premiumCard" style={{display:'flex',flexWrap:'wrap',gap:8,padding:12,marginBottom:10}}>
     <button className={tab==='catalog'?'btn primary':'btn secondary'} onClick={()=>setTab('catalog')}>Katalog urządzeń</button>
     <button className={tab==='services'?'btn primary':'btn secondary'} onClick={()=>setTab('services')}>Przeglądy serwisowe</button>
   </div>
   <Suspense fallback={<div className="card">Otwieram moduł urządzeń…</div>}>
     {tab==='catalog' ?
       <DevicesPanel {...deviceProps} supabase={supabase} isAdmin={isAdmin} userId={userId}/>
       : <ServiceAdminPanel key={userId||'admin'} supabase={supabase} isAdmin={isAdmin}
          userId={userId}/>}
   </Suspense>
 </div>;
}
