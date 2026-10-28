import { createClient } from "npm:@supabase/supabase-js@2.105.4";

type Body = { visitId?: string; protocolId?: string; protocolStoragePath?: string; recipientEmail?: string; requestKey?: string };
const FROM = "biuro@wawis.pl";
const MAX_BYTES = 10 * 1024 * 1024;
const CORS = {
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
function reply(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{...CORS,"Content-Type":"application/json; charset=utf-8"}});
}
const str=(v:unknown)=>String(v||"").trim();
const email=(v:unknown)=>str(v).toLowerCase();
const isUuid=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const validEmail=(v:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
function key(name:string,fallback:string) {
  const legacy=Deno.env.get(name)||"";
  if(legacy)return legacy;
  try {
    const dict=JSON.parse(Deno.env.get(fallback)||"{}") as Record<string,string>;
    return str(dict.default||Object.values(dict)[0]);
  }catch{return "";}
}
function b64(bytes:Uint8Array){
  const chunks:string[]=[];
  for(let i=0;i<bytes.length;i+=0x8000)chunks.push(String.fromCharCode(...bytes.subarray(i,i+0x8000)));
  return btoa(chunks.join(""));
}
function safeFile(v:unknown){
  const n=str(v).replace(/[\\/:*?"<>|\r\n]+/g,"-").slice(0,180);
  return n.toLowerCase().endsWith(".pdf")?n:(n||"protokol-serwisowy")+".pdf";
}
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(request.method!=="POST")return reply({error:"Dozwolone tylko POST."},405);
  try{
    const url=Deno.env.get("SUPABASE_URL")||"";
    const anon=key("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
    const secret=key("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
    const resend=Deno.env.get("RESEND_API_KEY")||"";
    if(!url||!anon||!secret||!resend)return reply({error:"Brak konfiguracji bezpiecznej wysyłki serwisu."},503);
    const auth=request.headers.get("Authorization")||"";
    if(!auth.startsWith("Bearer "))return reply({error:"Zaloguj się ponownie."},401);
    const user=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:identity,error:authError}=await user.auth.getUser();
    if(authError||!identity.user)return reply({error:"Sesja wygasła."},401);
    const {data:profile,error:profileError}=await admin.from("profiles").select("role").eq("id",identity.user.id).maybeSingle();
    if(profileError||profile?.role!=="Administrator")return reply({error:"Tylko administrator może wysłać protokół."},403);
    const body=await request.json() as Body;
    const visitId=str(body.visitId),protocolId=str(body.protocolId),requestKey=str(body.requestKey);
    const recipient=email(body.recipientEmail);
    if(!isUuid(visitId)||!isUuid(protocolId)||!isUuid(requestKey)||!validEmail(recipient))
      return reply({error:"Nieprawidłowe dane protokołu lub odbiorcy."},400);
    const {data:visit,error:visitError}=await admin.from("service_visits")
      .select("id,status,client:contractors(company_name,contact_person,street,city,email)")
      .eq("id",visitId).maybeSingle();
    if(visitError||!visit||visit.status!=="wykonany")return reply({error:"Wizyta nie jest zakończona."},400);
    const client=Array.isArray(visit.client)?visit.client[0]:visit.client;
    if(!validEmail(email(client?.email))||recipient!==email(client?.email))
      return reply({error:"Wyślij tylko na prawidłowy adres klienta zapisany w WAWIS."},403);
    const {data:protocol,error:protocolError}=await admin.from("service_visit_protocols")
      .select("id,service_visit_id,storage_path,file_name,file_size_bytes")
      .eq("id",protocolId).eq("service_visit_id",visitId).maybeSingle();
    if(protocolError||!protocol)return reply({error:"Nie znaleziono podpisanego PDF."},404);
    if(str(body.protocolStoragePath)!==protocol.storage_path)return reply({error:"PDF uległ zmianie. Odśwież wizytę."},409);
    if(!protocol.file_size_bytes||protocol.file_size_bytes>MAX_BYTES)return reply({error:"Nieprawidłowy rozmiar PDF."},400);
    const {data:existing}=await admin.from("service_visit_protocol_email_log")
      .select("request_key,service_visit_id,protocol_id,recipient_email,status,provider_message_id")
      .eq("request_key",requestKey).maybeSingle();
    if(existing){
      if(existing.service_visit_id!==visitId||existing.protocol_id!==protocolId||email(existing.recipient_email)!==recipient){
        return reply({error:"Identyfikator wysyłki należy do innej wiadomości."},409);
      }
      if(existing.status==="sent")return reply({status:"sent",recipientEmail:recipient,requestKey,alreadySent:true});
      return reply({error:"Wysyłka ma nieustalony wynik. Sprawdź historię przed kolejną próbą.",pending:true,requestKey},409);
    }
    const cutoff=new Date(Date.now()-30000).toISOString();
    const {data:recent}=await admin.from("service_visit_protocol_email_log")
      .select("id").eq("protocol_id",protocolId).eq("recipient_email",recipient)
      .in("status",["sending","sent"]).gte("created_at",cutoff).limit(1);
    if(recent?.length)return reply({error:"Wysłano niedawno albo wynik jest niepewny. Odczekaj i sprawdź historię.",pending:true},429);
    const {data:entry,error:insertError}=await admin.from("service_visit_protocol_email_log")
      .insert({request_key:requestKey,service_visit_id:visitId,protocol_id:protocolId,
        recipient_email:recipient,sender_email:FROM,status:"sending",sent_by:identity.user.id})
      .select("id").single();
    if(insertError||!entry)return reply({error:"Nie udało się zarejestrować wysyłki. Spróbuj sprawdzić jej stan."},409);
    try {
      const {data:blob,error:downloadError}=await admin.storage.from("service-visit-files").download(protocol.storage_path);
      if(downloadError||!blob)throw new Error("Nie pobrano podpisanego PDF.");
      const bytes=new Uint8Array(await blob.arrayBuffer());
      if(!bytes.length||bytes.length>MAX_BYTES||String.fromCharCode(...bytes.subarray(0,4))!=="%PDF")
        throw new Error("Nieprawidłowy podpisany PDF.");
      const senderController=new AbortController();
      const timeout=setTimeout(()=>senderController.abort(),12000);
      let response:Response;
      try{
        response=await fetch("https://api.resend.com/emails",{
          method:"POST",
          headers:{
            Authorization:"Bearer "+resend,
            "Content-Type":"application/json",
            "Idempotency-Key":"wawis-serwis-"+requestKey,
          },
          signal:senderController.signal,
          body:JSON.stringify({
            from:"WAWIS Klimatyzacja <"+FROM+">",reply_to:FROM,to:[recipient],
            subject:"Protokół przeglądu klimatyzacji – "+str(client?.company_name||client?.contact_person||"Klient"),
            text:"Dzień dobry,\n\nw załączniku przesyłamy podpisany protokół przeglądu klimatyzacji.\n\nPozdrawiamy,\nWAWIS Chłodnictwo i Klimatyzacja\nPiotr Wasik\n"+FROM,
            attachments:[{filename:safeFile(protocol.file_name),content:b64(bytes)}],
            tags:[{name:"source",value:"wawis_service_visit"},{name:"visit_id",value:visitId}],
          }),
        });
      }finally{clearTimeout(timeout);}
      const responseData=await response.json().catch(()=>({})) as {id?:string,message?:string};
      if(!response.ok){
        if(response.status===429||response.status>=500)return reply({error:"Dostawca nie potwierdził wyniku. Nie wysyłaj ponownie bez sprawdzenia.",pending:true,requestKey},503);
        await admin.from("service_visit_protocol_email_log").update({status:"error",error_message:str(responseData.message||response.status).slice(0,1000)}).eq("id",entry.id);
        return reply({error:"Serwer pocztowy odrzucił wiadomość."},422);
      }
      if(!responseData.id)return reply({error:"Dostawca nie potwierdził identyfikatora wiadomości.",pending:true,requestKey},503);
      const {error:markError}=await admin.from("service_visit_protocol_email_log")
        .update({status:"sent",provider_message_id:responseData.id,sent_at:new Date().toISOString(),error_message:null})
        .eq("id",entry.id);
      if(markError)return reply({error:"Wiadomość przyjęta, ale zapis statusu jest niepewny. Nie wysyłaj ponownie.",pending:true,requestKey},503);
      return reply({status:"sent",recipientEmail:recipient,requestKey});
    }catch(error){
      await admin.from("service_visit_protocol_email_log")
        .update({error_message:("Nieustalony wynik: "+str(error instanceof Error?error.message:error)).slice(0,1000)})
        .eq("id",entry.id);
      return reply({error:"Nie można potwierdzić wyniku wysyłki. Nie wysyłaj ponownie bez sprawdzenia.",pending:true,requestKey},504);
    }
  }catch(error){
    return reply({error:"Wystąpił błąd wysyłki protokołu serwisowego.",detail:error instanceof Error?error.message:""},500);
  }
});
