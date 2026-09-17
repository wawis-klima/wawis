import assert from 'node:assert/strict';
import {addFuelEntry} from '../../src/modules/fuel.js';
let inserts=0;let payload;
const supabase={auth:{getSession:async()=>({data:{session:{user:{id:'B'}}}})},from(){return {insert(value){payload=value;inserts++;return this;},select(){return this;},single:async()=>({data:payload,error:null})};}};
await assert.rejects(addFuelEntry({supabase,ownerUserId:'A',vehicleId:'car',liters:40,odometerKm:12000}),/właściciel|sesj/i);
assert.equal(inserts,0);
console.log('Fuel switched account rejects before INSERT PASS');

