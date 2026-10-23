# Fiko ve Mesaj — Treatment (Living Screencast, dikey)

**Biçim:** 1080×1920, 30 fps, ~42 sn. Türkçe. Seslendirme yok (kullanıcı sonra okuyacak); altyazılar ekrana yanık
ve `.srt`. Storyboard istenmedi. Ürün gerçekleri yalnız koddan: bot metinleri `sohbetAsistani.js`, `botMesajlar.js`,
`hatirlatma.js`, push `randevu.js:528`, panel arayüzü `admin-panel/src/components/Mobil/BugunMobil.jsx` + `App.jsx`
alt sekmeleri. Rakam, fiyat, deneme süresi, uydurma iddia yok; panelin ₺ özet kartı kadraja girmez.

## Üç yapı

1. **Bir mesajın yolculuğu (seçilen).** Tek bir müşteri mesajı: gece gelir → Fiko cevaplar → randevu panele düşer →
   üç hatırlatma → cumartesi 17:00'de müşteri gelir, esnaf "Geldi ✓"ya dokunur. Tek nesne (Mehmet'in randevusu),
   tek hedef, tek dönüş: filmin tamamında elini telefona sürmeyen esnaf, sonda ilk kez dokunur ve tek yaptığı "Geldi ✓".
2. **Bir günün akışı.** Sabahtan akşama panel; saat ve müzik değişir. Güzel ama "çok randevu" iması rakam iddiasına
   kayar; tek özelliği derinlemesine göstermez.
3. **Yarış.** Bölünmüş ekran: elle cevap yazan esnaf vs. SıraGO. Eski yolu göstermek eli (el yok kuralı) ve
   "kaçan müşteri" gibi iddiaları gerektirir.

Seçim 1: dikey kadrajda iki pencere (WhatsApp ↔ panel) arasında tek bir nesneyi takip etmek bu stilin
"sebep burada, sonuç orada" kamerasına en iyi oturan yapı. Açılış "bildirim" (stilin açılışlarından), son "maskot
uyur" + diegetik başlık.

**Logline:** Dükkân kapandıktan sonra gelen bir WhatsApp mesajını küçük piksel tilki Fiko yakalar; cevaplar, randevuyu
yazar, üç kez hatırlatır — ve esnafın tek işi, müşteri geldiğinde "Geldi ✓"ya dokunmak olur.

**Kurulum → dönüş → son:** Perşembe gece mesaj (esnaf yok) → Fiko her şeyi yapar → Cumartesi 17:00 esnafın ilk ve tek
dokunuşu; Fiko, bitmiş randevunun üstünde uyur.

## Benchmark

- **Öğren:** Apple Guided Tour (her cümlede tek özellik, sakin tempo); Screen Studio kayıtları (imlece/sebebe
  yaklaşma, pencere duvar kâğıdında süzülür, tıklamada küçük itme); Duolingo maskot oyunculuğu (hazırlık çömelmesi,
  iniş ezilmesi, gözlerle oyunculuk).
- **Alma:** karakterleri, arayüzleri, müziği, belirli çekimleri, logo/yazı tipi tasarımları. WhatsApp'ın logosu ve
  bildirim sesi kullanılmaz (yeşil başlık + baloncuk dili yeterli).

## Çekim listesi

| # | Çekim | Kadraj / açı | Kamera | Süre | Neden |
|---|---|---|---|---|---|
| 1 | Kilit ekranı, perşembe 21:40; bildirim düşer, Fiko içinden çıkar | tam pencere | yavaş drift → bildirime itme | 0–3.4 | kanca: mesaj gece gelir; maskotun doğuşu (match-cut origin) |
| 2 | Sohbet: Fiko mesajın üstünde koşarak okur | yakın (baloncuk) | imlece itme, takip | 3.4–7.0 | yazılım okur → maskot okur |
| 3 | Panele kırbaç geçiş, boş 17:00'e bakıp döner | orta | whip-pan (bulanık) gidiş-dönüş | 7.0–8.6 | "boş saati bilir" sebep-sonuç |
| 4 | Botun cevabı yazılır, Fiko giden baloncuğa biner | orta | baloncukla yukarı takip | 8.6–12.0 | moving floor: cevap gider |
| 5 | "Evet" → onay baloncuğu; Fiko sevinir | orta | hafif geri çekilme | 12.0–15.0 | randevu oluştu |
| 6 | Panel telefonu: "🎉 Yeni Randevu" push'u, Fiko push'a biner | tam pencere | whip-pan + itme | 15.0–19.0 | panele kendiliğinden düşer |
| 7 | ▶▶ zaman atlaması: Cuma 17:00 / Cmt 16:00 / 16:45 — üç hatırlatma; Fiko zil çalar | yakın sohbet | hızlanan drift, raf odak | 19.0–28.0 | hatırlatma zinciri (24 sa + 1 sa + 15 dk) |
| 8 | "1" → "✅ Harika, sizi bekliyoruz!" | yakın | itme + vinyet donma | 28.0–30.5 | müşteri geliyor (spotlight freeze) |
| 9 | Panel Bugün 17:00; sessizlik; dokunuş → Geldi ✓ | yakın satır | yavaş itme, sessizlik | 30.5–36.0 | dönüş: esnafın tek dokunuşu |
| 10 | Geri çekil, Fiko satırda uyur; diegetik SıraGO bildirimi | tam pencere | geri çekilme | 36.0–42.0 | yankılanan son: açılıştaki bildirim artık marka |

En az dört kamera hareketi: drift, itme, whip-pan, takip, geri çekilme, vinyet donma. İmza çekim: 4 → 6 arası tek
akış (giden baloncuk → push bildirimi), Fiko'nun iki uygulama arasında "taşıdığı" randevu.

## Vuruş tablosu (saniye)

0.0 kilit ekranı, saat 21:40 · 0.6 bildirim iner · 1.2 Fiko bildirimin içinde göz kırpar · 1.9 hazırlık çömelmesi ·
2.2 zıplar · 2.6 baloncuğa iner (toz) · 3.4 sohbet açılır · 3.6–6.4 Fiko satır satır koşar, gözler okur ·
6.6 "!" · 7.0 kırbaç → panel takvimi · 7.6 17:00 boş, Fiko kalem · 8.0 kırbaç dönüş · 8.6–10.2 cevap baloncuğu
yazılır · 10.4 gider, Fiko biner · 12.0 "Evet" gelir · 12.6 onay baloncuğu · 13.0 Fiko sevinir · 15.0 kırbaç → panel
telefonu · 15.6 push iner · 16.2 Fiko push'a atlar · 19.0 ▶▶ etiketi · 19.6 / 22.4 / 25.2 üç hatırlatma ·
27.0 "1" · 27.6 "✅ Harika, sizi bekliyoruz!" · 28.2 vinyet donma · 30.5 kırbaç → Bugün · 31.5–33.0 sessizlik ·
33.2 dokunuş → satır açılır · 34.0 "Geldi ✓" · 34.4 rozet Geldi ✓ · 35.0 Fiko mutlu zıplar · 36.0 geri çekil ·
37.5 Fiko uyur (zZ) · 38.2 SıraGO bildirimi iner · 39.0 Fiko göz açar, bildirime bakar · 42.0 son.

## İpucu haritası (müzik)

Tempo 112 BPM (bir vuruş ≈ 0.536 sn), 4/4. İki çözünürlük: hi-fi katman (sentezli elektrik piyano, yuvarlak bas,
fırçalı davul) dünya; kare dalga chiptune Fiko. Bölümler:
- 0–3.4 yalnız oda tonu + tek piyano akoru (bildirimde)
- 3.4–15 piyano + bas, Fiko'nun adımlarında chiptune notalar; davul 8.6'da girer
- 15–19 tam grup; push'ta zil + crash
- 19–28 ▶▶ zaman atlaması: davul ikiye katlanır (hızlanma), her hatırlatmada chiptune motif
- 28.2 vinyet donma: tek tutulan pad
- 31.5–33.0 sessizlik (oda tonu) → "Geldi ✓" ilk ses: piyano + chiptune birlikte (çözülme)
- 36–42 yavaşlayan kapanış, Fiko uyurken chiptune ninni motifi, son akor 41.

## Ses tasarımı

| Bölüm | Ambiyans | Foley | Müzik |
|---|---|---|---|
| Gece kilit | oda tonu, uzak sokak | bildirim çınlaması (kendi sentezimiz), titreşim | tek akor |
| Sohbet | oda tonu | 8-bit adımlar, zıplama/iniş, "!" blip, baloncuk pop, gönderme tık | piyano + bas + chiptune |
| Panel | — | push çınlaması, kart yerleşme tık, kalem çizik (8-bit) | tam |
| Zaman atlaması | saat tik-tak hızlı | 8-bit zil ×3, baloncuk pop | hızlanan davul |
| Cumartesi 17:00 | dükkân ambiyansı (kısık) | dokunuş tık, "Geldi ✓" onay sesi | sessizlik → çözülme |
| Son | dükkân → sessiz | Fiko horlaması (8-bit), bildirim | ninni motifi |

Geçişlerde fışt/whoosh YOK (kullanıcı kuralı): kırbaç geçişleri müzikteki vuruşa oturur, ses efekti yok.
İki sessizlik: 28.2 vinyet donmada (müzik yalnız pad), 31.5–33.0 (yalnız oda tonu).
J-cut: 14.6'da panelin push çınlaması görüntüden önce gelir; L-cut: 30.5'te hatırlatma motifi panele taşar.

## Altyazı ve başlık

Altta buzlu cam hap (nötr, tek vurgu SıraGO yeşili), Inter 600, 46 px, en çok 2 satır, kadrajın alt bandında —
konuşulan öğenin ve Fiko'nun üstünde değil. Bölüm hapı solda üstte (01 Cevap · 02 Panel · 03 Hatırlatma · 04 Geldi).
Başlık diegetik: son bildirim "SıraGO — Sen işine bak. Randevuyu SıraGO yazsın."

1. 0.5–3.4 "Dükkân kapandı. Mesajlar kapanmadı."
2. 3.8–7.6 "SıraGO, senin WhatsApp'ından cevap verir."
3. 8.0–12.0 "Boş saati bilir, randevuyu yazar."
4. 15.4–19.0 "Randevu panele kendiliğinden düşer."
5. 19.6–27.4 "Randevudan önce hatırlatır: 1 gün, 1 saat ve 15 dakika kala."
6. 27.6–30.4 "Müşteri 'Geliyorum' der."
7. 33.6–37.4 "Sen sadece işine bakarsın."
