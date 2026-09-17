import assert from 'node:assert/strict';import fs from 'node:fs';import {randomUUID} from 'node:crypto';
import {database,evidence} from './staging-common.mjs';
const actors=JSON.parse(fs.readFileSync(process.env.WAWIS_STAGING_ACTORS));
const [s,d,o]=await Promise.all([database(),database(),database()]);const checks=[];const waits=[];
const job=actors.fixture.job;let log,provider;
async function seed(){log=randomUUID();provider='audit-'+log;await o.query("insert into sms_log(id,job_id,phone,message,provider_message_id,status) values($1,$2,'000000000','audit only',$3,'queued')",[log,job,provider]);await o.query("update jobs set last_sms_status='queued' where id=$1",[job]);}
const rpc=(c,status)=>c.query('select public.apply_sms_delivery_atomic($1,$2,null)',[provider,status]);
async function state(){return (await o.query('select l.status,j.last_sms_status,j.last_sms_log_id from sms_log l join jobs j on j.id=l.job_id where l.id=$1',[log])).rows[0];}
async function blocked(pid){for(let i=0;i<100;i++){const r=(await o.query('select wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1',[pid])).rows[0];if(r?.wait_event_type==='Lock'&&r.blockers.length){waits.push(r);return;}await new Promise(r=>setTimeout(r,30));}throw new Error('No real lock contention observed');}
try{
 for(const c of [s,d,o])await c.query("select set_config('request.jwt.claim.role','service_role',false)");
 for(const c of [s,d])await c.query('set role service_role');
 for(const c of [s,d])await c.query("set lock_timeout='8s'");
 await seed();await s.query('begin');assert.equal((await s.query('select status from sms_log where id=$1',[log])).rows[0].status,'queued');await rpc(d,'delivered');await rpc(s,'provider_sent');await s.query('commit');assert.equal((await state()).status,'delivered');assert.equal((await state()).last_sms_status,'delivered');checks.push('SENT read paused, DELIVERED committed, resumed SENT cannot regress');
 for(const [first,second] of [['delivered','provider_sent'],['provider_sent','delivered']]){
  await seed();await d.query('begin');await rpc(d,first);const pid=(await s.query('select pg_backend_pid() pid')).rows[0].pid;const pending=rpc(s,second);await blocked(pid);await d.query('commit');await pending;const r=await state();assert.equal(r.status,'delivered');assert.equal(r.last_sms_status,'delivered');checks.push(`${first} lock holder, ${second} blocked and resumed: both rows delivered`);
 }
 await seed();const oldProvider=provider;await s.query('begin');await s.query('select status from sms_log where id=$1',[log]);await seed();await s.query('select public.apply_sms_delivery_atomic($1,$2,null)',[oldProvider,'delivered']);await s.query('commit');const r=await state();assert.equal(r.last_sms_log_id,log);assert.equal(r.last_sms_status,'queued');assert.equal(r.status,'queued');checks.push('new send pointer unchanged by old callback');
 evidence('staging-sms-race',{checks,waits,independentConnections:3});console.log('STAGING SMS PASS',checks);
}finally{await Promise.all([s.query('rollback'),d.query('rollback')]);await Promise.all([s.end(),d.end(),o.end()]);}
