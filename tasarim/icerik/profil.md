# Profil

## Kullanıcı adı
**@siragoapp** (öneri; Telegram botu `siragoapp_bot` ile aynı aile). Alınmışsa: `@sirago.app`, `@siragotr`. Instagram ve TikTok'ta aynı ad.

## İsim alanı (Instagram aramada bu alan da taranır)
**SıraGO · WhatsApp Randevu Asistanı** (34 karakter). Esnaf “randevu” ya da “whatsapp randevu” diye aradığında çıkarız.

## Bio (150 karakter sınırı)
Önerilen (137 karakter):
```
Berber, kuaför ve salonlar için WhatsApp randevu asistanı.
Müşterin yazar, randevuyu SıraGO yazar.
Ücretsiz dene, kart bilgisi istenmez 👇
```
Alternatif (134 karakter, sektör satırlı):
```
Müşterin WhatsApp'tan yazar, randevuyu SıraGO yazar.
Berber · Kuaför · Güzellik salonu · Klinik
Ücretsiz dene, kart bilgisi istenmez 👇
```
Tek emoji (👇) bilinçli: linki gösterir. Başka emoji yok.

## Profil fotoğrafı
`maskot/marka/profil-instagram-whatsapp.png`: düz tilki, yeşil zemin (onaylandı). WhatsApp profiliyle aynı yüz → esnafa “bu aynı firma” güveni. 110 px'lik dairede 3D tilkiden daha net.
Not: dosyanın tilki çevresinde ince, kesik beyaz bir kontur var; büyük boyda (WhatsApp profil önizlemesi) fark edilebilir. İstersen temizlenmiş bir kopyasını çıkarırım.

## Link: Türkçe karakterli alan adı sorunu
`sırago.com` IDN bir alan adı (ı harfi). Bio linkine yazıldığında Instagram ve TikTok çoğu zaman bunu **`xn--srago-n4a.com`** (punycode) olarak gösterir; bazı uygulama içi tarayıcılar hiç açmaz. Şüpheci esnaf için `xn--...` adresi **oltalama sitesi gibi görünür**; bu, güven hedefimize doğrudan zarar verir.

Öneri:
1. **ASCII bir alan adı al** ve `sırago.com`'a yönlendir: `sirago.app`, `siragoapp.com` ya da `sirago.com.tr` (müsaitlik kontrol edilmeli; hiçbirinin sizde olduğunu bilmiyorum).
2. Bio linki: `https://sirago.app/?utm_source=instagram&utm_medium=bio` (TikTok için `utm_source=tiktok`). Böylece kayıtların kaçının sosyal medyadan geldiğini panelden/analitikten görürsün.
3. ASCII alan adı gelene kadar geçici: `https://xn--srago-n4a.com/?utm_source=instagram&utm_medium=bio`. Çalışır ama çirkin görünür; bio metnine ayrıca “sırago.com” yazılabilir (tıklanmaz ama okunur).
4. Bot imzası (`━━━ 🚀 SıraGO ile güçlendirilmiştir · sırago.com`) da aynı sorunu taşır: WhatsApp IDN'i tıklanabilir yapmayabilir. ASCII alan adı alınırsa `randevugo/src/utils/siragoImza.js` içinde de değiştirmek mantıklı.

## Öne çıkanlar (A stili, onaylandı)
SıraGO · Nasıl çalışır · Kurulum · Fiyat · Sorular · Güven. Kapaklar `tasarim/instagram/one-cikan/`, içerik eşleşmesi aynı klasördeki README'de.
“Esnaf Yorumları” öne çıkanı **bilerek yok**: izinli gerçek referans olmadan açılmaz. İlk izinli esnaf geldiğinde 7. öne çıkan olarak eklenir.

## Sabitlenen 3 gönderi
1. Makas elindeyken randevuyu kim yazıyor? (carousel) 2. Şüphelenmekte haklısın 3. Reels-01 Elin makasta
