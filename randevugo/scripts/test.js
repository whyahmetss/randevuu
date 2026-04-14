#!/usr/bin/env node
const BASE_URL = process.argv.find(a=>a.startsWith('--base-url='))?.split('=')[1]||process.env.TEST_BASE_URL||'http://localhost:3000';
const LOGIN_EMAIL = process.argv.find(a=>a.startsWith('--email='))?.split('=')[1]||process.env.TEST_EMAIL||'admin@randevugo.com';
const LOGIN_SIFRE = process.argv.find(a=>a.startsWith('--sifre='))?.split('=')[1]||process.env.TEST_SIFRE||'admin123';

const C={reset:'\x1b[0m',bold:'\x1b[1m',dim:'\x1b[2m',red:'\x1b[31m',green:'\x1b[32m',yellow:'\x1b[33m',cyan:'\x1b[36m',magenta:'\x1b[35m'};
const PASS=`${C.green}✅ PASS${C.reset}`,FAIL=`${C.red}❌ FAIL${C.reset}`;
const SECTION=s=>console.log(`\n${C.cyan}${C.bold}═══ ${s} ═══${C.reset}`);
const results=[];

async function http(method,path,{body,token,timeout=10000}={}){
  const url=`${BASE_URL}/api${path}`;
  const headers={'Content-Type':'application/json'};
  if(token)headers['Authorization']=`Bearer ${token}`;
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const opts={method,headers,signal:ctrl.signal};
    if(body&&['POST','PUT','DELETE'].includes(method))opts.body=JSON.stringify(body);
    const res=await fetch(url,opts);clearTimeout(timer);
    let data=null;const ct=res.headers.get('content-type')||'';
    if(ct.includes('json')){try{data=await res.json()}catch{}}else{try{data=await res.text()}catch{}}
    return{status:res.status,data,ok:res.ok};
  }catch(e){clearTimeout(timer);return{status:0,data:null,ok:false,error:e.message}}
}
const GET=(p,o)=>http('GET',p,o),POST=(p,o)=>http('POST',p,o),PUT=(p,o)=>http('PUT',p,o),DEL=(p,o)=>http('DELETE',p,o);

async function test(name,fn){
  const t0=Date.now();
  try{await fn();const ms=Date.now()-t0;results.push({name,passed:true,ms});console.log(`  ${PASS} ${C.dim}(${ms}ms)${C.reset} ${name}`);}
  catch(e){const ms=Date.now()-t0;results.push({name,passed:false,ms,error:e.message});console.log(`  ${FAIL} ${C.dim}(${ms}ms)${C.reset} ${name}\n        ${C.red}→ ${e.message}${C.reset}`);}
}
function assert(c,m){if(!c)throw new Error(m)}
function assertStatus(r,exp,ctx=''){if(r.error)throw new Error(`Network: ${r.error} ${ctx}`);if(r.status!==exp)throw new Error(`Expected ${exp}, got ${r.status} ${ctx} ${r.data?JSON.stringify(r.data).slice(0,150):''}`)}
function assertField(d,f){assert(d&&d[f]!==undefined,`Missing field: "${f}"`)}

(async()=>{
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════╗\n║  RandevuGO — Otomatik API Test Suite     ║\n╚══════════════════════════════════════════╝${C.reset}`);
  console.log(`${C.dim}  URL: ${BASE_URL}  Email: ${LOGIN_EMAIL}  ${new Date().toLocaleString('tr-TR')}${C.reset}`);
  let TOKEN=null;

  // 1. HEALTH
  SECTION('1. Health');
  await test('GET /health → 200 + status:ok',async()=>{const r=await GET('/health');assertStatus(r,200);assertField(r.data,'status');assert(r.data.status==='ok','status != ok')});

  // 2. AUTH
  SECTION('2. Auth');
  await test('POST /auth/giris — geçerli → 200+token',async()=>{const r=await POST('/auth/giris',{body:{email:LOGIN_EMAIL,sifre:LOGIN_SIFRE}});assertStatus(r,200);assertField(r.data,'token');assertField(r.data,'kullanici');TOKEN=r.data.token});
  await test('POST /auth/giris — yanlış şifre → 401',async()=>{assertStatus(await POST('/auth/giris',{body:{email:LOGIN_EMAIL,sifre:'xxx'}}),401)});
  await test('POST /auth/giris — boş body → 401/500',async()=>{const r=await POST('/auth/giris',{body:{}});assert(r.status===401||r.status===500,`Got ${r.status}`)});
  await test('GET /auth/profil — token → 200',async()=>{assertStatus(await GET('/auth/profil',{token:TOKEN}),200)});
  await test('GET /auth/profil — token yok → 401',async()=>{assertStatus(await GET('/auth/profil'),401)});
  await test('GET /auth/profil — geçersiz token → 401',async()=>{assertStatus(await GET('/auth/profil',{token:'invalid.x.y'}),401)});
  await test('GET /auth/profil — expired token → 401',async()=>{assertStatus(await GET('/auth/profil',{token:'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MSwiZXhwIjoxfQ.xxx'}),401)});

  // 3. AUTH GUARD 401
  SECTION('3. Auth Guard — 401');
  for(const [m,p] of [['GET','/randevular'],['GET','/hizmetler'],['GET','/calisanlar'],['GET','/musteriler'],['GET','/istatistikler'],['GET','/grafik-verileri'],['GET','/ayarlar'],['GET','/paket'],['GET','/bildirimler'],['GET','/finans/ozet'],['GET','/gelir-tahmini'],['GET','/yogunluk-tahmini'],['GET','/no-show-istatistik'],['GET','/musteri-formu'],['GET','/premium/durum'],['GET','/kasa'],['GET','/kasa/ozet'],['GET','/duyurular'],['GET','/bot/durum'],['GET','/qr-kod'],['GET','/destek'],['PUT','/ayarlar'],['PUT','/bildirim-tercihleri'],['PUT','/musteri-formu']]){
    await test(`${m} ${p} — no auth → 401`,async()=>{assertStatus(await http(m,p),401)});
  }

  // 4. AUTH GET 200
  SECTION('4. Authenticated GET → 200');
  for(const [p,fs] of [['/istatistikler',['bugun']],['/grafik-verileri',['haftalik']],['/dashboard-ekstra',[]],['/ayarlar',['isletme']],['/paket',[]],['/hizmetler',['hizmetler']],['/calisanlar',['calisanlar']],['/musteriler',['musteriler']],['/bildirimler',[]],['/bildirimler/okunmamis-sayi',[]],['/finans/ozet',[]],['/gelir-tahmini',['gunluk']],['/yogunluk-tahmini',['yarin','bugun']],['/no-show-istatistik',['noShow']],['/musteri-formu',[]],['/premium/durum',[]],['/duyurular',[]],['/bot/durum',[]],['/odeme/durum',[]],['/destek',[]],['/kara-liste',[]]]){
    await test(`GET ${p} → 200`,async()=>{const r=await GET(p,{token:TOKEN});assertStatus(r,200,p);for(const f of fs)assertField(r.data,f)});
  }

  // 5. ÖDEME KONTROLLÜ (200 veya 402)
  SECTION('5. Ödeme Kontrollü → 200/402');
  for(const [p,fs] of [['/randevular',['randevular']],['/kampanyalar',[]],['/memnuniyetler',[]],['/bekleme-listesi',[]],['/etiketler',[]],['/google-yorum/ayarlar',[]],['/referans/ayarlar',[]],['/sadakat/ayarlar',[]],['/winback/ayarlar',[]],['/yorum-avcisi/ayarlar',[]],['/gece-raporu/ayarlar',[]],['/sms/ayarlar',[]],['/prim/rapor',[]],['/kasa',[]],['/kasa/ozet',[]],['/export/musteriler',[]]]){
    await test(`GET ${p} → 200|402`,async()=>{const r=await GET(p,{token:TOKEN});assert(r.status===200||r.status===402,`Got ${r.status} for ${p}`);if(r.status===200)for(const f of fs)assertField(r.data,f)});
  }

  // 6. WEBHOOK & BOT GİRDİ
  SECTION('6. Webhook & Bot Girdi');
  await test('Webhook boş body → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{}})).status<500,'crashed')});
  await test('Webhook eksik payload → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{messages:[{text:{body:'t'}}]}})).status<500,'crashed')});
  await test('Webhook SQL injection → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{from:"';DROP TABLE--",text:{body:"' OR 1=1--"}}})).status<500,'crashed')});
  await test('Webhook XSS → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{from:'<script>alert(1)</script>',text:{body:'<img onerror=alert(1)>'}}})).status<500,'crashed')});
  await test('Webhook 15000 char → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{from:'905551234567',text:{body:'A'.repeat(15000)}}})).status<500,'crashed')});
  await test('Webhook emoji only → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{from:'905551234567',text:{body:'😀🎉👍💯🔥'}}})).status<500,'crashed')});
  await test('Webhook media type → no crash',async()=>{assert((await POST('/webhook/whatsapp',{body:{from:'905551234567',type:'image',image:{id:'x'}}})).status<500,'crashed')});
  await test('Bot test — no auth → 401',async()=>{assertStatus(await POST('/bot/test',{body:{mesaj:'hi'}}),401)});
  await test('Bot test — auth → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'merhaba'},token:TOKEN})).status<500,'crashed')});

  // 7. OTURUM AKIŞ
  SECTION('7. Oturum & Akış');
  await test('Bot "iptal" → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'iptal'},token:TOKEN})).status<500,'crashed')});
  await test('Bot "menü" → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'menü'},token:TOKEN})).status<500,'crashed')});
  await test('Bot "sıram" → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'sıram'},token:TOKEN})).status<500,'crashed')});
  await test('Bot "puanım" → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'puanım'},token:TOKEN})).status<500,'crashed')});
  await test('Bot "referans" → no crash',async()=>{assert((await POST('/bot/test',{body:{mesaj:'referans'},token:TOKEN})).status<500,'crashed')});
  await test('Spam 5 mesaj → no crash',async()=>{const rs=await Promise.all(Array.from({length:5},(_,i)=>POST('/bot/test',{body:{mesaj:`spam${i}`},token:TOKEN})));for(const r of rs)assert(r.status<500,'spam crash')});

  // 8. RANDEVU İŞ KURALLARI
  SECTION('8. Randevu İş Kuralları');
  await test('GET /book/nonexistent → 200|404',async()=>{const r=await GET('/book/___nonexist___');assert(r.status===200||r.status===404,`Got ${r.status}`)});
  await test('POST /book/x/randevu geçmiş tarih → hata',async()=>{const r=await POST('/book/___x/randevu',{body:{musteri_isim:'T',musteri_telefon:'905551234567',hizmet_id:1,tarih:'2020-01-01',saat:'10:00'}});assert([400,404,500].includes(r.status),`Got ${r.status}`)});
  await test('POST /book/x/randevu boş → hata',async()=>{const r=await POST('/book/___x/randevu',{body:{}});assert([400,404,500].includes(r.status),`Got ${r.status}`)});
  await test('PUT /randevular/999999/durum → no fatal',async()=>{const r=await PUT('/randevular/999999/durum',{body:{durum:'onaylandi'},token:TOKEN});assert([200,402,404].includes(r.status),`Got ${r.status}`)});

  // 9. API GÜVENLİK
  SECTION('9. API Güvenlik & Doğrulama');
  await test('PUT /ayarlar boş → 200',async()=>{assertStatus(await PUT('/ayarlar',{body:{},token:TOKEN}),200)});
  await test('PUT /ayarlar zararlı alan → güvenli',async()=>{assertStatus(await PUT('/ayarlar',{body:{id:999,aktif:false,paket:'premium'},token:TOKEN}),200)});
  await test('DELETE /hizmetler/999999 → safe',async()=>{const r=await DEL('/hizmetler/999999',{token:TOKEN});assert([200,402,404].includes(r.status),`Got ${r.status}`)});
  await test('POST /iletisim geçerli → 200',async()=>{assertStatus(await POST('/iletisim',{body:{isim:'T',email:'t@t.com',mesaj:'test',telefon:'05551234567'}}),200)});
  await test('POST /iletisim boş → hata',async()=>{const r=await POST('/iletisim',{body:{}});assert([400,500].includes(r.status),`Got ${r.status}`)});

  // 10. SUPER ADMIN GUARD
  SECTION('10. SuperAdmin Guard');
  for(const [m,p] of [['GET','/admin/isletmeler'],['GET','/admin/saas-metrikleri'],['GET','/admin/odemeler'],['GET','/admin/destek'],['GET','/admin/audit-log'],['GET','/admin/sistem-durumu'],['GET','/admin/zombiler'],['GET','/admin/referanslar'],['GET','/admin/duyurular'],['GET','/admin/paketler'],['GET','/admin/satis-bot/durum'],['GET','/admin/api-dashboard'],['GET','/admin/musteri-crm']]){
    await test(`${m} ${p} → 200(SA)|403`,async()=>{const r=await http(m,p,{token:TOKEN});assert(r.status===200||r.status===403,`Got ${r.status} for ${p}`)});
  }

  // 11. PUBLIC BOOKING
  SECTION('11. Public Booking');
  for(const p of ['/book/test-slug','/book/test-slug/hizmetler','/book/test-slug/calisanlar','/book/test-slug/saatler']){
    await test(`GET ${p} → 200|404`,async()=>{const r=await GET(p);assert([200,404].includes(r.status),`Got ${r.status}`)});
  }

  // 12. CRUD DÖNGÜ
  SECTION('12. CRUD Döngü (Hizmet)');
  let hId=null;
  await test('POST /hizmetler → create',async()=>{const r=await POST('/hizmetler',{body:{isim:'___TEST___',fiyat:99,sure_dk:30},token:TOKEN});assert([200,201,402].includes(r.status),`Got ${r.status}`);if(r.status!==402&&r.data?.hizmet)hId=r.data.hizmet.id});
  await test('PUT /hizmetler/:id → update',async()=>{if(!hId)throw new Error('skip');const r=await PUT(`/hizmetler/${hId}`,{body:{isim:'___TEST_UPD___',fiyat:149},token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});
  await test('DELETE /hizmetler/:id → delete',async()=>{if(!hId)throw new Error('skip');const r=await DEL(`/hizmetler/${hId}`,{token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});

  // 13. RACE CONDITION
  SECTION('13. Race Condition');
  await test('5x GET /istatistikler eşzamanlı → hepsi 200',async()=>{const rs=await Promise.all(Array.from({length:5},()=>GET('/istatistikler',{token:TOKEN})));for(const r of rs)assertStatus(r,200)});
  await test('3x PUT /ayarlar eşzamanlı → no crash',async()=>{const rs=await Promise.all(Array.from({length:3},(_,i)=>PUT('/ayarlar',{body:{isim:`Conc${i}`},token:TOKEN})));for(const r of rs)assertStatus(r,200)});

  // 14. EDGE CASES
  SECTION('14. Edge Cases');
  await test('limit=-1 → no crash',async()=>{const r=await GET('/randevular?limit=-1',{token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});
  await test('limit=999999 → no crash',async()=>{const r=await GET('/randevular?limit=999999',{token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});
  await test('XSS arama → no crash',async()=>{const r=await GET('/musteriler?arama=%3Cscript%3Ealert(1)%3C/script%3E',{token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});
  await test('SQLi arama → no crash',async()=>{const r=await GET("/musteriler?arama=%27%20OR%201%3D1--",{token:TOKEN});assert([200,402].includes(r.status),`Got ${r.status}`)});

  // 15. YENİ ÖZELLİKLER DETAY
  SECTION('15. Yeni Özellik Detayları');
  await test('GET /gelir-tahmini → alanlar',async()=>{const r=await GET('/gelir-tahmini',{token:TOKEN});assertStatus(r,200);for(const f of ['gunluk','toplamTahmini','duzeltilmisGelir','noShowOran'])assertField(r.data,f)});
  await test('GET /yogunluk-tahmini → yarin.doluluk',async()=>{const r=await GET('/yogunluk-tahmini',{token:TOKEN});assertStatus(r,200);assertField(r.data,'yarin');assertField(r.data.yarin,'doluluk');assertField(r.data.yarin,'renk')});
  await test('GET /no-show-istatistik → alanlar',async()=>{const r=await GET('/no-show-istatistik',{token:TOKEN});assertStatus(r,200);for(const f of ['noShow','noShowOran','kaybedilenGelir','tekrarlayan'])assertField(r.data,f)});
  await test('PUT /musteri-formu → kaydet',async()=>{const r=await PUT('/musteri-formu',{body:{musteri_formu:[{soru:'Alerji var mı?',zorunlu:false}]},token:TOKEN});assertStatus(r,200)});
  await test('GET /musteri-formu → oku',async()=>{const r=await GET('/musteri-formu',{token:TOKEN});assertStatus(r,200)});
  await test('PUT /google-maps-reserve → kaydet',async()=>{const r=await PUT('/google-maps-reserve',{body:{google_maps_reserve_url:'https://maps.google.com/test'},token:TOKEN});assertStatus(r,200)});

  // ═══ ÖZET ═══
  const passed=results.filter(r=>r.passed).length;
  const failed=results.filter(r=>!r.passed).length;
  const total=results.length;
  const totalMs=results.reduce((s,r)=>s+r.ms,0);

  console.log(`\n${C.bold}${C.cyan}══════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}  SONUÇ: ${passed===total?C.green:C.yellow}${passed}/${total} test passed${failed>0?`, ${C.red}${failed} failed`:''} ${C.dim}(${(totalMs/1000).toFixed(1)}s)${C.reset}`);
  if(failed>0){
    console.log(`\n${C.red}${C.bold}  Başarısız testler:${C.reset}`);
    for(const r of results.filter(r=>!r.passed))console.log(`  ${C.red}✗${C.reset} ${r.name}\n    ${C.dim}${r.error}${C.reset}`);
  }
  console.log();
  process.exit(failed>0?1:0);
})();
