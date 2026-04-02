# RANDEVU BOT SaaS — İŞ PLANI

---

## ÜRÜN NEDİR?

İşletmelere (berber, kuaför, dişçi, güzellik salonu, veteriner, diyetisyen vb.) 
WhatsApp üzerinden çalışan otomatik randevu yönetim sistemi.

Müşteri WhatsApp'tan yazar → Bot müsait saatleri gösterir → Müşteri seçer → 
Randevu oluşur → Hatırlatma gönderilir → İşletme panelden takip eder.

---

## NEDEN İŞE YARAR?

- Türkiye'de 500.000+ randevulu çalışan işletme var
- %90'ı hâlâ telefonla randevu alıyor
- Kaçan aramalar = kaybedilen müşteri
- WhatsApp Türkiye'nin 1 numaralı iletişim aracı
- İşletme sahibi telefonu açmadan randevu yönetiyor

---

## TEKNİK MİMARİ

### Teknoloji Stack
- **WhatsApp API:** Twilio WhatsApp veya WhatsApp Business API (Meta)
- **AI Motor:** Claude API (doğal dil anlama, Türkçe konuşma)
- **Backend:** Node.js + Express (senin stack'in)
- **Veritabanı:** PostgreSQL
- **Admin Panel:** React (web dashboard)
- **Bildirimler:** WhatsApp mesaj + SMS (opsiyonel)
- **Hosting:** Render (zaten kullanıyorsun)

### Sistem Akışı
```
Müşteri WhatsApp'tan yazar
        ↓
Bot karşılar: "Merhaba! Randevu almak ister misiniz?"
        ↓
Müşteri: "Evet, saç kesimi için"
        ↓
Bot (Claude API): Hizmeti anlar, müsait saatleri listeler
        ↓
"Yarın için müsait saatler:
 1️⃣ 10:00
 2️⃣ 11:30
 3️⃣ 14:00
 Hangisini istersiniz?"
        ↓
Müşteri: "2"
        ↓
Bot: "Randevunuz oluşturuldu! 
📅 Yarın 11:30 - Saç Kesimi
📍 Berber Ali, Bağcılar
Hatırlatma mesajı göndereceğim."
        ↓
Randevu öncesi otomatik hatırlatma
        ↓
İşletme sahibi admin panelden tüm randevuları görür
```

---

## MVP ÖZELLİKLERİ (1. VERSİYON)

### Bot Tarafı
- [ ] WhatsApp'tan mesaj alma ve cevaplama
- [ ] Claude API ile doğal Türkçe konuşma
- [ ] Müsait saatleri gösterme
- [ ] Randevu oluşturma ve onaylama
- [ ] Randevu öncesi hatırlatma mesajı (1 saat önce)
- [ ] Randevu iptal etme

### Admin Panel (Web)
- [ ] İşletme giriş ekranı
- [ ] Günlük/haftalık randevu takvimi görünümü
- [ ] Çalışma saatlerini ayarlama
- [ ] Hizmet listesi ve süreleri tanımlama
- [ ] Müşteri listesi
- [ ] Randevu onaylama / iptal etme
- [ ] Basit istatistikler (günlük randevu sayısı, iptal oranı)

### Süper Admin (Senin Panelin)
- [ ] Tüm işletmeleri görme ve yönetme
- [ ] Yeni işletme ekleme
- [ ] Ödeme takibi
- [ ] Sistem durumu izleme

---

## GELİR MODELİ

### Abonelik Paketleri

| Paket | Fiyat/Ay | Özellikler |
|-------|----------|------------|
| Başlangıç | 200 TL/ay | 1 çalışan, 100 randevu/ay, temel bot |
| Profesyonel | 400 TL/ay | 3 çalışan, sınırsız randevu, hatırlatma, istatistik |
| Premium | 750 TL/ay | Sınırsız çalışan, sınırsız randevu, özel bot mesajları, öncelikli destek |

### Gelir Projeksiyonu

| Ay | İşletme Sayısı | Tahmini Aylık Gelir |
|----|----------------|---------------------|
| 1. ay | 5 işletme | 1.000 - 2.000 TL |
| 3. ay | 20 işletme | 4.000 - 8.000 TL |
| 6. ay | 50 işletme | 10.000 - 25.000 TL |
| 12. ay | 150 işletme | 30.000 - 75.000 TL |

### Neden Pasif Gelir?
- Bir kere kurarsın, bot 7/24 çalışır
- İşletme aylık ödeme yapar (tekrarlayan gelir)
- Yeni müşteri eklemek = admin panelden 5 dakika
- Ölçekleme maliyeti neredeyse sıfır

---

## MALİYET ANALİZİ

### Başlangıç Maliyetleri
| Kalem | Maliyet |
|-------|---------|
| WhatsApp Business API (Meta onayı) | Ücretsiz başvuru |
| Twilio WhatsApp (alternatif) | İlk 5$ bedava kredi |
| Claude API | ~10-20$/ay (başlangıçta) |
| Render hosting | Ücretsiz tier veya ~7$/ay |
| Domain | ~150 TL/yıl |
| **TOPLAM BAŞLANGIÇ** | **~500 TL** |

### Aylık İşletme Maliyeti (50 müşteri olduğunda)
| Kalem | Maliyet |
|-------|---------|
| WhatsApp API mesaj ücreti | ~500-1.000 TL |
| Claude API | ~50-100$ (~2.000 TL) |
| Hosting | ~500 TL |
| **TOPLAM** | **~3.500-4.000 TL** |
| **GELİR (50 müşteri)** | **~15.000 TL** |
| **NET KÂR** | **~11.000 TL** |

---

## GELİŞTİRME TAKVİMİ

### Hafta 1: Temel Altyapı
- [ ] WhatsApp Business API başvurusu yap
- [ ] Node.js projesi oluştur
- [ ] PostgreSQL veritabanı şeması tasarla
- [ ] Claude API entegrasyonu (Türkçe randevu botu promptu)
- [ ] Temel mesaj alma/gönderme sistemi

### Hafta 2: Bot Geliştirme
- [ ] Randevu oluşturma akışı
- [ ] Müsait saat kontrolü
- [ ] Randevu onaylama ve iptal
- [ ] Hatırlatma sistemi (cron job)
- [ ] Hata yönetimi ve edge case'ler

### Hafta 3: Admin Panel
- [ ] React ile web dashboard
- [ ] İşletme giriş sistemi
- [ ] Takvim görünümü
- [ ] Hizmet ve saat yönetimi
- [ ] Müşteri listesi

### Hafta 4: Test & Lansman
- [ ] Kendi çevrenden 2-3 berber/kuaför ile test
- [ ] Hataları düzelt
- [ ] Ödeme sistemi (Papara veya havale)
- [ ] Landing page hazırla
- [ ] İlk 5 müşteriyi bul

---

## MÜŞTERİ BULMA STRATEJİSİ

### İlk 10 Müşteri (Hafta 4-6)
1. Kendi mahallendeki berber, kuaför, güzellik salonuna yüz yüze git
2. "2 hafta ücretsiz dene" de — risk sıfır
3. Çalıştığını görünce aylık pakete geç
4. Memnun müşteri sana 2-3 referans verir

### Ölçekleme (Ay 2-6)
1. Instagram reklamları (küçük bütçe, 500 TL/ay)
2. Google'da "randevu sistemi" SEO
3. Bionluk'ta ilan aç
4. "İlk ay ücretsiz" kampanyası
5. Referans programı: mevcut müşteri yeni müşteri getirirse 1 ay bedava

---

## İSİM ÖNERİLERİ

- **RandevuGO** (GO ekosistemiyle uyumlu!)
- SıramatikBot
- RandevuBot
- HemenRandevu
- SıraBende

---

## ÖNCELİK SIRASI

Bu proje UstaGO ile PARALEL yürüyecek:

| Saat Dilimi | UstaGO | RandevuGO |
|-------------|--------|-----------|
| Gündüz | Elektrik işi (maaş) | — |
| Akşam 19-21 | Bug fix + beta hazırlık | — |
| Akşam 21-23 | — | Bot geliştirme |
| Hafta sonu | Google Play yükleme | Admin panel |

---

*"Bir kere kur, sonra sadece müşteri ekle. Bot 7/24 senin yerine çalışsın."*
