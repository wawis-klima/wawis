// Two genuine PostgreSQL sessions in the isolated Docker fixture, no production.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const exec=promisify(execFile);
export async function runDeviceCasRace() {
 const env={...process.env};
 for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
 const query=async sql=>(await exec('docker',['--host=unix:///var/run/docker.sock','exec','wawis-offline-fixture-pg','psql','-U','postgres','-At','-v','ON_ERROR_STOP=1','-c',sql],{env})).stdout;
 const job=randomUUID();
 await query(`insert into public.jobs(id,user_id) values('${job}','11111111-1111-4111-8111-111111111111')`);
 const sessions=await Promise.all(['A','B'].map(async worker=>{
  const output=await query(`begin; select 'pid='||pg_backend_pid();
with changed as(update public.jobs set device_model='RACE-${worker}',device_serial_number='RACE-${job}-${worker}' where id='${job}' and device_model is null returning id)
select 'winner='||count(*) from changed; select pg_sleep(0.2); commit;`);
  return {worker,pid:Number(output.match(/pid=(\d+)/)?.[1]),winner:Number(output.match(/winner=(\d+)/)?.[1])};
 }));
 const state=JSON.parse((await query(`select json_build_object('model',device_model,'devices',(select count(*) from public.devices where source_job_id='${job}')) from public.jobs where id='${job}'`)).trim());
 return {sessions,state};
}
