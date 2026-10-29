import { createClient } from "npm:@supabase/supabase-js@2.105.4";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function reply(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
}
function secret(name:string,fallback:string){
  const direct=Deno.env.get(name)||"";
  if(direct)return direct;
  try {
    const x=JSON.parse(Deno.env.get(fallback)||"{}");
    return String(x.default||Object.values(x)[0]||"");
  }catch{return "";}
}
// This is intentionally the only permanent-delete entrypoint.
// Never expose the service-role credential or grant destructive Storage permissions to browser users.
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(request.method!=="POST")return reply({error:"Dozwolone tylko POST."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const anon=secret("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
    const serviceKey=secret("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
    if(!url||!anon||!serviceKey)return reply({error:"Brak konfiguracji serwera."},503);
    const authorization=request.headers.get("Authorization")||"";
    if(!/^Bearer\s+\S+$/.test(authorization))return reply({error:"Zaloguj się ponownie."},401);
    const session=createClient(url,anon,{global:{headers:{Authorization:authorization}},
      auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error:identityError}=await session.auth.getUser();
    if(identityError||!identity.user)return reply({error:"Sesja wygasła."},401);
    const {data:profile,error:profileError}=await admin.from("profiles")
      .select("role").eq("id",identity.user.id).maybeSingle();
    if(profileError||profile?.role!=="Administrator")
      return reply({error:"Tylko administrator może nieodwracalnie usunąć serwis."},403);

    const body=await request.json().catch(()=>({})) as {visitId?:string,confirmation?:string};
    const visitId=String(body.visitId||"").trim();
    if(!uuid.test(visitId)||body.confirmation!=="PERMANENT_DELETE")
      return reply({error:"Nieprawidłowe lub niepotwierdzone usunięcie."},400);
    const actor=identity.user.id;
    const {data:paths,error:prepareError}=await admin.rpc("service_visit_purge_prepare_v1395",{
      p_visit_id:visitId,p_actor_id:actor,
    });
    if(prepareError || !Array.isArray(paths))
      return reply({error:prepareError?.message||"Nie udało się rozpocząć bezpiecznego usuwania."},409);
    // The database is the source of truth for every Storage object, including orphan uploads.
    // Never accept arbitrary file paths from browser input.
    const prefix=visitId+"/";
    if(paths.length>5000 || paths.some(p=>typeof p!=="string" || !p.startsWith(prefix)))
      return reply({error:"Nieprawidłowy zakres plików; operacja wstrzymana."},409);
    for(let index=0;index<paths.length;index+=100){
      const batch=paths.slice(index,index+100);
      const {error}=await admin.storage.from("service-visit-files").remove(batch);
      if(error)return reply({error:"Nie usunięto wszystkich plików. Serwis pozostał w koszu. Ponów operację."},503);
    }
    const {data:remaining,error:verifyError}=await admin.rpc("service_visit_purge_prepare_v1395",{
      p_visit_id:visitId,p_actor_id:actor,
    });
    if(verifyError || !Array.isArray(remaining) || remaining.length!==0)
      return reply({error:"Nie potwierdzono usunięcia plików ze Storage. Serwis pozostał w koszu. Ponów operację."},503);
    // Transactional database deletion verifies the Storage bucket is empty for this exact visit.
    const {data:deleted,error:finalizeError}=await admin.rpc("service_visit_purge_finalize_v1395",{
      p_visit_id:visitId,p_actor_id:actor,
    });
    if(finalizeError || deleted!==true)
      return reply({error:"Nie zakończono usuwania wpisów z bazy. Serwis pozostał w koszu. Ponów operację."},409);
    return reply({ok:true,deleted:true});
  }catch(error){
    console.error("service_permanent_purge_error",error instanceof Error?error.message:String(error));
    return reply({error:"Nie udało się dokończyć operacji. Sprawdź kosz i ponów w razie potrzeby."},500);
  }
});
