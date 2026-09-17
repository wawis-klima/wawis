import React from 'react';
import {createRoot} from 'react-dom/client';
import FuelPanel from '../../../src/components/fuel/FuelPanelBase.jsx';

// Only transport is controlled. React, durable storage and addFuelEntry are real.
export function mountFuelHarness(owner='A') {
  const host=document.createElement('div');host.id='audit-fuel';document.body.replaceChildren(host);
  const root=createRoot(host);const inserts=[];const listeners=new Set();let userId=owner;
  const supabase={auth:{
    getSession:async()=>({data:{session:{user:{id:userId}}}}),
    onAuthStateChange(fn){listeners.add(fn);return {data:{subscription:{unsubscribe(){listeners.delete(fn);}}}};},
  },from(table){
    let insert=null,single=false;
    return {select(){return this;},order(){return this;},limit(){return this;},eq(){return this;},
      insert(value){insert=value;return this;},single(){single=true;return this;},maybeSingle(){single=true;return this;},
      then(resolve){
        if(insert){inserts.push(insert);return resolve({data:null,error:new Error('CONTROLLED pending transport')});}
        return resolve({data:table==='fuel_vehicles'?[{id:'car',registration_number:'TEST',is_active:true}]:single?null:[],error:null});
      },
    };
  }};
  const logDiagnostic=()=>{};
  const render=()=>root.render(<FuelPanel key={userId} userId={userId} isAdmin supabase={supabase} logDiagnostic={logDiagnostic}/>);
  render();
  return {inserts,account(id){for(const fn of listeners)fn('SIGNED_OUT',null);userId=id;render();},unmount(){root.unmount();}};
}
