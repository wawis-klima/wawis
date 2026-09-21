import React from 'react';
import {createRoot} from 'react-dom/client';
import DevicesPanel from '../../../src/components/devices/DevicesPanel.jsx';
export function mountDevicesHarness(){
 const host=document.createElement('div');host.id='audit-devices';document.body.replaceChildren(host);
 const root=createRoot(host);const pending=[];const listeners=new Set();
 const supabase={auth:{onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};}},rpc(name){if(name==='admin_list_devices_with_contractor')return new Promise((resolve,reject)=>pending.push({resolve,reject}));return Promise.resolve({data:[],error:null});}};
 let userId='A';let revision=0;
 const render=()=>root.render(<DevicesPanel key={userId} userId={userId} isAdmin supabase={supabase} jobs={[]} refreshAll={()=>{}} />);
 render();
 return {pending,render,resolve(index,label){pending[index].resolve({data:[{id:label,model:label,contractor_name:'Fixture',status:'aktywne'}],error:null});},reject(index){pending[index].reject(new Error('STALE ERROR'));},account(id){userId=id;render();},logout(){for(const fn of listeners)fn('SIGNED_OUT',null);},unmount(){root.unmount();}};
}
