import assert from 'node:assert/strict';import {addFuelEntry} from '../../src/modules/fuel.js';
const A='00000000-0000-4000-8000-000000000001',id1='00000000-0000-4000-8000-000000000002',id2='00000000-0000-4000-8000-000000000003';
const rows=new Map();let inserts=0;
const supabase={auth:{getSession:async()=>({data:{session:{user:{id:A}}}})},from(){let id,patch;return {select(){return this;},eq(k,v){if(k==='id')id=v;return this;},insert(p){patch=p;return this;},limit(){return this;},maybeSingle(){return this;},single(){return this;},then(resolve){if(patch){if(rows.has(patch.id))return resolve({error:{code:'23505',message:'duplicate'}});rows.set(patch.id,patch);inserts++;return resolve({data:patch,error:null});}resolve({data:rows.get(id)||null,error:null});}};}};
const args={supabase,ownerUserId:A,vehicleId:'car',liters:40,odometerKm:12000,entryId:id1};
await addFuelEntry(args);await addFuelEntry(args);assert.equal(inserts,1,'retry shares one INSERT');
await addFuelEntry({...args,entryId:id2});assert.equal(inserts,2,'independent identical real fill remains distinct');
const id3='00000000-0000-4000-8000-000000000004';await Promise.all([addFuelEntry({...args,entryId:id3}),addFuelEntry({...args,entryId:id3})]);assert.equal(inserts,3,'concurrent same operation reconciles unique row');
console.log('A06 real module retry/concurrent same ID and distinct identical fills PASS');
