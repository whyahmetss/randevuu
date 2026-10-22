# SıraGO içerik stoğu üreticisi: python3 tasarim/instagram/stok/uret.py && node tasarim/render.mjs stok/
# Her gönderi bir klasör: 1.html, 2.html… + aciklama.txt. Story'ler stok/story/.
# Format çeşitliliği: büyük cümle, not kâğıdı (Instrument Serif), adisyon fişi (JetBrains Mono), müşteri tipleri,
# kopyala-yapıştır şablon, ipucu listesi, önce/sonra, sohbet mizahı, kendi hesabını yap, Fiko sözlüğü.
import os, shutil
KOK = os.path.dirname(os.path.abspath(__file__))
H = {
 'A': '#berber #kuaför #esnaf #randevu #whatsapp',
 'B': '#berberhayatı #berberler #erkekkuaförü #saçsakal #esnafhayatı',
 'C': '#kuaförhayatı #kuaförsalonu #güzelliksalonu #bayankuaförü #randevu',
 'D': '#esnaf #küçükişletme #randevusistemi #berber #kuaför',
 'E': '#esnafhayatı #berberhayatı #kuaförhayatı #esnaf',
}
LOGO = {'z-gece': 'maskot/marka/logo-yatay-koyu-zemin.png', 'z-krem': 'maskot/marka/logo-yatay-acik-zemin.png', 'z-yesil': 'tasarim/varliklar/logo-yatay-yesil-zemin.png'}
ORTAK = '''
.etiket.u{position:absolute;top:196px;left:var(--kenar)}
h1.u{position:absolute;top:244px;left:var(--kenar);right:var(--kenar)}
/* not kâğıdı */
.not-kagit{position:absolute;left:100px;right:100px;top:330px;background:#fffdf6;border-radius:6px;padding:90px 70px 80px;box-shadow:0 30px 70px rgba(19,39,28,.18);transform:rotate(-1.6deg);
  background-image:repeating-linear-gradient(#fffdf6 0 63px,#e7dfcf 63px 65px);color:#1b1a17}
.not-kagit::before{content:'';position:absolute;top:-22px;left:50%;margin-left:-90px;width:180px;height:48px;background:rgba(43,211,106,.55);transform:rotate(2deg)}
.serif{font-family:'Instrument Serif',serif;font-weight:400;letter-spacing:-0.01em}
.not-kagit .serif{font-size:98px;line-height:1.08}
.not-kagit .serif em{color:var(--yesil)}
.not-kagit .imza{margin-top:44px;font-size:28px;font-weight:600;color:var(--gri-a)}
/* adisyon fişi */
.fis{position:absolute;left:150px;right:150px;top:150px;background:#fbfaf6;color:#1b1a17;padding:60px 54px 70px;font-family:'JetBrains Mono',monospace;font-size:27px;line-height:1.55;
  box-shadow:0 30px 70px rgba(0,0,0,.35);-webkit-mask:linear-gradient(#000,#000) top/100% calc(100% - 18px) no-repeat, conic-gradient(from -45deg at bottom,#0000,#000 1deg 89deg,#0000 90deg) bottom/36px 18px repeat-x}
.fis .ort{text-align:center} .fis .cizgi{border-top:3px dashed #9a958b;margin:22px 0}
.fis .sat{display:flex;justify-content:space-between;gap:20px} .fis .sat span:last-child{white-space:nowrap}
.fis .top{font-weight:800;font-size:31px} .fis .bas{font-weight:800;font-size:34px;letter-spacing:.06em}
.fis .barkod{height:70px;margin:30px 40px 0;background:repeating-linear-gradient(90deg,#1b1a17 0 3px,transparent 3px 6px,#1b1a17 6px 11px,transparent 11px 14px,#1b1a17 14px 16px,transparent 16px 21px)}
/* büyük numara */
.dev{position:absolute;top:150px;right:var(--kenar);font-family:var(--f-baslik);font-weight:800;font-size:260px;line-height:1;letter-spacing:-0.05em;color:var(--vurgu);opacity:.22}
.ne-yapar{position:absolute;left:var(--kenar);right:var(--kenar);bottom:170px;display:flex;gap:24px;align-items:flex-start;padding:34px 38px;border-radius:30px}
.z-gece .ne-yapar{background:var(--gece-2);border:1.5px solid var(--cizgi-k)} .z-krem .ne-yapar{background:#fff;border:1.5px solid var(--cizgi-a)} .z-yesil .ne-yapar{background:var(--yesil-d)}
.ne-yapar .ik{font-size:46px;color:var(--vurgu);flex:none;margin-top:4px}
.ne-yapar small{display:block;font-size:21px;font-weight:650;letter-spacing:.12em;text-transform:uppercase;color:var(--vurgu)}
.ne-yapar b{display:block;font-size:33px;font-weight:650;line-height:1.3;margin-top:6px}
/* şablon balonu */
.sablon{position:absolute;left:var(--kenar);right:var(--kenar);top:560px;background:#005c4b;color:#e9edef;border-radius:30px;border-top-right-radius:8px;padding:38px 42px;font-size:33px;line-height:1.45;font-family:var(--f-govde),'Noto Color Emoji'}
.sablon mark{background:rgba(43,211,106,.25);color:#b9f6cf;border-radius:8px;padding:0 8px}
.sablon .s{display:block;text-align:right;font-size:20px;color:rgba(233,237,239,.55);margin-top:8px}
.ipucu-yaz{position:absolute;left:var(--kenar);right:var(--kenar);font-size:27px;line-height:1.45;color:var(--ikincil)}
/* önce/sonra */
.yarim{position:absolute;left:0;right:0;height:675px;overflow:hidden}
.yarim .lbl{position:absolute;top:150px;left:var(--kenar);font-family:var(--f-baslik);font-weight:800;font-size:64px;letter-spacing:-0.03em}
'''
def yaz(yol, html):
    os.makedirs(os.path.dirname(yol), exist_ok=True); open(yol, 'w').write(html)
def sayfa(yol, zemin, govde, css='', w=1080, h=1350, ust=None, alt=None):
    derinlik = os.path.relpath(os.path.join(KOK, '..', '..', '..'), os.path.dirname(yol))  # repo köküne
    T = os.path.relpath(os.path.join(KOK, '..', '..'), os.path.dirname(yol))               # tasarim/
    isik = ' isik' if zemin == 'z-gece' else ''
    ust_html = '' if ust is False else f'<div class="ust"><img class="logo" src="{derinlik}/{LOGO[zemin]}" alt="SıraGO"><span class="no">{ust or ""}</span></div>'
    alt_html = alt if alt is not None else ''
    html = f'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><link rel="stylesheet" href="{T}/sistem/marka.css">
<style>body{{--w:{w}px;--h:{h}px}}{ORTAK}{css}</style></head>
<body class="{zemin}{isik}" data-w="{w}" data-h="{h}"><script src="{T}/sistem/ikonlar.js"></script>
{ust_html}
{govde.replace('@T', T).replace('@K', derinlik)}
{alt_html}
</body></html>'''
    yaz(yol, html)
KAYDIR = '<div class="alt"><b>Kaydır →</b></div>'
def alt(sol='', sag=''): return f'<div class="alt"><span>{sol}</span><b>{sag}</b></div>'
def aciklama(klasor, metin, hs):
    yaz(os.path.join(klasor, 'aciklama.txt'), metin.strip() + '\n\n' + H[hs] + '\n')
def wa(govde, kisi='Müşteri', harf='M', top=560, h=760, alt_=''):
    return f'<div class="tel" style="left:50%;margin-left:-300px;top:{top}px;height:{h}px{alt_}"><div class="ekran wa"><div class="wa-bas"><span class="av">{harf}</span><div><b>{kisi}</b><small>çevrimiçi</small></div></div><div class="wa-govde">{govde}</div></div></div>'
def b(yon, m, s=''): return f'<div class="b {yon}">{m}<span class="s">{s}</span></div>'
G = os.path.join(KOK, 'gonderi')
if os.path.isdir(G): shutil.rmtree(G)

# ───────────────────────── GÖNDERİLER ─────────────────────────
# P01 · Büyük cümle (gece)
p = os.path.join(G, '01-kopuk')
sayfa(f'{p}/1.html', 'z-gece', '''
<h1 class="baslik u" style="top:300px;font-size:150px">Sakal köpüklü. <em>Telefon çalıyor.</em></h1>
<p class="metin" style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);font-size:38px">Açsan müşteri köpükte bekler. Açmasan arayan başka yere gider.<br><b>O telefonu SıraGO açsın.</b></p>''', alt=alt('Müşterin WhatsApp’tan yazar, randevuyu SıraGO yazar.'))
aciklama(p, '''Sakal köpüklü, telefon çalıyor. Açsan bir dert, açmasan bir dert.

SıraGO senin WhatsApp numarana gelen randevu mesajlarına cevap verir: boş saati söyler, randevuyu oluşturur. Sen elindeki işe bak.

Bunu yaşayan bir ustayı etiketle.''', 'B')

# P02 · Kopyala-yapıştır: gelmeyen müşteri (krem carousel)
p = os.path.join(G, '02-gelmeyen-musteriye-mesaj')
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="etiket u">Kopyala · yapıştır</div>
<h1 class="baslik b-xl u">Gelmeyen müşteriye <em>ne yazılır?</em></h1>
<p class="metin" style="position:absolute;top:640px;left:var(--kenar);right:var(--kenar);font-size:36px">Kırmadan, kızmadan, kapıyı açık bırakarak. 3 hazır mesaj.</p>
<div class="kart" style="position:absolute;left:var(--kenar);right:var(--kenar);top:820px;display:flex;gap:22px;align-items:center"><svg class="ik" style="font-size:44px;color:var(--yesil)"><use href="#sohbet"/></svg><b style="font-size:32px">Kaydet, lazım olunca kopyala.</b></div>''', ust='01/05', alt=KAYDIR)
SAB = [('İlk kez gelmedi','Merhaba <mark>[isim]</mark>, bugün <mark>[saat]</mark> randevunuz vardı, sizi bekledik. Umarız her şey yolundadır. Yeni bir saat isterseniz yazmanız yeterli.','Suçlama yok; kapı açık.'),
       ('Sık sık gelmiyor','Merhaba <mark>[isim]</mark>, son birkaç randevunuza gelemediniz. Yoğun saatlerde koltuğu boş tutmamak için bundan sonra randevuyu kapora ile alıyoruz. Anlayışınız için teşekkürler.','Kural koy, kişiselleştirme.'),
       ('Son dakika iptal etti','Haber verdiğiniz için teşekkürler <mark>[isim]</mark>. Bir dahaki sefere en az <mark>[2 saat]</mark> önce yazarsanız saati bekleyen başka birine verebiliriz. Görüşmek üzere.','Teşekkür et, sınırı nazikçe çiz.')]
for i,(bas,msj,ipucu) in enumerate(SAB):
    sayfa(f'{p}/{i+2}.html', 'z-krem', f'''
<div class="etiket u">Mesaj {i+1} · {bas}</div>
<h1 class="baslik b-l u">“{bas}” <em>için.</em></h1>
<div class="sablon">{msj}<span class="s">✓✓</span></div>
<div class="ipucu-yaz" style="top:1110px"><b style="color:var(--yazi-a)">Neden işe yarar:</b> {ipucu}</div>''', ust=f'0{i+2}/05', alt=KAYDIR)
sayfa(f'{p}/5.html', 'z-yesil', '''
<h1 class="baslik b-xl u" style="top:230px">Hatırlatmayı <em>SıraGO atsın.</em></h1>
<p class="metin" style="position:absolute;top:640px;left:var(--kenar);right:var(--kenar);font-size:36px">Randevudan 1 gün, 1 saat ve 15 dakika önce WhatsApp’tan hatırlatma gider. 1 saat kala “Geliyorum / İptal Et” diye sorar. Gelmeyen azalır, bu mesajları daha az yazarsın.</p>
<div style="position:absolute;top:1010px;left:var(--kenar)"><span class="dugme">Ücretsiz dene <svg class="ik"><use href="#ok"/></svg></span></div>''', ust='05/05', alt=alt('Kart bilgisi istenmez · Bağlantı profilde'))
aciklama(p, '''Gelmeyen müşteriye ne yazılır? Kırmadan, kızmadan 3 hazır mesaj. Kaydet, lazım olunca kopyala.

[isim] ve [saat] yerine kendi bilgini yaz.

Hatırlatmaları SıraGO atsın: randevudan 1 gün, 1 saat ve 15 dakika önce müşterine WhatsApp'tan gider. Bağlantı profilde.''', 'A')

# P03 · Adisyon fişi (yeşil zemin, mono)
p = os.path.join(G, '03-cumartesi-adisyonu')
sat = lambda a, b_: f'<div class="sat"><span>{a}</span><span>{b_}</span></div>'
sayfa(f'{p}/1.html', 'z-yesil', '''
<div class="fis">
  <div class="ort bas">BERBER DÜKKÂNI</div>
  <div class="ort">CUMARTESİ · 13:47</div>
  <div class="cizgi"></div>
  ''' + ''.join(sat(a,b_) for a,b_ in [('1 x "Yer var mı?"','tekrar'),('1 x "Abi 5 dk\'ya ordayım"','25 dk'),('1 x Sesli mesaj','2:14 dk'),('1 x "Kaçta açıksınız?"','yine'),('1 x Cevapsız arama','3 adet'),('1 x Aynı saate 2 kişi','sürpriz'),('1 x Soğuyan çay','ikram')]) + '''
  <div class="cizgi"></div>
  <div class="sat top"><span>TOPLAM</span><span>1 yorgun usta</span></div>
  <div class="cizgi"></div>
  <div class="ort">Bu fişi SıraGO kapatır.</div>
  <div class="barkod"></div>
</div>''', ust=False, alt=alt('Sen hangisini en çok yaşıyorsun?', 'Yoruma yaz'))
aciklama(p, '''Bir cumartesinin adisyonu. Toplam: 1 yorgun usta.

Randevu mesajlarına SıraGO cevap verir, hatırlatmayı atar, dolu saati söyler. Sen fişin geri kalanıyla uğraşırsın.

Senin cumartesi fişinde başka ne var? Yoruma yaz.''', 'E')

# P04 · Müşteri tipleri (gece carousel, 7 sayfa)
p = os.path.join(G, '04-her-berberin-5-musterisi')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="etiket u">Bunu yaşamayan yok</div>
<h1 class="baslik u" style="font-size:150px">Her berberin <em>5 müşterisi.</em></h1>
<p class="metin" style="position:absolute;top:820px;left:var(--kenar);right:var(--kenar);font-size:36px">Kaydır, en çok hangisini gördüğünü yorumlara yaz.</p>''', ust='01/07', alt=KAYDIR)
TIP = [('Son dakikacı','“Usta 10 dk sonra gelsem olur mu?” Cumartesi, saat 13:58.','takvim','Dolu saati söyler, en yakın boşu önerir: “Maalesef 14:00 dolu. 14:30 uygun mu?”'),
       ('5 dakikacı','“5 dk’ya ordayım.” 25 dakika sonra kapıda.','saat','15 dakika kala yazar: “Yola çıktınız mı?”'),
       ('Sesli mesajcı','2 dakika 14 saniyelik sesli mesaj. Konu: yarın 3’e yer var mı.','mikrofon','Sesli mesajı da anlar, yazıyla cevap verir.'),
       ('Gece kuşu','Saat 02:14: “Yarın sabah ilk saat kaçta?”','sohbet','Gece de cevap verebilir. İstemezsen kapalı mesajı atar ya da susar.'),
       ('Nostaljik','“Geçen sefer nasıl kestiysen.” Geçen sefer: 4 ay önce.','el','Müşteri randevu alırken not bırakabilir; not panelde görünür.')]
for i,(ad,ac,ik,ne) in enumerate(TIP):
    z = 'z-gece' if i % 2 == 0 else 'z-krem'
    sayfa(f'{p}/{i+2}.html', z, f'''
<div class="dev">0{i+1}</div>
<div class="etiket u">Müşteri tipi {i+1}/5</div>
<h1 class="baslik b-xl u" style="top:330px">{ad}.</h1>
<p class="metin" style="position:absolute;top:560px;left:var(--kenar);right:var(--kenar);font-size:40px;line-height:1.35">{ac}</p>
<div class="ne-yapar"><svg class="ik"><use href="#{ik}"/></svg><div><small>SıraGO ne yapar?</small><b>{ne}</b></div></div>''', ust=f'0{i+2}/07', alt=KAYDIR)
sayfa(f'{p}/7.html', 'z-yesil', '''
<h1 class="baslik b-xl u" style="top:230px">Hangisi <em>senin dükkânda</em> en çok?</h1>
<p class="metin" style="position:absolute;top:660px;left:var(--kenar);right:var(--kenar);font-size:38px">Yorumlara numarasını yaz. Bir ustayı etiketle, o da görsün.</p>
<div style="position:absolute;top:900px;left:var(--kenar)"><span class="dugme">Bağlantı profilde <svg class="ik"><use href="#ok"/></svg></span></div>''', ust='07/07', alt=alt('Sen makasına bak. Randevuyu SıraGO yazsın.'))
aciklama(p, '''Her berberin 5 müşterisi: son dakikacı, 5 dakikacı, sesli mesajcı, gece kuşu, nostaljik.

Senin dükkânda en çok hangisi var? Yorumlara numarasını yaz, bir ustayı etiketle.''', 'B')

# P05 · Not kâğıdı alıntı (krem, serif)
p = os.path.join(G, '05-cevapsiz-mesaj')
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="not-kagit"><div class="serif">Müşteri kaybetmek bir anda olmaz. <em>Cevapsız kalan bir mesajla başlar.</em></div><div class="imza">— Esnaf notu</div></div>''', alt=alt('Kaydet, dükkâna as.', 'SıraGO'))
aciklama(p, '''Müşteri kaybetmek bir anda olmaz. Cevapsız kalan bir mesajla başlar.

Makastayken, gece, cumartesi yoğunluğunda gelen mesajlara SıraGO senin numarandan cevap verir. Bağlantı profilde.

Katılıyorsan kaydet, bir esnaf arkadaşına gönder.''', 'D')

# P06 · Önce / Sonra
p = os.path.join(G, '06-once-sonra')
okunmamis = ''.join(f'<div style="display:flex;justify-content:space-between;align-items:center;padding:16px 22px;border-bottom:1px solid #1f2c34"><div><b style="font-size:24px;font-weight:600">{a}</b><span style="display:block;font-size:20px;color:#8696a0">{m}</span></div><i style="font-style:normal;min-width:32px;height:32px;border-radius:16px;background:#25d366;color:#0b141a;display:grid;place-items:center;font-weight:700;font-size:18px">{n}</i></div>' for a,m,n in [('Ayşe','Yarın müsait misiniz?',3),('Kerem','Usta açık mısın',2),('Selin','??',4)])
panel = ''.join(f'<div class="pnl-satir"><span class="saat">{s}</span><span class="kisi">{k}<small>{h}</small></span><span class="durum">Onaylı</span></div>' for s,k,h in [('10:00','Ayşe','Kesim'),('14:30','Kerem','Saç kesim'),('16:00','Selin','Boya')])
sayfa(f'{p}/1.html', 'z-krem', f'''
<div class="yarim z-gece" style="top:0"><span class="lbl">Önce.</span><span style="position:absolute;top:240px;left:var(--kenar);width:400px;font-size:30px;color:var(--gri-k);line-height:1.4">Akşam WhatsApp’ı açarsın: cevap bekleyen mesajlar.</span>
  <div class="tel" style="right:70px;top:110px;width:480px;height:640px"><div class="ekran wa"><div style="padding:56px 22px 12px"><b style="font-size:30px">Sohbetler</b></div>{okunmamis}</div></div></div>
<div class="yarim" style="top:675px;background:var(--krem)"><span class="lbl" style="top:70px;color:var(--yesil)">Sonra.</span><span style="position:absolute;top:160px;left:var(--kenar);width:400px;font-size:30px;color:var(--gri-a);line-height:1.4">Aynı kişiler, randevusu oluşmuş halde.</span>
  <div class="tel" style="right:70px;top:30px;width:480px;height:700px"><div class="ekran pnl"><div class="pnl-bas"><small>Yarın · 3 randevu</small><b>Randevular</b></div><div class="pnl-liste">{panel}</div></div></div></div>''', css='.yarim.z-gece{background:var(--gece);color:var(--yazi-k)} .pnl-satir{grid-template-columns:80px 1fr auto}', ust=False, alt='')
aciklama(p, '''Önce: akşam WhatsApp'ı açarsın, cevap bekleyen mesajlar.
Sonra: aynı kişiler, randevusu oluşmuş halde.

Aradaki farkı SıraGO yapar: gün içinde senin numarandan cevap verir, randevuyu panele yazar. Bağlantı profilde.''', 'A')

# P07 · İpucu listesi: cumartesi (carousel 7)
p = os.path.join(G, '07-cumartesi-5-ipucu')
sayfa(f'{p}/1.html', 'z-yesil', '''
<div class="etiket u">Kaydet</div>
<h1 class="baslik u" style="font-size:140px">Cumartesi yoğunluğunu <em>yönetmenin 5 yolu.</em></h1>''', ust='01/07', alt=KAYDIR)
IP = [('Hizmet sürelerini gerçek yaz.','Saç kesimi 30 dakika sürüyorsa 20 yazma. Yanlış süre bütün günü kaydırır.'),
      ('Öğle arasını takvime koy.','Yazılmayan mola hiç olmaz. 30 dakikayı kapat, sonra çalışmaya devam.'),
      ('Cumartesi için kapora iste.','En çok gelmeyen cumartesi olur. Küçük bir kapora koltuğu korur.'),
      ('Bekleme listesi tut.','Dolu güne yazanı geri çevirme; biri iptal ederse ilk ona haber ver.'),
      ('Randevu linkini paylaş.','WhatsApp durumuna ve Instagram profiline koy; müşteri saatini kendisi seçsin.')]
for i,(bas,ac) in enumerate(IP):
    z = 'z-krem' if i % 2 == 0 else 'z-gece'
    sayfa(f'{p}/{i+2}.html', z, f'''
<div class="dev">{i+1}</div>
<div class="etiket u">Yol {i+1}/5</div>
<h1 class="baslik b-l u" style="top:380px;right:200px">{bas}</h1>
<p class="metin" style="position:absolute;top:720px;left:var(--kenar);right:var(--kenar);font-size:38px;line-height:1.4">{ac}</p>''', ust=f'0{i+2}/07', alt=KAYDIR)
sayfa(f'{p}/7.html', 'z-yesil', '''
<h1 class="baslik b-l u" style="top:230px">Beşi de <em>SıraGO’da var.</em></h1>
<div style="position:absolute;top:520px;left:var(--kenar);right:var(--kenar);border-top:1.5px solid var(--cizgi)">''' + ''.join(f'<div style="display:flex;gap:22px;align-items:center;font-size:34px;font-weight:600;padding:22px 0;border-bottom:1.5px solid var(--cizgi)"><svg class="ik"><use href="#tik"/></svg>{t}</div>' for t in ['Hizmet süreleri','Mola ve kapalı saatler','Kapora (Standart ve üstü)','Bekleme listesi','7/24 randevu linki']) + '''</div>''', ust='07/07', alt=alt('Kaydet, cumartesi sabahı bak.', 'Bağlantı profilde'))
aciklama(p, '''Cumartesi yoğunluğunu yönetmenin 5 yolu:
1. Hizmet sürelerini gerçek yaz
2. Öğle arasını takvime koy
3. Cumartesi için kapora iste
4. Bekleme listesi tut
5. Randevu linkini paylaş

Kaydet, cumartesi sabahı aç. Beşini de SıraGO ile yapabilirsin; bağlantı profilde.''', 'D')

# P08 · Sohbet mizahı (gece)
p = os.path.join(G, '08-cevap-4-saat-sonra')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="etiket u">Gerçek hikâye gibi</div>
<h1 class="baslik b-l u">Cevap 4 saat sonra geldi. <em>Müşteri 3 saat önce gitti.</em></h1>''' + wa(b('gelen','Usta yarın 3’e yer var mı?','14:02') + b('gelen','?','14:31') + b('gelen','Tamam başka yere gittim','15:10') + b('giden','Pardon makastaydım, gel 3’e yazayım','18:47'), 'Kerem', 'K', 560, 620), alt=alt('Bunu yaşayan ustayı etiketle.'))
aciklama(p, '''14:02 "Usta yarın 3'e yer var mı?"
18:47 "Pardon makastaydım."
Arada müşteri başka dükkâna gitmişti.

SıraGO o mesaja hemen cevap verir: boş saati söyler, randevuyu oluşturur. Sen makasına bak. Bağlantı profilde.''', 'B')

# P09 · Büyük soru (krem)
p = os.path.join(G, '09-kacta-acıksiniz')
sayfa(f'{p}/1.html', 'z-krem', '''
<h1 class="baslik u" style="top:260px;font-size:132px">“Kaçta açıksınız?” sorusuna <em>bugün kaç kez</em> cevap verdin?</h1>
<p class="metin" style="position:absolute;top:1000px;left:var(--kenar);right:var(--kenar);font-size:36px">Yoruma sayıyı yaz. Yarından itibaren bu soruyu SıraGO cevaplasın.</p>''', css='.baslik em{color:var(--yesil)}', alt=alt('', 'Yoruma yaz'))
aciklama(p, '''"Kaçta açıksınız?" sorusuna bugün kaç kez cevap verdin? Yoruma sayıyı yaz.

SıraGO bu tür soruları da senin numarandan cevaplar, randevuyu oluşturur. Bağlantı profilde.''', 'E')

# P10 · Kopyala-yapıştır: zam duyurusu (krem carousel)
p = os.path.join(G, '10-zam-duyurusu')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="etiket u">Kopyala · yapıştır</div>
<h1 class="baslik b-xl u">Zam duyurusu <em>müşteri kırılmadan</em> nasıl yazılır?</h1>''', ust='01/04', alt=KAYDIR)
sayfa(f'{p}/2.html', 'z-krem', '''
<div class="etiket u" style="color:#b42318">Böyle yazma</div>
<h1 class="baslik b-l u">Kısa ama <em style="color:#b42318">soğuk.</em></h1>
<div class="sablon" style="background:#f1e7d4;color:#3a3a36">ZAM GELDİ. Saç 400 TL. Bilginize.<span class="s" style="color:#8a847a">✓✓</span></div>
<div class="ipucu-yaz" style="top:900px">Büyük harf bağırıyor gibi okunur. Neden olduğu yok, teşekkür yok.</div>''', ust='02/04', alt=KAYDIR)
sayfa(f'{p}/3.html', 'z-krem', '''
<div class="etiket u">Böyle yaz</div>
<h1 class="baslik b-l u">Önceden, <em>sebebiyle, teşekkürle.</em></h1>
<div class="sablon">Merhaba, <mark>[1 Kasım]</mark>’dan itibaren fiyatlarımızı güncelliyoruz: <mark>[hizmet – yeni fiyat]</mark>. Malzeme ve kira artışları nedeniyle bu kararı aldık. Bugüne kadarki desteğiniz için teşekkür ederiz; aynı özenle devam ediyoruz.<span class="s">✓✓</span></div>
<div class="ipucu-yaz" style="top:1110px">En az 1 hafta önce duyur. Eski fiyattan son randevu tarihini de yazabilirsin.</div>''', ust='03/04', alt=KAYDIR)
sayfa(f'{p}/4.html', 'z-yesil', '''
<h1 class="baslik b-l u" style="top:230px">WhatsApp durumu için <em>kısa hali.</em></h1>
<div class="sablon" style="top:560px">📌 <mark>[1 Kasım]</mark>’dan itibaren yeni fiyatlarımız geçerli. Bu tarihe kadar alınan randevular eski fiyattan. Teşekkürler!<span class="s">✓✓</span></div>
<div class="ipucu-yaz" style="top:960px;color:rgba(251,244,232,.8)">Duyuruyu atarken randevu linkini de ekle: eski fiyattan yetişmek isteyen hemen saat seçer.</div>''', ust='04/04', alt=alt('Kaydet, lazım olunca kopyala.'))
aciklama(p, '''Zam duyurusu müşteri kırılmadan nasıl yazılır? Kötü örnek, iyi örnek ve WhatsApp durumu için kısa hali.

Kaydet, lazım olunca köşeli parantezleri kendi bilgilerinle değiştirip kopyala. Bir esnaf arkadaşına gönder.''', 'D')

# P11 · Fiko sözlüğü 3 (krem + tilki)
p = os.path.join(G, '11-fiko-sozlugu-3')
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="etiket u">En çok duyulan cümle</div>
<h1 class="baslik mizah b-xl u" style="right:120px">“Geçen sefer <em>nasıl kestiysen.”</em></h1>
<div style="position:absolute;top:620px;left:var(--kenar)"><small style="display:block;font-size:22px;font-weight:650;letter-spacing:.14em;text-transform:uppercase;color:var(--gri-a)">Çevirisi</small><b style="display:block;font-family:var(--f-baslik);font-size:56px;font-weight:700;letter-spacing:-0.02em;margin-top:10px">Ben de hatırlamıyorum.</b></div>
<img class="tilki" src="@T/varliklar/tilki-3d-temiz.png" alt="" style="width:430px;right:-16px;top:620px;z-index:1">
<div style="position:absolute;left:0;right:0;top:920px;bottom:0;background:var(--yesil);border-radius:64px 64px 0 0;z-index:2;padding:64px var(--kenar);color:var(--krem)">
  <div style="font-family:var(--f-baslik);font-size:50px;font-weight:700;letter-spacing:-0.02em;line-height:1.08">Müşteri not bırakabilir.</div>
  <p style="font-size:29px;line-height:1.45;color:rgba(251,244,232,.78);margin-top:18px;max-width:800px">Randevu alırken “geçen seferki gibi, yanlar kısa” yazar; not senin panelinde durur.</p>
</div>''', ust='Fiko’nun sözlüğü · 3', css='.alt{color:rgba(251,244,232,.7)} .alt b{color:var(--krem)!important}', alt='<div class="alt" style="z-index:3"><span>Sözlüğe ne ekleyelim?</span><b>Yorumlara yaz</b></div>')
aciklama(p, '''"Geçen sefer nasıl kestiysen."
Çevirisi: Ben de hatırlamıyorum.

Fiko bu cümleyi her gün duyuyor. Müşteri randevu alırken not bırakabilir; not panelde durur.

Fiko'nun sözlüğüne ne ekleyelim? Yoruma yaz.''', 'E')

# P12 · Kendi hesabını yap (krem)
p = os.path.join(G, '12-kendi-hesabin')
bos = lambda: '<span style="display:inline-block;min-width:200px;border-bottom:4px solid var(--yesil);margin:0 10px"></span>'
sayfa(f'{p}/1.html', 'z-krem', f'''
<div class="etiket u">Kendi hesabını yap</div>
<h1 class="baslik b-l u">Gelmeyen müşteri sana <em>ayda kaça mal oluyor?</em></h1>
<div class="kart" style="position:absolute;left:var(--kenar);right:var(--kenar);top:600px;padding:48px 48px;font-size:38px;font-weight:600;line-height:2.2">
  Haftada gelmeyen{bos()}kişi<br>× ortalama ücretin{bos()}₺<br>× 4 hafta<br><span style="font-family:var(--f-baslik);font-weight:800;font-size:46px;color:var(--yesil)">= ayda{bos()}₺</span>
</div>''', alt=alt('Yorumlara yazma, kendine sakla.', 'Kaydet'))
aciklama(p, '''Gelmeyen müşteri sana ayda kaça mal oluyor? Boşlukları kendi rakamlarınla doldur. Yorumlara yazma, kendine sakla.

SıraGO randevudan 1 gün, 1 saat ve 15 dakika önce hatırlatır; 1 saat kala gelip gelmeyeceğini sorar. Gelmeyen azalır. Bağlantı profilde.''', 'D')

# P13 · Liste: linki koyacağın 6 yer (gece)
p = os.path.join(G, '13-linki-koyacagin-6-yer')
YER = [('WhatsApp durumu','Müşterilerin her gün görür.'),('Instagram profili','Bio bağlantısına ekle.'),('Google işletme profili','Haritada bulan, oradan randevu alır.'),('Dükkân camı','Paneldeki QR kodu yazdır, as.'),('Kartvizit','Arkasına QR, önüne adres.'),('WhatsApp karşılama mesajı','İlk mesajı atana link gitsin.')]
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="etiket u">Kaydet</div>
<h1 class="baslik b-l u">Randevu linkini <em>koyacağın 6 yer.</em></h1>
<div style="position:absolute;top:500px;left:var(--kenar);right:var(--kenar);display:grid;grid-template-columns:1fr 1fr;gap:18px">''' + ''.join(f'<div class="kart" style="padding:28px 30px"><i style="font-style:normal;font-family:var(--f-baslik);font-weight:800;font-size:44px;color:var(--parlak)">{i+1}</i><b style="display:block;font-size:30px;margin-top:6px">{a}</b><span style="display:block;font-size:23px;color:var(--gri-k);margin-top:6px;line-height:1.35">{c}</span></div>' for i,(a,c) in enumerate(YER)) + '</div>', alt=alt('Müşterin saatini 7/24 kendisi seçer.', 'Kaydet'))
aciklama(p, '''Randevu linkini koyacağın 6 yer: WhatsApp durumu, Instagram profili, Google işletme profili, dükkân camı (QR), kartvizit, WhatsApp karşılama mesajı.

SıraGO'da her işletmenin 7/24 açık bir randevu sayfası var. Kaydet, kurarken aç.''', 'D')

# P14 · Not kâğıdı 2 (gece zemin)
p = os.path.join(G, '14-iyi-usta')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="not-kagit"><div class="serif">İyi usta müşterisini bekletmez. <em>Mesajını da.</em></div><div class="imza">— Esnaf notu</div></div>''', alt=alt('Katılıyorsan kaydet.', 'SıraGO'))
aciklama(p, '''İyi usta müşterisini bekletmez. Mesajını da.

Elin doluyken gelen mesajlara SıraGO senin numarandan cevap verir. Bağlantı profilde.''', 'B')

# P15 · Bunu yaşadıysan (carousel, kuaför odaklı)
p = os.path.join(G, '15-bunu-yasadiysan')
YAS = [('Boya beklerken','3 mesaj, 1 sesli mesaj, 2 cevapsız arama. Eldivenler hâlâ elinde.'),
       ('Cumartesi 14:00','İki kişi aynı saate geldi. İkisine de “tamam canım” demiştin.'),
       ('Gece 01:12','“Yarın açık mısınız?” Sen uyuyordun, sabah unuttun.'),
       ('Bayram arifesi','Telefon susmadı. Kim kaçtaydı, hiçbir yere yazılmadı.')]
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="etiket u">Kuaförler, salonlar</div>
<h1 class="baslik u" style="font-size:150px">Bunu yaşadıysan <em>kaydır.</em></h1>''', css='.baslik em{color:var(--yesil)}', ust='01/06', alt=KAYDIR)
for i,(bas,ac) in enumerate(YAS):
    z = 'z-gece' if i % 2 == 0 else 'z-krem'
    sayfa(f'{p}/{i+2}.html', z, f'''
<div class="etiket u">Yaşandı {i+1}/4</div>
<h1 class="baslik b-xl u" style="top:330px">{bas}.</h1>
<p class="metin" style="position:absolute;top:620px;left:var(--kenar);right:var(--kenar);font-size:42px;line-height:1.35">{ac}</p>
<div style="position:absolute;left:var(--kenar);bottom:190px;font-size:30px;font-weight:650;color:var(--vurgu)">Yaşadım ✋ — yoruma yaz</div>''', ust=f'0{i+2}/06', alt=KAYDIR)
sayfa(f'{p}/6.html', 'z-yesil', '''
<h1 class="baslik b-xl u" style="top:230px">Dördünde de <em>SıraGO cevaplar.</em></h1>
<p class="metin" style="position:absolute;top:660px;left:var(--kenar);right:var(--kenar);font-size:36px">Senin WhatsApp numarandan; boş saati söyler, randevuyu oluşturur, dolu saati kimseye vermez.</p>
<div style="position:absolute;top:960px;left:var(--kenar)"><span class="dugme">Ücretsiz dene <svg class="ik"><use href="#ok"/></svg></span></div>''', ust='06/06', alt=alt('Sen işine odaklan, randevuyu SıraGO yazsın.'))
aciklama(p, '''Boya beklerken 3 mesaj. Cumartesi aynı saate iki kişi. Gece 01:12 "yarın açık mısınız?". Bayram arifesi susmayan telefon.

Kaçını yaşadın? Yoruma yaz, bir kuaför arkadaşını etiketle.

Dördünde de SıraGO senin numarandan cevap verir. Bağlantı profilde.''', 'C')

# P16 · Fiş 2: gelmeyen müşterinin faturası (gece, boşluklu)
p = os.path.join(G, '16-gelmeyenin-faturasi')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="fis" style="top:170px">
  <div class="ort bas">FATURA</div>
  <div class="ort">Gelmeyen 1 müşteri</div>
  <div class="cizgi"></div>
  ''' + ''.join(sat(a,b_) for a,b_ in [('Boş kalan koltuk','1 saat'),('“O saat dolu” dediğin','1 kişi'),('Bekleyen çay','soğudu'),('Aradın, açmadı','2 kez'),('Kaybolan ücret','____ ₺')]) + '''
  <div class="cizgi"></div>
  <div class="sat top"><span>ÖDEYEN</span><span>Sen</span></div>
  <div class="cizgi"></div>
  <div class="ort">Hatırlatma ücretsiz gider.</div>
  <div class="barkod"></div>
</div>''', ust=False, alt=alt('Boşluğa kendi rakamını yaz.', 'SıraGO'))
aciklama(p, '''Gelmeyen bir müşterinin faturası. Ödeyen: sen.

SıraGO randevudan önce WhatsApp'tan hatırlatır; 1 saat kala "Gelebilecek misiniz?" diye sorar. Gelemeyen iptal eder, saat başkasına açılır. Bağlantı profilde.''', 'A')

# P17 · Defter ve panel (saygılı karşılaştırma)
p = os.path.join(G, '17-defter-ve-panel')
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="etiket u">Defterine saygı</div>
<h1 class="baslik b-l u">İkisi de iş görür. <em>Biri cebinde.</em></h1>
<div style="position:absolute;top:560px;left:var(--kenar);width:430px;height:600px;background:#fffdf6;border-radius:10px;transform:rotate(-3deg);box-shadow:0 24px 50px rgba(19,39,28,.18);padding:50px 40px;background-image:repeating-linear-gradient(#fffdf6 0 55px,#e7dfcf 55px 57px);font-family:'Instrument Serif',serif;font-size:40px;line-height:57px;color:#2b2a26">
  10:00 Kerem<br><s>11:30 Emre</s> 12:00<br>14:00 Mehmet??<br>14:00 Burak<br><s>16:00</s> Selin
</div>
<div class="tel" style="right:60px;top:520px;width:460px;height:760px"><div class="ekran pnl"><div class="pnl-bas"><small>Bugün · 5 randevu</small><b>Randevular</b></div><div class="pnl-liste">''' + ''.join(f'<div class="pnl-satir"><span class="saat">{s}</span><span class="kisi">{k}</span><span class="durum">Onaylı</span></div>' for s,k in [('10:00','Kerem'),('12:00','Emre'),('14:00','Mehmet'),('15:00','Burak'),('17:00','Selin')]) + '''</div></div></div>''', css='.pnl-satir{grid-template-columns:76px 1fr auto;padding:14px 16px} .pnl-satir .saat{font-size:22px} .pnl-satir .kisi{font-size:22px}', alt=alt('Panel telefonunda, dükkân dışında da.'))
aciklama(p, '''Defterine saygı. İkisi de iş görür; biri cebinde.

SıraGO'da randevular panelde: telefondan bakarsın, aynı saate iki kişi yazılmaz, müşteri saatini kendisi seçer. Bağlantı profilde.''', 'A')

# P18 · Büyük cümle (yeşil)
p = os.path.join(G, '18-uygulama-indirmez')
sayfa(f'{p}/1.html', 'z-yesil', '''
<h1 class="baslik u" style="top:300px;font-size:150px">Müşterin uygulama <em>indirmez.</em></h1>
<p class="metin" style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);font-size:40px">Her zamanki gibi senin WhatsApp numarana yazar. <b style="color:var(--krem)">Gerisini SıraGO halleder.</b></p>''', alt=alt('Ücretsiz dene, kart bilgisi istenmez.', 'Bağlantı profilde'))
aciklama(p, '''Müşterin uygulama indirmez, üye olmaz. Her zamanki gibi senin WhatsApp numarana yazar.

SıraGO boş saati söyler, randevuyu oluşturur, hatırlatmayı atar. Ücretsiz dene, kart bilgisi istenmez. Bağlantı profilde.''', 'A')

# P19 · Kopyala-yapıştır: yorum isteme (carousel 4)
p = os.path.join(G, '19-yorum-isteme')
sayfa(f'{p}/1.html', 'z-krem', '''
<div class="etiket u">Kopyala · yapıştır</div>
<h1 class="baslik b-xl u">Müşteriden yorum <em>nasıl istenir?</em></h1>
<p class="metin" style="position:absolute;top:640px;left:var(--kenar);right:var(--kenar);font-size:36px">Haritada iyi yorum, yeni müşteri demek. Utanmadan istemenin 2 yolu.</p>''', ust='01/04', alt=KAYDIR)
YOR = [('Hizmetten hemen sonra','Bugün geldiğiniz için teşekkürler <mark>[isim]</mark>! Memnun kaldıysanız Google’da birkaç kelime yazmanız bizim için çok değerli: <mark>[yorum linki]</mark>'),
       ('Ertesi gün, kısa','Merhaba <mark>[isim]</mark>, yeni saçınız nasıl? 😊 Beğendiyseniz buraya bir yıldız bırakır mısınız: <mark>[yorum linki]</mark>')]
for i,(bas,msj) in enumerate(YOR):
    sayfa(f'{p}/{i+2}.html', 'z-krem', f'''
<div class="etiket u">Yol {i+1} · {bas}</div>
<h1 class="baslik b-l u">{bas}.</h1>
<div class="sablon">{msj}<span class="s">✓✓</span></div>''', ust=f'0{i+2}/04', alt=KAYDIR)
sayfa(f'{p}/4.html', 'z-yesil', '''
<h1 class="baslik b-l u" style="top:230px">Bunu da <em>SıraGO sorabilir.</em></h1>
<p class="metin" style="position:absolute;top:560px;left:var(--kenar);right:var(--kenar);font-size:36px">Randevudan 1 saat sonra müşteriye memnuniyetini sorar. Yorum Avcısı açıksa memnun kalanı yorum bırakmaya yönlendirir.</p>
<p style="position:absolute;top:860px;left:var(--kenar);font-size:26px;color:var(--ikincil)">Yorum Avcısı: Standart ve üstü paketlerde</p>''', ust='04/04', alt=alt('Kaydet, lazım olunca kopyala.', 'Bağlantı profilde'))
aciklama(p, '''Müşteriden yorum nasıl istenir? Utanmadan istemenin 2 yolu, kopyala-yapıştır.

SıraGO randevudan 1 saat sonra müşteriye memnuniyetini sorar; Yorum Avcısı açıksa memnun kalanı yorum bırakmaya yönlendirir (Standart ve üstü paketlerde).

Kaydet, bir esnaf arkadaşına gönder.''', 'C')

# P20 · Gece 02:14 gerçek bot akışı
p = os.path.join(G, '20-gece-0214')
sayfa(f'{p}/1.html', 'z-gece', '''
<div class="etiket u">Gece mesaisi</div>
<h1 class="baslik b-l u">Gece 02:14. <em>Cevap 02:14’te.</em></h1>''' + wa(b('gelen','Yarın sabah ilk saat ne zaman','02:14') + b('giden','Yarın (23 Ekim) için boş saatler: 09:00, 09:30, 11:00.<br>Size hangisi uygun?','02:14') + b('gelen','9 olsun, saç kesimi','02:15') + b('giden uzun','🗓️ Yarın (23 Ekim) · 🕐 09:00<br>✂️ Saç kesim<i class="bos"></i>Randevunuzu oluşturayım mı? ("evet" yazmanız yeterli)','02:15'), 'Emre', 'E', 520, 820), alt=alt('Sen uyu. Randevuyu SıraGO yazsın.'))
aciklama(p, '''Gece 02:14'te yazan müşteriye cevap 02:14'te gitti. Sen uyuyordun.

SıraGO gece de randevu alabilir; istemezsen mesai dışında kapalı mesajı atar ya da hiç cevap vermez. Ayar panelde. Bağlantı profilde.''', 'B')
print('gönderiler tamam')

# ───────────────────────── STORY'LER ─────────────────────────
# Çıkartma (anket/soru/test) yeri kesik çizgili kutuyla gösterilir; Instagram'da o kutunun üstüne çıkartma eklenir.
ST = os.path.join(KOK, 'story')
if os.path.isdir(ST): shutil.rmtree(ST)
NOTLAR = []
SCSS = '''.ust{top:200px} .s-et{position:absolute;top:320px;left:var(--kenar);right:var(--kenar)} .s-h{position:absolute;top:370px;left:var(--kenar);right:var(--kenar)}
.cikartma{position:absolute;left:150px;right:150px;height:300px;border:4px dashed var(--cizgi);border-radius:36px;display:grid;place-items:center;font-size:26px;font-weight:600;color:var(--ikincil);text-align:center}
.cikartma{visibility:hidden} /* yalnız yer tutucu; görselde görünmez */'''
def story(ad, zemin, govde, not_, cikartma=None, css=''):
    c = f'<div class="cikartma" style="top:{cikartma[0]}px">{cikartma[1]}<br>(buraya ekle)</div>' if cikartma else ''
    sayfa(os.path.join(ST, ad + '.html'), zemin, govde + c, css=SCSS + css, w=1080, h=1920)
    NOTLAR.append((ad, not_))

story('01-anket-telefon', 'z-gece', '<div class="etiket s-et">Anket</div><h1 class="baslik s-h" style="font-size:120px">Makastayken telefon çalınca <em>ne yaparsın?</em></h1>',
      'ANKET çıkartması: “Açarım” / “Çalsın dursun”', (1000,'Anket çıkartması'))
story('02-soru-bahane', 'z-krem', '<div class="etiket s-et">Soru kutusu</div><h1 class="baslik s-h" style="font-size:120px">Müşteriden duyduğun <em>en iyi bahane?</em></h1>',
      'SORU çıkartması: “Bahaneni yaz”. Gelen cevapları ertesi gün isimsiz paylaş.', (1000,'Soru çıkartması'), '.baslik em{color:var(--yesil)}')
story('03-test-ne-zaman', 'z-gece', '<div class="etiket s-et">Test</div><h1 class="baslik s-h" style="font-size:110px">Esnafa en çok randevu mesajı <em>ne zaman</em> gelir?</h1>',
      'TEST çıkartması: A) Sabah  B) Öğlen  C) Akşam  D) Gece — doğru cevap seçme; “Sizce?” diye sor, sonuçları paylaş (bu bir tahmin oyunu, rakam iddiası değil).', (1000,'Test çıkartması'))
story('04-bu-mu-su-mu', 'z-krem', '''<div class="etiket s-et">Hangisi?</div><h1 class="baslik s-h" style="font-size:110px">Randevu defteri mi, <em>telefonda panel mi?</em></h1>
<div style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);display:grid;grid-template-columns:1fr 1fr;gap:24px">
<div class="kart" style="height:360px;display:grid;place-items:center;font-family:var(--f-baslik);font-weight:800;font-size:60px">Defter</div>
<div class="kart" style="height:360px;display:grid;place-items:center;font-family:var(--f-baslik);font-weight:800;font-size:60px;color:var(--yesil)">Panel</div></div>''',
      'ANKET çıkartması kartların altına: “Defter” / “Panel”. Kimseyi küçümseme; ikisi de iş görür.', (1340,'Anket çıkartması'), '.baslik em{color:var(--yesil)}')
story('05-ipucu-sure', 'z-yesil', '''<div class="etiket s-et">Ustadan ipucu</div><h1 class="baslik s-h" style="font-size:120px">Hizmet süresini <em>gerçek yaz.</em></h1>
<p class="metin" style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);font-size:44px;line-height:1.4">Saç kesimi 30 dakika sürüyorsa 20 yazma. 10 dakikalık fark, akşama 1 saatlik gecikme olur.</p>''',
      'Çıkartma yok. Ertesi günkü (06) bunun devamı.')
story('06-ipucu-mola', 'z-yesil', '''<div class="etiket s-et">Ustadan ipucu</div><h1 class="baslik s-h" style="font-size:120px">Öğle arasını <em>takvime koy.</em></h1>
<p class="metin" style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);font-size:44px;line-height:1.4">Yazılmayan mola hiç olmaz. 30 dakikayı kapat; bot o saati kimseye vermez.</p>''', 'Çıkartma yok.')
story('07-fiko-cay', 'z-krem', '''<div class="etiket s-et">Fiko</div><h1 class="baslik mizah s-h" style="font-size:120px">Fiko’nun çayı <em>yine soğudu.</em></h1>
<p class="metin" style="position:absolute;top:760px;left:var(--kenar);width:560px;font-size:40px">Seninki de soğuyor mu?</p>
<img class="tilki" src="@T/varliklar/tilki-3d-temiz.png" style="width:640px;right:-60px;bottom:0">''',
      'EMOJİ KAYDIRICI çıkartması (☕) sol alta.', (1150,'Kaydırıcı ☕'), '.cikartma{left:var(--kenar);right:520px;height:220px}')
story('08-gece-kac', 'z-gece', '<div class="etiket s-et">Soru</div><h1 class="baslik s-h" style="font-size:120px">En geç saat kaçta <em>randevu mesajı</em> aldın?</h1>',
      'SORU çıkartması: “Saati yaz”. En ilginç cevapları paylaş.', (1000,'Soru çıkartması'))
story('09-kontrol-listesi', 'z-krem', '''<div class="etiket s-et">Kontrol listesi</div><h1 class="baslik s-h" style="font-size:96px">Cumartesi sabahı <em>5 dakikada:</em></h1>
<div style="position:absolute;top:720px;left:var(--kenar);right:var(--kenar);border-top:1.5px solid var(--cizgi-a)">''' + ''.join(f'<div style="display:flex;gap:24px;align-items:center;font-size:42px;font-weight:600;padding:30px 0;border-bottom:1.5px solid var(--cizgi-a)"><span style="width:52px;height:52px;border:3px solid var(--yesil);border-radius:12px;flex:none"></span>{t}</div>' for t in ['Bugünün randevularına bak','Molanı takvime koy','Gelmeyeceğini bildireni sil','Bekleyen var mı kontrol et','Linki WhatsApp durumuna at']) + '</div>',
      'Çıkartma yok. Cumartesi sabahı paylaş.', None, '.baslik em{color:var(--yesil)}')
story('10-dogru-yanlis-uygulama', 'z-gece', '''<div class="etiket s-et">Doğru mu, yanlış mı?</div><h1 class="baslik s-h" style="font-size:110px">“Müşteri randevu için <em>uygulama indirmeli.”</em></h1>''',
      'TEST çıkartması: Doğru / Yanlış (doğru cevap: Yanlış). Cevabı ertesi gün (11).', (1000,'Test çıkartması'))
story('11-cevap-uygulama', 'z-yesil', '''<div class="etiket s-et">Cevap</div><h1 class="baslik s-h" style="font-size:140px"><em>Yanlış.</em></h1>
<p class="metin" style="position:absolute;top:700px;left:var(--kenar);right:var(--kenar);font-size:46px;line-height:1.4">Müşterin her zamanki gibi senin WhatsApp numarana yazar. SıraGO cevap verir, randevuyu oluşturur.</p>
<div style="position:absolute;top:1150px;left:var(--kenar)"><span class="dugme">Bağlantı profilde <svg class="ik"><use href="#ok"/></svg></span></div>''',
      'BAĞLANTI çıkartması: beacons.ai/siragoapp (butonun üstüne).')
story('12-musteri-tipi-anket', 'z-krem', '''<div class="etiket s-et">Anket</div><h1 class="baslik s-h" style="font-size:110px">Hangisi seni <em>daha çok yorar?</em></h1>
<div style="position:absolute;top:760px;left:var(--kenar);right:var(--kenar);display:grid;gap:20px">
<div class="kart" style="font-size:40px;font-weight:650">A · “5 dk’ya ordayım” diyen</div><div class="kart" style="font-size:40px;font-weight:650">B · 2 dakikalık sesli mesaj atan</div></div>''',
      'ANKET çıkartması: “A” / “B”.', (1180,'Anket çıkartması'), '.baslik em{color:var(--yesil)}')
story('13-sesli-mesaj', 'z-gece', '''<div class="etiket s-et">Biliyor muydun?</div><h1 class="baslik s-h" style="font-size:120px">SıraGO <em>sesli mesajı</em> da anlar.</h1>''' +
      wa(b('gelen','<span class="ses"><i class="oynat"></i><span class="dalga">' + ''.join(f'<i style="height:{h}%"></i>' for h in [30,55,85,40,65,100,50,30,75,45,90,60,35,70,40,80,50,30,60]) + '</span><small>0:07</small></span>','10:12') + b('giden','Cumartesi (24 Ekim) için boş saatler: 11:00, 14:30.<br>Size hangisi uygun?','10:12'), 'Ayşe', 'A', 900, 680),
      'Çıkartma yok.')
story('14-tanidiklar', 'z-krem', '''<div class="etiket s-et">Sık sorulan</div><h1 class="baslik s-h" style="font-size:110px">“Annem yazınca da <em>bot mu cevap verecek?”</em></h1>
<div class="kart" style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);padding:46px 48px"><b style="font-family:var(--f-baslik);font-size:66px;color:var(--yesil)">Hayır.</b><p style="font-size:38px;line-height:1.4;margin-top:16px;color:var(--gri-a)">İstediğin kişiyi bottan ayırırsın. Sen yazarsan bot o sohbete 3 saat karışmaz.</p></div>''',
      'Çıkartma yok.', None, '.baslik em{color:var(--yesil)}')
story('15-gun-sonu', 'z-gece', '''<div class="etiket s-et">Gün sonu</div><h1 class="baslik s-h" style="font-size:130px">Kepenk indi. <em>Bugün kaç kişi tıraş ettin?</em></h1>''',
      'EMOJİ KAYDIRICI (✂️) ya da SORU çıkartması. Akşam 20:00-21:30 arası.', (1050,'Kaydırıcı ✂️'))
story('16-kapora-anket', 'z-krem', '''<div class="etiket s-et">Anket</div><h1 class="baslik s-h" style="font-size:110px">Cumartesi randevusu için <em>kapora ister misin?</em></h1>''',
      'ANKET: “İsterim” / “Ayıp olur”. Sonuç gelince 03 numaralı kapora videosunu paylaş.', (1000,'Anket çıkartması'), '.baslik em{color:var(--yesil)}')
story('17-hatirlatma-ornek', 'z-gece', '''<div class="etiket s-et">Müşterine giden mesaj</div><h1 class="baslik s-h" style="font-size:100px">Randevuya 1 saat kala <em>bu gider:</em></h1>''' +
      wa(b('gelen uzun','⏰ <b>Randevu Teyidi</b><i class="bos"></i>Merhaba Mehmet! Randevunuza <b>1 saat</b> kaldı.<i class="bos"></i>🏥 Kuzey Berber<br>✂️ Saç + sakal<br>🕐 Saat: 17:30<i class="bos"></i>Gelebilecek misiniz?<i class="bos"></i><b>1.</b> ✅ Geliyorum<br><b>2.</b> ❌ İptal Et','16:30'), 'Kuzey Berber', 'K', 760, 900),
      'Çıkartma yok.')
story('18-ucretsiz-dene', 'z-yesil', '''<h1 class="baslik s-h" style="top:420px;font-size:140px">Önce dene, <em>sonra karar ver.</em></h1>
<div style="position:absolute;top:900px;left:var(--kenar);right:var(--kenar);border-top:1.5px solid var(--cizgi)">''' + ''.join(f'<div style="display:flex;gap:22px;align-items:center;font-size:44px;font-weight:650;padding:30px 0;border-bottom:1.5px solid var(--cizgi)"><svg class="ik"><use href="#tik"/></svg>{t}</div>' for t in ['Ücretsiz deneme','Kart bilgisi istenmez','Kurulumda yardım']) + '</div>',
      'BAĞLANTI çıkartması: beacons.ai/siragoapp, listenin altına.', (1400,'Bağlantı çıkartması'), '.cikartma{height:200px}')
story('19-sen-hangisisin', 'z-krem', '''<div class="etiket s-et">Sen hangisisin?</div><h1 class="baslik mizah s-h" style="font-size:110px">Mesajı <em>gece 1’de</em> görüp sabah cevaplayan mı, hemen yazan mı?</h1>''',
      'ANKET: “Sabah yazarım” / “Hemen yazarım”.', (1080,'Anket çıkartması'))
story('20-dm-sor', 'z-gece', '''<div class="etiket s-et">Aklında soru mu var?</div><h1 class="baslik s-h" style="font-size:120px">Kurmadan önce <em>sor.</em></h1>
<p class="metin" style="position:absolute;top:780px;left:var(--kenar);right:var(--kenar);font-size:44px;line-height:1.4">Fiyat, kurulum, “bot ne yazar”… DM’den yaz, gerçek bir insan cevaplar.</p>''',
      'SORU çıkartması: “SıraGO’ya sor”.', (1150,'Soru çıkartması'))
with open(os.path.join(ST, 'CIKARTMALAR.txt'), 'w') as f:
    f.write('Story çıkartma notları (görselde bırakılan boşluğa ekle)\n\n' + '\n'.join(f'{a}.png → {n}' for a, n in NOTLAR) + '\n')
print('story tamam')
