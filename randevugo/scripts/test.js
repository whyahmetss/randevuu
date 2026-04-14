#!/usr/bin/env node
const BASE=process.argv.find(a=>a.startsWith('--base-url='))?.split('=')[1]||'https://randevugo-api.onrender.com';
const SA_E='randevugo@gmail.com',SA_S='11512Aydogar',IA_E='isletme@test.com',IA_S='123456';
const C={r:'\x1b[0m',b:'\x1b[1m',d:'\x1b[2m',R:'\x1b[31m',G:'\x1b[32m',Y:'\x1b[33m',C:'\x1b[36m',M:'\x1b[35m'};
const P=`${C.G}✅ PASS${C.r}`,F=`${C.R}❌ FAIL${C.r}`,S=s=>console.log(`\n${C.C}${C.b}═══ ${s} ═══${C.r}`),R=[];
async function H(m,p,{body:b,token:t,timeout:to=15000}={}){
  const u=`${BASE}/api${p}`,h={'Content-Type':'application/json'};if(t)h['Authorization']=`Bearer ${t}`;
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),to);
  try{const o={method:m,headers:h,signal:c.signal};if(b&&m!=='GET')o.body=JSON.stringify(b);
    const r=await fetch(u,o);clearTimeout(tm);let d=null;const ct=r.headers.get('content-type')||'';
    if(ct.includes('json'))try{d=await r.json()}catch{}else try{d=await r.text()}catch{}
    return{s:r.status,d,ok:r.ok}}catch(e){clearTimeout(tm);return{s:0,d:null,ok:false,e:e.message}}
}
const G=(p,o)=>H('GET',p,o),PO=(p,o)=>H('POST',p,o),PU=(p,o)=>H('PUT',p,o),DE=(p,o)=>H('DELETE',p,o);
async function T(n,f){const t=Date.now();try{await f();const m=Date.now()-t;R.push({n,p:1,m});console.log(`  ${P} ${C.d}(${m}ms)${C.r} ${n}`)}
catch(e){const m=Date.now()-t;R.push({n,p:0,m,e:e.message});console.log(`  ${F} ${C.d}(${m}ms)${C.r} ${n}\n        ${C.R}→ ${e.message}${C.r}`)}}
function A(c,m){if(!c)throw new Error(m)}
function AS(r,e,x=''){if(r.e)throw new Error(`Net: ${r.e}`);if(r.s!==e)throw new Error(`Expected ${e} got ${r.s} ${x} ${r.d?JSON.stringify(r.d).slice(0,120):''}`)}
function AF(d,f){A(d&&d[f]!==undefined,`Missing: "${f}"`)}
function AI(r,a,x=''){A(a.includes(r.s),`Expected ${a.join('|')} got ${r.s} ${x}`)}

(async()=>{
console.log(`\n${C.b}${C.M}╔═══════════════════════════════════════════════╗\n║  RandevuGO API Test Suite v2 (Dual Login)     ║\n╚═══════════════════════════════════════════════╝${C.r}`);
console.log(`${C.d}  URL: ${BASE}\n  SA : ${SA_E}\n  IA : ${IA_E}\n  ${new Date().toLocaleString('tr-TR')}${C.r}`);
let ST=null,IT=null;

S('1. Health');
await T('GET /health → 200',async()=>{const r=await G('/health');AS(r,200);AF(r.d,'status')});

S('2. Auth — Login');
await T('SuperAdmin giriş → 200',async()=>{const r=await PO('/auth/giris',{body:{email:SA_E,sifre:SA_S}});AS(r,200);AF(r.d,'token');ST=r.d.token});
await T('İşletme Admin giriş → 200',async()=>{const r=await PO('/auth/giris',{body:{email:IA_E,sifre:IA_S}});AS(r,200);AF(r.d,'token');IT=r.d.token});
await T('Yanlış şifre → 401',async()=>{AS(await PO('/auth/giris',{body:{email:SA_E,sifre:'xxx'}}),401)});
await T('Boş body → 401|500',async()=>{AI(await PO('/auth/giris',{body:{}}),[401,500])});
await T('Profil SA → 200',async()=>{AS(await G('/auth/profil',{token:ST}),200)});
await T('Profil IA → 200',async()=>{AS(await G('/auth/profil',{token:IT}),200)});
await T('Profil no token → 401',async()=>{AS(await G('/auth/profil'),401)});
await T('Profil bad token → 401',async()=>{AS(await G('/auth/profil',{token:'x.y.z'}),401)});
await T('Profil expired → 401',async()=>{AS(await G('/auth/profil',{token:'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZXhwIjoxfQ.x'}),401)});
const TK=IT||ST;

S('3. Auth Guard — 401');
for(const[m,p]of[['GET','/randevular'],['GET','/hizmetler'],['GET','/calisanlar'],['GET','/musteriler'],['GET','/istatistikler'],['GET','/grafik-verileri'],['GET','/ayarlar'],['GET','/paket'],['GET','/bildirimler'],['GET','/finans/ozet'],['GET','/gelir-tahmini'],['GET','/yogunluk-tahmini'],['GET','/no-show-istatistik'],['GET','/musteri-formu'],['GET','/premium/durum'],['GET','/kasa'],['GET','/kasa/ozet'],['GET','/duyurular'],['GET','/bot/durum'],['GET','/qr-kod'],['GET','/destek'],['PUT','/ayarlar'],['PUT','/bildirim-tercihleri'],['PUT','/musteri-formu']]){
  await T(`${m} ${p} no auth → 401`,async()=>{AS(await H(m,p),401)})}

S('4. İşletme Admin GET → 200');
for(const[p,fs]of[['/istatistikler',['bugun']],['/grafik-verileri',['haftalik']],['/dashboard-ekstra',[]],['/ayarlar',['isletme']],['/paket',[]],['/hizmetler',['hizmetler']],['/calisanlar',['calisanlar']],['/musteriler',['musteriler']],['/bildirimler',[]],['/bildirimler/okunmamis-sayi',[]],['/finans/ozet',[]],['/gelir-tahmini',['gunluk']],['/yogunluk-tahmini',['yarin','bugun']],['/no-show-istatistik',['noShow']],['/musteri-formu',[]],['/premium/durum',[]],['/duyurular',[]],['/bot/durum',[]],['/odeme/durum',[]],['/destek',[]],['/kara-liste',[]]]){
  await T(`GET ${p} → 200`,async()=>{const r=await G(p,{token:TK});AS(r,200,p);for(const f of fs)AF(r.d,f)})}

S('5. Ödeme Kontrollü → 200|402');
for(const[p]of[['/randevular'],['/kampanyalar'],['/memnuniyetler'],['/bekleme-listesi'],['/etiketler'],['/google-yorum/ayarlar'],['/referans/ayarlar'],['/sadakat/ayarlar'],['/winback/ayarlar'],['/yorum-avcisi/ayarlar'],['/gece-raporu/ayarlar'],['/sms/ayarlar'],['/prim/rapor'],['/kasa'],['/kasa/ozet'],['/export/musteriler']]){
  await T(`GET ${p} → 200|402`,async()=>{AI(await G(p,{token:TK}),[200,402],p)})}

S('6. Webhook & Bot');
await T('Webhook boş → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{}})).s<500,'crash')});
await T('Webhook eksik → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{messages:[{text:{body:'t'}}]}})).s<500,'crash')});
await T('Webhook SQLi → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{from:"';DROP--",text:{body:"' OR 1=1--"}}})).s<500,'crash')});
await T('Webhook XSS → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{from:'<script>',text:{body:'<img onerror=x>'}}})).s<500,'crash')});
await T('Webhook 15K char → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{from:'905551234567',text:{body:'A'.repeat(15000)}}})).s<500,'crash')});
await T('Webhook emoji → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{from:'905551234567',text:{body:'😀🎉👍💯🔥'}}})).s<500,'crash')});
await T('Webhook media → safe',async()=>{A((await PO('/webhook/whatsapp',{body:{from:'905551234567',type:'image',image:{id:'x'}}})).s<500,'crash')});
await T('Bot test no auth → 401',async()=>{AS(await PO('/bot/test',{body:{mesaj:'hi'}}),401)});
await T('Bot test auth → safe',async()=>{A((await PO('/bot/test',{body:{mesaj:'merhaba'},token:TK})).s<500,'crash')});

S('7. Oturum & Akış');
for(const m of['iptal','menü','sıram','puanım','referans','randevu al','bekleme listesi'])
  await T(`Bot "${m}" → safe`,async()=>{A((await PO('/bot/test',{body:{mesaj:m},token:TK})).s<500,'crash')});
await T('Spam 5x → safe',async()=>{const rs=await Promise.all(Array.from({length:5},(_,i)=>PO('/bot/test',{body:{mesaj:`s${i}`},token:TK})));for(const r of rs)A(r.s<500,'crash')});

S('8. Randevu İş Kuralları');
await T('Nonexistent slug → 200|404',async()=>{AI(await G('/book/___none___'),[200,404])});
await T('Geçmiş tarih randevu → hata',async()=>{AI(await PO('/book/___x/randevu',{body:{musteri_isim:'T',musteri_telefon:'905551234567',hizmet_id:1,tarih:'2020-01-01',saat:'10:00'}}),[400,404,500])});
await T('Boş randevu → hata',async()=>{AI(await PO('/book/___x/randevu',{body:{}}),[400,404,500])});
await T('Olmayan randevu durum → safe',async()=>{AI(await PU('/randevular/999999/durum',{body:{durum:'onaylandi'},token:TK}),[200,402,404,500])});

S('9. API Güvenlik');
await T('PUT /ayarlar boş → 200',async()=>{AS(await PU('/ayarlar',{body:{},token:TK}),200)});
await T('PUT /ayarlar zararlı → güvenli',async()=>{AS(await PU('/ayarlar',{body:{id:999,aktif:false,paket:'premium'},token:TK}),200)});
await T('DELETE nonexist hizmet → safe',async()=>{AI(await DE('/hizmetler/999999',{token:TK}),[200,402,404])});
await T('POST /iletisim → 200',async()=>{AS(await PO('/iletisim',{body:{isim:'T',email:'t@t.com',mesaj:'test',telefon:'0555'}}),200)});
await T('POST /iletisim boş → hata',async()=>{AI(await PO('/iletisim',{body:{}}),[400,500])});

S('10. SuperAdmin — SA:200 / IA:403');
const saPaths=['/admin/isletmeler','/admin/saas-metrikleri','/admin/odemeler','/admin/destek','/admin/audit-log','/admin/sistem-durumu','/admin/zombiler','/admin/referanslar','/admin/duyurular','/admin/paketler','/admin/satis-bot/durum','/admin/api-dashboard','/admin/musteri-crm'];
if(ST)for(const p of saPaths)await T(`GET ${p} SA → 200`,async()=>{AS(await G(p,{token:ST}),200,p)});
if(IT)for(const p of saPaths)await T(`GET ${p} IA → 403`,async()=>{AS(await G(p,{token:IT}),403,p)});

S('11. Public Booking');
for(const p of['/book/test-slug','/book/test-slug/hizmetler','/book/test-slug/calisanlar'])
  await T(`GET ${p} → 200|404`,async()=>{AI(await G(p),[200,404])});
await T('GET /book/test-slug/saatler → 200|400|404',async()=>{AI(await G('/book/test-slug/saatler'),[200,400,404])});

S('12. CRUD Döngü');
let hId=null;
await T('POST /hizmetler create',async()=>{const r=await PO('/hizmetler',{body:{isim:'___TEST___',fiyat:99,sure_dk:30},token:TK});AI(r,[200,201,402]);if(r.s!==402&&r.d?.hizmet)hId=r.d.hizmet.id});
await T('PUT /hizmetler update',async()=>{if(!hId)throw new Error('skip');AI(await PU(`/hizmetler/${hId}`,{body:{isim:'___UPD___',fiyat:149},token:TK}),[200,402])});
await T('DELETE /hizmetler delete',async()=>{if(!hId)throw new Error('skip');AI(await DE(`/hizmetler/${hId}`,{token:TK}),[200,402])});

S('13. Race Condition');
await T('5x GET /istatistikler',async()=>{const rs=await Promise.all(Array.from({length:5},()=>G('/istatistikler',{token:TK})));for(const r of rs)AS(r,200)});
await T('3x PUT /ayarlar',async()=>{const rs=await Promise.all(Array.from({length:3},(_,i)=>PU('/ayarlar',{body:{isim:`C${i}`},token:TK})));for(const r of rs)AS(r,200)});

S('14. Edge Cases');
await T('limit=-1',async()=>{AI(await G('/randevular?limit=-1',{token:TK}),[200,402])});
await T('limit=999999',async()=>{AI(await G('/randevular?limit=999999',{token:TK}),[200,402])});
await T('XSS arama',async()=>{AI(await G('/musteriler?arama=%3Cscript%3E',{token:TK}),[200,402])});
await T('SQLi arama',async()=>{AI(await G('/musteriler?arama=%27OR1%3D1',{token:TK}),[200,402])});

S('15. Yeni Özellikler');
await T('Gelir tahmini alanlar',async()=>{const r=await G('/gelir-tahmini',{token:TK});AS(r,200);for(const f of['gunluk','toplamTahmini','duzeltilmisGelir','noShowOran'])AF(r.d,f)});
await T('Yoğunluk tahmini',async()=>{const r=await G('/yogunluk-tahmini',{token:TK});AS(r,200);AF(r.d,'yarin');AF(r.d.yarin,'doluluk');AF(r.d.yarin,'renk')});
await T('No-show istatistik',async()=>{const r=await G('/no-show-istatistik',{token:TK});AS(r,200);for(const f of['noShow','noShowOran','kaybedilenGelir','tekrarlayan'])AF(r.d,f)});
await T('PUT müşteri formu',async()=>{AS(await PU('/musteri-formu',{body:{musteri_formu:[{soru:'Alerji?',zorunlu:false}]},token:TK}),200)});
await T('GET müşteri formu',async()=>{AS(await G('/musteri-formu',{token:TK}),200)});
await T('PUT google maps reserve',async()=>{AS(await PU('/google-maps-reserve',{body:{google_maps_reserve_url:'https://maps.google.com/test'},token:TK}),200)});

// ═══ ÖZET ═══
const p=R.filter(r=>r.p).length,f=R.filter(r=>!r.p).length,t=R.length,ms=R.reduce((s,r)=>s+r.m,0);
console.log(`\n${C.b}${C.C}══════════════════════════════════════════════════${C.r}`);
if(f===0)console.log(`  ${C.b}${C.G}🎉 TÜM TESTLER BAŞARILI: ${p}/${t} passed ${C.d}(${(ms/1000).toFixed(1)}s)${C.r}`);
else{console.log(`  ${C.b}${C.Y}SONUÇ: ${p}/${t} passed, ${C.R}${f} failed ${C.d}(${(ms/1000).toFixed(1)}s)${C.r}`);
  console.log(`\n${C.R}${C.b}  Başarısız:${C.r}`);
  for(const r of R.filter(r=>!r.p))console.log(`  ${C.R}✗${C.r} ${r.n}\n    ${C.d}${r.e}${C.r}`)}
console.log();process.exit(f>0?1:0);
})();
