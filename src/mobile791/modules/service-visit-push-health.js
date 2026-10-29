// Diagnostyka kontekstu PUSH na AKTYWNYM urządzeniu; bez osłabiania izolacji kont.
import { readPushServiceWorkerContext } from './push-lifecycle-v1078.js';

export async function refreshServicePushContext({supabase,userId}){
  if(!supabase || !userId || typeof window==='undefined')return false;
  try{
    const setting=window.localStorage.getItem('wawis:push-enabled:v1097:'+userId);
    if(setting==='0' || setting==='false')return false;
    const {getPushStatus}=await import('./push-subscriptions.js');
    const status=await getPushStatus({supabase,sessionUser:{id:userId},allowAutoRepair:true});
    if(!status?.ready)return false;
    const registration=await navigator.serviceWorker.ready;
    const active=await registration.pushManager.getSubscription();
    if(!active?.endpoint)return false;
    const {data,error}=await supabase.from('push_subscriptions')
      .select('ownership_generation,is_active').eq('user_id',userId)
      .eq('endpoint',active.endpoint).maybeSingle();
    if(error || !data?.is_active)return false;
    let context=await readPushServiceWorkerContext();
    const matches=()=>context?.userId===userId && Number(context?.generation)>0
      && Number(context.generation)===Number(data.ownership_generation);
    if(matches())return true;
    // Generacja endpointu i kontekst SW mogą rozjechać się po aktualizacji PWA.
    // Resynchronizacja wyłącznie bezpiecznym istniejącym API sesji; nigdy nie omija guard.
    const {savePushSubscription}=await import('./push-subscriptions.js');
    await savePushSubscription({supabase,sessionUser:{id:userId},subscription:active,force:true});
    context=await readPushServiceWorkerContext();
    const latest=await supabase.from('push_subscriptions')
      .select('ownership_generation,is_active').eq('user_id',userId)
      .eq('endpoint',active.endpoint).maybeSingle();
    return !latest.error && latest.data?.is_active===true && context?.userId===userId
      && Number(context?.generation)>0
      && Number(context.generation)===Number(latest.data.ownership_generation);
  }catch(_error){return false;}
}
