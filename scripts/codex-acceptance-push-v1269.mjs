import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transform } from 'esbuild';

const raw=fs.readFileSync(new URL('../supabase/functions/send-assignment-push/index.ts',import.meta.url),'utf8');
const source=raw.replace(/^import \{ createClient \} from "npm:[^"]+";?\s*$/m,'')
 .replace(/^import webpush from "npm:[^"]+";?\s*$/m,'');
assert(!source.includes('import {')&&!source.includes('import webpush'),'Mock imports must be fully removed');
const compiled=(await transform(source,{loader:'ts',target:'es2022',format:'iife'})).code;
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const assigned='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const other='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const jobId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const subId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function buildScenario({recipient=assigned, installers=[assigned], main=assigned, role='Pracownik', logFails=false, active=true}={}){
 let registered=null, sent=0, lastReceipts=[];
 const claims=new Set();
 const sub={id:subId,user_id:recipient,endpoint:'https://push.test/endpoint',p256dh:'test-p256dh',auth:'test-auth',ownership_generation:1,lifecycle_token:'one',is_active:active};
 const profile={id:admin,role:'Administrator',full_name:'Admin'};
 const job={id:jobId,client:'Klient testowy',title:'Klient testowy',city:'Zawiercie',street:'Testowa 2',status:'W trakcie',installation_date:'2099-01-01',created_at:'2026-10-08T08:00:00Z',created_by:admin,installer_ids:installers,main_technician_id:main,push_assignment_epoch:1};
 const roles=new Map([[assigned,'Pracownik'],[other,role],[admin,'Administrator']]);
 const db={
   from(table){
     const filters={};
     const q={
       select(){return q;},
       eq(key,val){filters[key]=val;return q;},
       in(key,values){filters[key]=values;return q;},
       gte(){return q;},
       async single(){
         if(table==='profiles')return {data:profile,error:null};
         if(table==='jobs')return {data:job,error:null};
         if(table==='push_delivery_log'&&filters.id)return {data:{id:filters.id},error:null};
         return {data:null,error:new Error('Unexpected single '+table)};
       },
       async maybeSingle(){
         if(table==='jobs')return {data:job,error:null};
         return {data:null,error:null};
       },
       insert(row){
         return {
           select(){return this;},
           async single(){return logFails ? {data:null,error:{message:'log error'}}:{data:{id:'ffffffff-ffff-4fff-8fff-ffffffffffff'},error:null};},
           then(onFulfilled,onRejected){return Promise.resolve({data:null,error:null}).then(onFulfilled,onRejected);}
         };
       },
       update(){return q;},
       then(onFulfilled,onRejected){
         let result;
         if(table==='push_subscriptions')result={data:(active&&filters.user_id?.includes(recipient))?[sub]:[],error:null};
         else if(table==='profiles'){
           const selected=filters.id || [];
           result={data:selected.map(id=>({id,role:roles.get(id) || 'Oczekujący'})),error:null};
         }
         else if(table==='push_delivery_log')result={data:[],error:null};
         else result={data:[],error:null};
         return Promise.resolve(result).then(onFulfilled,onRejected);
       }
     };
     return q;
   },
   async rpc(name,params){
     if(name!=='push_claim_delivery_v1268')throw new Error('unexpected RPC '+name);
     const key=params.p_subscription_id+':'+params.p_event_key;
     if(!active||params.p_recipient_user_id!==recipient||claims.has(key))return {data:false,error:null};
     claims.add(key);
     return {data:true,error:null};
   }
 };
 const sandbox={
   createClient(_url,key){return key==='anon'?{auth:{async getUser(){return {data:{user:{id:admin}},error:null};}}}:db;},
   webpush:{setVapidDetails(){},async sendNotification(){sent++;return {statusCode:201};}},
   Deno:{serve(fn){registered=fn;},env:{get(k){return ({
     SUPABASE_URL:'https://fake.supabase.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',
     WEB_PUSH_VAPID_PUBLIC_KEY:'test',WEB_PUSH_VAPID_PRIVATE_KEY:'test',
     WEB_PUSH_VAPID_SUBJECT:'mailto:push@test.local'})[k] || '';}}},
   URL,URLSearchParams,Request,Response,Headers,AbortController,DOMException,
   setTimeout,clearTimeout,console,JSON,Array,String,Boolean,Object,Number,Intl,Date,encodeURIComponent,
   crypto:globalThis.crypto,TextEncoder,btoa,atob,
 };
 vm.runInNewContext(compiled,sandbox,{timeout:3500,filename:'send-assignment-push.ts'});
 assert.equal(typeof registered,'function');
 return {async invoke(user=recipient){
   const result=await registered(new Request('https://edge.test', {method:'POST',headers:{Authorization:'Bearer token','content-type':'application/json'},
     body:JSON.stringify({jobId,assignedUserIds:[user],triggeredBy:'assignment'})}));
   return {status:result.status,body:await result.json()};
 },get sent(){return sent;},get claims(){return claims.size;}};
}

const foreign=buildScenario();
let response=await foreign.invoke(other);
assert.equal(response.status,409,'P1-05: foreign recipient rejected');
assert.equal(foreign.sent,0,'P1-05: foreign recipient caused zero provider calls');
console.log('PASS CODEX P1-05: foreign recipient rejected without transport');

const valid=buildScenario();
response=await valid.invoke(assigned);
assert.equal(response.status,200,'Assigned installer must be notified');
assert.equal(valid.sent,1,'Positive assigned installer transport');
console.log('PASS CODEX P1-05: valid recipient');

const simultaneous=buildScenario();
const concurrent=await Promise.all([simultaneous.invoke(assigned),simultaneous.invoke(assigned)]);
assert(concurrent.every(x=>x.status===200));
assert.equal(simultaneous.sent,1,'P1-06: parallel callers must only send once');
assert.equal(simultaneous.claims,1);
console.log('PASS CODEX P1-06: parallel invocation, one transport');

const invalidRole=buildScenario({recipient:other,installers:[other],main:other,role:'Oczekujący'});
response=await invalidRole.invoke(other);
assert([403,409].includes(response.status),'P1-05: inactive role must be rejected');
assert.equal(invalidRole.sent,0,'inactive recipient role must not be notified');
console.log('PASS CODEX P1-05: disabled staff role');

const legacy=buildScenario({installers:null,main:assigned});
response=await legacy.invoke(assigned);
assert.equal(response.status,409,'P1-05 legacy NULL installer list must require explicit confirmation');
assert.equal(legacy.sent,0,'P1-05 legacy NULL cannot send');
console.log('PASS CODEX P1-05: legacy NULL');

const failedLog=buildScenario({logFails:true});
response=await failedLog.invoke(assigned);
assert.equal(failedLog.sent,0,'P1-06 failed INSERT must fail closed, no Web Push');
assert.equal(response.body.failed,1);
console.log('PASS CODEX P1-06: failed log blocks transport');
