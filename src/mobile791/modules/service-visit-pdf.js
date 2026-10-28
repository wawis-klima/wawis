import regularFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans.ttf?url';
import boldFontUrl from 'dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf?url';
import { PROTOCOL_COMPANY, getContainedSignatureSize } from './job-protocol-pdf.js';
import { SERVICE_VISIT_CHECKS } from './service-visit-checklist.js';

const FONT = 'DejaVuSans';
const M = 20, W = 595.28, H = 841.89, RIGHT = W-M, CONTENT = W-2*M;
let fontPromise;
function formatDate(value) {
  if(!value)return '-';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('pl-PL',{timeZone:'Europe/Warsaw',day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
}
async function base64Font(url) {
  const res=await fetch(url);
  if(!res.ok) throw new Error('Nie udało się załadować czcionki protokołu.');
  const bytes=new Uint8Array(await res.arrayBuffer());
  const parts=[];for(let i=0;i<bytes.length;i+=0x8000)parts.push(String.fromCharCode(...bytes.subarray(i,i+0x8000)));
  return btoa(parts.join(''));
}
async function fonts(doc) {
  fontPromise ||= Promise.all([base64Font(regularFontUrl),base64Font(boldFontUrl)]);
  const [regular,bold]=await fontPromise;
  doc.addFileToVFS('DejaVuSans.ttf',regular);doc.addFont('DejaVuSans.ttf',FONT,'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf',bold);doc.addFont('DejaVuSans-Bold.ttf',FONT,'bold');
  doc.setFont(FONT,'normal');
}
function header(doc) {
  doc.setFillColor(255,255,255);doc.rect(0,0,W,77,'F');
  doc.setDrawColor(38,55,68);doc.setLineWidth(.8);doc.line(12,75,W-12,75);
  doc.setLineWidth(1.5);doc.setDrawColor(20,42,58);doc.circle(34,36,21,'S');
  doc.setFont(FONT,'bold');doc.setTextColor(0,0,0);doc.setFontSize(24);doc.text('W',34,44,{align:'center'});
  doc.setFontSize(10.7);doc.text(`${PROTOCOL_COMPANY.name}  |  ${PROTOCOL_COMPANY.owner}`,64,22);
  doc.setFont(FONT,'normal');doc.setFontSize(8.3);
  doc.text(`${PROTOCOL_COMPANY.address}  |  NIP ${PROTOCOL_COMPANY.nip}`,64,42);
  doc.text(`tel. ${PROTOCOL_COMPANY.phone}  |  ${PROTOCOL_COMPANY.email}  |  www.wawis.pl`,64,59);
}
function section(doc,title,y) {
  doc.setFillColor(22,163,165);doc.roundedRect(M,y-9,4,13,2,2,'F');
  doc.setFont(FONT,'bold');doc.setFontSize(10);doc.setTextColor(0,0,0);
  doc.text(title.toUpperCase(),M+11,y);
}
function foot(doc,visitId) {
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++){
    doc.setPage(page);doc.setFont(FONT,'normal');doc.setFontSize(7);doc.setTextColor(60,70,85);
    doc.text(`WAWIS — protokół przeglądu · ${visitId}`,M,H-15);
    doc.text(`Strona ${page}/${pages}`,RIGHT,H-15,{align:'right'});
  }
}
function page(doc,y,required=40){
  if(y+required>H-48){doc.addPage();return 30;}
  return y;
}
function card(doc,y,height){
  doc.setDrawColor(212,224,230);doc.setFillColor(255,255,255);
  doc.roundedRect(12,y, W-24,height,7,7,'FD');
}
function textLines(doc,text,x,y,width,fontSize=8.7,lineHeight=12){
  doc.setFont(FONT,'normal');doc.setFontSize(fontSize);doc.setTextColor(0,0,0);
  const lines=doc.splitTextToSize(String(text||'-'),width);
  doc.text(lines,x,y,{lineHeightFactor:lineHeight/fontSize});
  return Math.max(1,lines.length)*lineHeight;
}
export async function createServiceVisitPdf({snapshot,signatureDataUrl,technicianNames=[]}) {
  if(!signatureDataUrl)throw new Error('Brakuje podpisu klienta.');
  if(!snapshot?.visit_id || !Array.isArray(snapshot.items)||!snapshot.items.length)throw new Error('Brak wyników serwisu.');
  const {jsPDF}=await import('jspdf');const doc=new jsPDF({unit:'pt',format:'a4',compress:true});
  await fonts(doc);header(doc);
  let y=91;section(doc,'Protokół przeglądu klimatyzacji',y);
  y+=16;card(doc,y,95);
  doc.setFontSize(9);doc.setFont(FONT,'bold');
  doc.text('Klient',M+6,y+18);doc.text('Adres',M+6,y+42);doc.text('Kontakt',M+6,y+66);
  textLines(doc,snapshot.client,M+75,y+18,455,9);
  textLines(doc,snapshot.address,M+75,y+42,455,9);
  textLines(doc,[snapshot.phone,snapshot.email].filter(Boolean).join(' | ')||'-',M+75,y+66,455,9);
  y+=113;
  y=page(doc,y,65);section(doc,'Wykonanie usługi',y);y+=14;card(doc,y,48);
  textLines(doc,`Data zaplanowana: ${formatDate(snapshot.scheduled_date)}`,M+6,y+18,500);
  textLines(doc,`Serwisanci: ${technicianNames.filter(Boolean).join(', ')||'Administrator'}`,M+6,y+35,500);
  y+=67;
  for(let i=0;i<snapshot.items.length;i++){
    const item=snapshot.items[i];
    const checks=SERVICE_VISIT_CHECKS.map(({key,label})=>`${item.checklist?.[key]===true?'✓':'—'}  ${label}`);
    const noteLines=doc.splitTextToSize(item.notes||'Brak uwag',CONTENT-24);
    const height=48+(item.result?checks.length*12+16:16)+Math.max(1,noteLines.length)*11+15;
    y=page(doc,y,height+28);
    section(doc,`Urządzenie ${i+1}`,y);y+=13;
    card(doc,y,height);
    doc.setFont(FONT,'bold');doc.setFontSize(9);
    doc.text(doc.splitTextToSize(item.model||'Klimatyzator',CONTENT-24),M+6,y+16);
    textLines(doc,`S/N: ${item.serial||'-'}`,M+6,y+32,CONTENT-24,8);
    textLines(doc,`Wynik: ${item.result==='sprawne'?'Sprawne':item.result==='usterka'?'Usterka / nieprawidłowość':'Nie wykonano'}`,
      M+6,y+47,CONTENT-24,8.6);
    let pos=y+62;
    if(item.result){
      for(const row of checks){textLines(doc,row,M+6,pos,CONTENT-24,8.3,11);pos+=12;}
    }
    textLines(doc,`Uwagi: ${item.notes||'Brak'}`,M+6,pos+5,CONTENT-24,8.3,11);
    y+=height+19;
  }
  const signatureHeight=156;
  y=page(doc,y,signatureHeight+15);section(doc,'Potwierdzenie klienta',y);y+=12;card(doc,y,139);
  const confirm='Potwierdzam zapoznanie się z zakresem i wynikami przeglądu urządzeń wyszczególnionych w tym protokole.';
  textLines(doc,confirm,M+6,y+18,CONTENT-12,8.7);
  const props=doc.getImageProperties(signatureDataUrl);
  const sz=getContainedSignatureSize(props.width,props.height,250,65);
  const signX=M+120-sz.width/2, signY=y+112-sz.height;
  doc.addImage(signatureDataUrl,'PNG',signX,signY,sz.width,sz.height,undefined,'FAST');
  doc.setDrawColor(212,224,230);doc.line(M+6,y+116,M+246,y+116);
  textLines(doc,'Podpis klienta złożony na ekranie telefonu',M+6,y+130,310,7);
  foot(doc,snapshot.visit_id);
  const pdfBlob=doc.output('blob');
  const safeClient=String(snapshot.client||'klient').normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase().slice(0,35)||'klient';
  return {pdfBlob,fileName:`wawis-protokol-serwis-${safeClient}-${String(snapshot.signed_at).slice(0,10)}.pdf`};
}
