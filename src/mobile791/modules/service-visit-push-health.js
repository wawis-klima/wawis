// 13.93: przed wydarzeniem PUSH z aktywnego iPhone'a odświeżamy bezpieczny
// kontekst SW (użytkownik + generacja endpointu). Nie wymuszamy uprawnień.
export async function refreshServicePushContext({ supabase, userId }) {
  if (!supabase || !userId || typeof window === 'undefined') return false;
  try {
    const setting=window.localStorage.getItem('wawis:push-enabled:v1097:'+userId);
    if (setting==='0' || setting==='false') return false;
    const { getPushStatus }=await import('./push-subscriptions.js');
    const status=await getPushStatus({supabase,sessionUser:{id:userId},allowAutoRepair:true});
    return status?.ready===true;
  } catch (_error) {
    // Awaria PUSH nie może uniemożliwiać umówienia lub zakończenia serwisu.
    return false;
  }
}
