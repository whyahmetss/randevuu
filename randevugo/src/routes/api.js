const express = require('express');
const router = express.Router();
const { authMiddleware, superAdminMiddleware, odemeKontrol } = require('../middleware/auth');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const botController = require('../controllers/botController');
const bookingController = require('../controllers/bookingController');

// ==================== AUTH ====================
router.post('/auth/giris', (req, res) => authController.giris(req, res));
router.post('/auth/kayit', (req, res) => authController.botKayit(req, res));
router.get('/auth/profil', authMiddleware, (req, res) => authController.profilim(req, res));

// ==================== İLETİŞİM (public) ====================
router.post('/iletisim', (req, res) => adminController.iletisimGonder(req, res));

// ==================== WHATSAPP WEBHOOK ====================
router.post('/webhook/whatsapp', (req, res) => botController.gelenMesaj(req, res));
router.post('/bot/test', authMiddleware, (req, res) => botController.testMesaj(req, res));

// ==================== ADMIN PANEL ====================
router.get('/randevular', authMiddleware, odemeKontrol, (req, res) => adminController.randevulariGetir(req, res));
router.put('/randevular/:id/durum', authMiddleware, odemeKontrol, (req, res) => adminController.randevuDurumGuncelle(req, res));

router.get('/hizmetler', authMiddleware, odemeKontrol, (req, res) => adminController.hizmetleriGetir(req, res));
router.post('/hizmetler', authMiddleware, odemeKontrol, (req, res) => adminController.hizmetEkle(req, res));
router.put('/hizmetler/:id', authMiddleware, odemeKontrol, (req, res) => adminController.hizmetGuncelle(req, res));
router.delete('/hizmetler/:id', authMiddleware, odemeKontrol, (req, res) => adminController.hizmetSil(req, res));

router.get('/calisanlar', authMiddleware, odemeKontrol, (req, res) => adminController.calisanlariGetir(req, res));
router.post('/calisanlar', authMiddleware, odemeKontrol, (req, res) => adminController.calisanEkle(req, res));
router.put('/calisanlar/:id', authMiddleware, odemeKontrol, (req, res) => adminController.calisanGuncelle(req, res));
router.delete('/calisanlar/:id', authMiddleware, odemeKontrol, (req, res) => adminController.calisanSil(req, res));
router.get('/calisanlar/:id/hizmetler', authMiddleware, odemeKontrol, (req, res) => adminController.calisanHizmetleriGetir(req, res));
router.put('/calisanlar/:id/hizmetler', authMiddleware, odemeKontrol, (req, res) => adminController.calisanHizmetleriGuncelle(req, res));
router.put('/kapora', authMiddleware, odemeKontrol, (req, res) => adminController.kaporaToggle(req, res));

router.get('/musteriler', authMiddleware, odemeKontrol, (req, res) => adminController.musterileriGetir(req, res));

router.get('/istatistikler', authMiddleware, (req, res) => adminController.istatistikler(req, res));
router.get('/grafik-verileri', authMiddleware, (req, res) => adminController.grafikVerileri(req, res));
router.get('/dashboard-ekstra', authMiddleware, (req, res) => adminController.dashboardEkstra(req, res));

router.get('/ayarlar', authMiddleware, (req, res) => adminController.isletmeAyarlari(req, res));
router.put('/ayarlar', authMiddleware, (req, res) => adminController.isletmeGuncelle(req, res));
router.get('/kara-liste', authMiddleware, (req, res) => adminController.karaListeGetir(req, res));
router.post('/kara-liste', authMiddleware, (req, res) => adminController.karaListeEkle(req, res));
router.delete('/kara-liste/:id', authMiddleware, (req, res) => adminController.karaListeSil(req, res));
router.get('/paket', authMiddleware, (req, res) => adminController.paketBilgisi(req, res));
router.get('/bot/durum', authMiddleware, (req, res) => adminController.botDurum(req, res));
router.put('/bot/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.botAyarlarGuncelle(req, res));
router.post('/bot/telegram/bagla', authMiddleware, odemeKontrol, (req, res) => adminController.telegramBagla(req, res));
router.post('/bot/telegram/ayir', authMiddleware, odemeKontrol, (req, res) => adminController.telegramAyir(req, res));
router.post('/bot/whatsapp/bagla', authMiddleware, odemeKontrol, (req, res) => adminController.whatsappBagla(req, res));
router.get('/bot/wp/durum', authMiddleware, odemeKontrol, (req, res) => adminController.wpWebDurum(req, res));
router.post('/bot/wp/baslat', authMiddleware, odemeKontrol, (req, res) => adminController.wpWebBaslat(req, res));
router.post('/bot/wp/ayir', authMiddleware, odemeKontrol, (req, res) => adminController.wpWebAyir(req, res));
router.get('/bot/wp/sse', authMiddleware, odemeKontrol, (req, res) => adminController.wpWebSse(req, res));

// ==================== KAMPANYALAR ====================
router.get('/kampanyalar', authMiddleware, odemeKontrol, (req, res) => adminController.kampanyalariGetir(req, res));
router.post('/kampanyalar', authMiddleware, odemeKontrol, (req, res) => adminController.kampanyaEkle(req, res));
router.post('/kampanyalar/:id/gonder', authMiddleware, odemeKontrol, (req, res) => adminController.kampanyaGonder(req, res));
router.delete('/kampanyalar/:id', authMiddleware, odemeKontrol, (req, res) => adminController.kampanyaSil(req, res));

// ==================== MEMNUNIYET ====================
router.get('/memnuniyetler', authMiddleware, odemeKontrol, (req, res) => adminController.memnuniyetleriGetir(req, res));

// ==================== BEKLEME LİSTESİ ====================
router.get('/bekleme-listesi', authMiddleware, odemeKontrol, (req, res) => adminController.beklemeListesiGetir(req, res));

// ==================== SUPER ADMIN ====================
router.get('/admin/isletmeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.tumIsletmeler(req, res));
router.post('/admin/isletmeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeEkle(req, res));
router.put('/admin/isletmeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeGuncelleAdmin(req, res));
router.delete('/admin/isletmeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeSil(req, res));
router.get('/admin/saas-metrikleri', authMiddleware, superAdminMiddleware, (req, res) => adminController.saasMetrikleri(req, res));
router.get('/admin/isletmeler/:id/detay', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeDetay(req, res));
router.post('/admin/isletmeler/:id/deneme-uzat', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeDenemeUzat(req, res));
router.put('/admin/isletmeler/:id/not', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeNotEkle(req, res));
router.post('/admin/impersonate/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.impersonate(req, res));

router.get('/admin/odemeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeleriGetir(req, res));
router.post('/admin/odemeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeEkle(req, res));
router.put('/admin/odemeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeGuncelle(req, res));
router.get('/admin/isletmeler/:id/odeme-profili', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeOdemeProfili(req, res));
router.post('/admin/odemeler/:id/ertele', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeErteleme(req, res));

// ==================== İLETİŞİM MESAJLARI (SuperAdmin) ====================
router.get('/admin/iletisim', authMiddleware, superAdminMiddleware, (req, res) => adminController.iletisimListele(req, res));
router.put('/admin/iletisim/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.iletisimOkundu(req, res));
router.delete('/admin/iletisim/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.iletisimSil(req, res));

// ==================== ÖDEME (Shopier + havale) ====================
router.post('/odeme/iyzico/baslat', authMiddleware, (req, res) => adminController.iyzicoBaslat(req, res));
router.post('/odeme/iyzico/callback', (req, res) => adminController.iyzicoCallback(req, res));
router.get('/odeme/shopier/baslat', authMiddleware, (req, res) => adminController.shopierOdemeBaslat(req, res));
router.post('/odeme/shopier/webhook', (req, res) => adminController.shopierWebhook(req, res));
router.post('/odeme/havale', authMiddleware, (req, res) => adminController.havaleGonder(req, res));
router.get('/odeme/durum', authMiddleware, (req, res) => adminController.odemeDurum(req, res));

// ==================== AVCI BOT ====================
router.post('/admin/avci/tarama', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciTarama(req, res));
router.post('/admin/avci/toplu-tarama', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciTopluTarama(req, res));
router.post('/admin/avci/sosyal-tarama', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciSosyalTarama(req, res));
router.get('/admin/avci/liste', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciListe(req, res));
router.get('/admin/avci/istatistik', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciIstatistik(req, res));
router.get('/admin/avci/gunluk', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciGunlukListe(req, res));
router.put('/admin/avci/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciDurumGuncelle(req, res));
router.delete('/admin/avci/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.avciSil(req, res));

// ==================== SATIŞ BOTU ====================
router.post('/admin/satis-bot/baslat', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotBaslat(req, res));
router.post('/admin/satis-bot/durdur', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotDurdur(req, res));
router.get('/admin/satis-bot/durum', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotDurum(req, res));
router.post('/admin/satis-bot/gonderim-baslat', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotGonderimBaslat(req, res));
router.post('/admin/satis-bot/gonderim-durdur', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotGonderimDurdur(req, res));
router.get('/admin/satis-bot/konusmalar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotKonusmalar(req, res));
router.put('/admin/satis-bot/ayarlar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotAyarGuncelle(req, res));
router.get('/admin/satis-bot/wp-yok', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotWpYok(req, res));
router.get('/admin/satis-bot/numaralar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotNumaralar(req, res));
router.post('/admin/satis-bot/numaralar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotNumaraEkle(req, res));
router.delete('/admin/satis-bot/numaralar/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotNumaraSil(req, res));
router.put('/admin/satis-bot/numaralar/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisBotNumaraDurumGuncelle(req, res));

// ==================== API DASHBOARD ====================
router.get('/admin/api-dashboard', authMiddleware, superAdminMiddleware, (req, res) => adminController.apiDashboard(req, res));

// ==================== İŞLETME KARŞILAŞTIRMA RAPORU ====================
router.get('/admin/karsilastirma', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeKarsilastirma(req, res));

// ==================== MÜŞTERİ SEGMENTASYONU ====================
router.get('/admin/segmentasyon', authMiddleware, superAdminMiddleware, (req, res) => adminController.musteriSegmentasyon(req, res));

// ==================== İŞLETME ONBOARDING ====================
router.get('/admin/onboarding', authMiddleware, superAdminMiddleware, (req, res) => adminController.onboardingDurum(req, res));

// ==================== SATIŞ BOT ŞABLONLARI ====================
router.get('/admin/satis-bot/sablonlar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisSablonlariGetir(req, res));
router.post('/admin/satis-bot/sablonlar', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisSablonEkle(req, res));
router.put('/admin/satis-bot/sablonlar/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisSablonGuncelle(req, res));
router.delete('/admin/satis-bot/sablonlar/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisSablonSil(req, res));
router.get('/admin/satis-bot/sablonlar/performans', authMiddleware, superAdminMiddleware, (req, res) => adminController.satisSablonPerformans(req, res));

// ==================== MÜŞTERİ AKTİVİTE & BİLDİRİM MERKEZİ ====================
router.get('/admin/musteri-aktivite', authMiddleware, superAdminMiddleware, (req, res) => adminController.musteriAktivite(req, res));
router.get('/admin/bildirimler', authMiddleware, superAdminMiddleware, (req, res) => adminController.bildirimMerkezi(req, res));

// ==================== AUDIT LOG ====================
router.get('/admin/audit-log', authMiddleware, superAdminMiddleware, (req, res) => adminController.auditLogListele(req, res));

// ==================== UPTIME & HEALTH MONITOR ====================
router.get('/admin/sistem-durumu', authMiddleware, superAdminMiddleware, (req, res) => adminController.sistemDurumu(req, res));

// ==================== DESTEK TALEPLERİ (Ticket) ====================
router.post('/destek', authMiddleware, (req, res) => adminController.destekTalebiOlustur(req, res));
router.get('/destek', authMiddleware, (req, res) => adminController.destekTaleplerimGetir(req, res));
router.get('/admin/destek', authMiddleware, superAdminMiddleware, (req, res) => adminController.destekTalepleriListele(req, res));
router.put('/admin/destek/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.destekTalebiYanitla(req, res));

// ==================== DİNAMİK PAKET YÖNETİMİ ====================
router.get('/admin/paketler', authMiddleware, superAdminMiddleware, (req, res) => adminController.paketTanimlariGetir(req, res));
router.post('/admin/paketler', authMiddleware, superAdminMiddleware, (req, res) => adminController.paketTanimiEkle(req, res));
router.put('/admin/paketler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.paketTanimiGuncelle(req, res));
router.delete('/admin/paketler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.paketTanimiSil(req, res));

// ==================== ZOMBİ MÜŞTERİ TAKİBİ ====================
router.get('/admin/zombiler', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiMusteriler(req, res));
router.post('/admin/zombiler/mesaj', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiTopluMesaj(req, res));
router.get('/admin/zombiler/otomatik-aksiyon', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiOtomatikAksiyon(req, res));
router.post('/admin/zombiler/aksiyon-uygula', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiAksiyonUygula(req, res));
router.post('/admin/zombiler/toplu-aksiyon', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiTopluAksiyon(req, res));
router.get('/admin/zombiler/aksiyon-gecmisi', authMiddleware, superAdminMiddleware, (req, res) => adminController.zombiAksiyonGecmisi(req, res));

// ==================== REFERANS (Affiliate) SİSTEMİ ====================
router.get('/admin/referanslar', authMiddleware, superAdminMiddleware, (req, res) => adminController.referanslarListele(req, res));
router.post('/admin/referanslar', authMiddleware, superAdminMiddleware, (req, res) => adminController.referansOlustur(req, res));
router.put('/admin/referanslar/:id/bedava-ay', authMiddleware, superAdminMiddleware, (req, res) => adminController.referansBedavaAyGuncelle(req, res));
router.delete('/admin/referanslar/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.referansSil(req, res));
router.post('/referans/kullan', (req, res) => adminController.referansKullan(req, res));

// ==================== GLOBAL DUYURULAR ====================
router.get('/admin/duyurular', authMiddleware, superAdminMiddleware, (req, res) => adminController.duyurulariGetir(req, res));
router.post('/admin/duyurular', authMiddleware, superAdminMiddleware, (req, res) => adminController.duyuruEkle(req, res));
router.put('/admin/duyurular/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.duyuruGuncelle(req, res));
router.delete('/admin/duyurular/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.duyuruSil(req, res));
router.get('/duyurular', authMiddleware, (req, res) => adminController.aktifDuyurular(req, res));

// ==================== VERİ DIŞA AKTARMA (Export) ====================
router.get('/export/musteriler', authMiddleware, odemeKontrol, (req, res) => adminController.exportMusteriler(req, res));

// ==================== ETİKETLEME (Mini-CRM) — Premium ====================
router.get('/etiketler', authMiddleware, odemeKontrol, (req, res) => adminController.etiketleriGetir(req, res));
router.post('/etiketler', authMiddleware, odemeKontrol, (req, res) => adminController.etiketEkle(req, res));
router.put('/etiketler/:id', authMiddleware, odemeKontrol, (req, res) => adminController.etiketGuncelle(req, res));
router.delete('/etiketler/:id', authMiddleware, odemeKontrol, (req, res) => adminController.etiketSil(req, res));
router.post('/etiketler/ata', authMiddleware, odemeKontrol, (req, res) => adminController.musteriEtiketAta(req, res));
router.post('/etiketler/kaldir', authMiddleware, odemeKontrol, (req, res) => adminController.musteriEtiketKaldir(req, res));
router.get('/etiketler/musteri/:telefon', authMiddleware, odemeKontrol, (req, res) => adminController.musteriEtiketleri(req, res));
router.get('/etiketler/:etiketId/musteriler', authMiddleware, odemeKontrol, (req, res) => adminController.etiketliMusteriler(req, res));
router.post('/etiketler/toplu-ata', authMiddleware, odemeKontrol, (req, res) => adminController.topluEtiketAta(req, res));

// ==================== İŞLETME BİLDİRİMLERİ ====================
router.get('/bildirimler', authMiddleware, (req, res) => adminController.bildirimlerGetir(req, res));
router.get('/bildirimler/okunmamis-sayi', authMiddleware, (req, res) => adminController.bildirimOkunmamisSayi(req, res));
router.put('/bildirimler/tumunu-oku', authMiddleware, (req, res) => adminController.bildirimTumunuOku(req, res));
router.put('/bildirimler/:id/okundu', authMiddleware, (req, res) => adminController.bildirimOkundu(req, res));
router.put('/bildirim-tercihleri', authMiddleware, (req, res) => adminController.bildirimTercihGuncelle(req, res));

// ==================== FİNANS & CÜZDAN ====================
router.get('/finans/ozet', authMiddleware, (req, res) => adminController.finansOzet(req, res));
router.put('/finans/ayarlar', authMiddleware, (req, res) => adminController.finansAyarlarGuncelle(req, res));
router.post('/finans/hakedis', authMiddleware, (req, res) => adminController.hakedisOlustur(req, res));
router.get('/admin/hakedis', authMiddleware, superAdminMiddleware, (req, res) => adminController.hakedisListele(req, res));
router.put('/admin/hakedis/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.hakedisIsle(req, res));

// ==================== GOOGLE YORUM FEEDBACK — Premium ====================
router.get('/google-yorum/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumAyarlar(req, res));
router.put('/google-yorum/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumAyarGuncelle(req, res));
router.get('/google-yorum/talepler', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumTalepleri(req, res));

// ==================== PREMİUM ÖZELLİK DURUMU ====================
router.get('/premium/durum', authMiddleware, (req, res) => adminController.premiumOzellikDurumu(req, res));

// ==================== REFERANS AĞI ====================
router.get('/referans/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.referansAyarlariGetir(req, res));
router.put('/referans/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.referansAyarlariGuncelle(req, res));
router.get('/referans/rapor', authMiddleware, odemeKontrol, (req, res) => adminController.referansRaporu(req, res));

// ==================== SADAKAT PUAN SİSTEMİ ====================
router.get('/sadakat/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.sadakatAyarlariGetir(req, res));
router.put('/sadakat/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.sadakatAyarlariGuncelle(req, res));
router.get('/sadakat/rapor', authMiddleware, odemeKontrol, (req, res) => adminController.puanRaporu(req, res));
router.post('/sadakat/kullan', authMiddleware, odemeKontrol, (req, res) => adminController.puanKullan(req, res));
router.get('/sadakat/gecmis', authMiddleware, odemeKontrol, (req, res) => adminController.puanGecmisi(req, res));

// ==================== KAYIP MÜŞTERİ KURTARMA ====================
router.get('/winback/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.winbackAyarlariGetir(req, res));
router.put('/winback/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.winbackAyarlariGuncelle(req, res));
router.get('/winback/musteriler', authMiddleware, odemeKontrol, (req, res) => adminController.kayipMusteriler(req, res));
router.post('/winback/gonder', authMiddleware, odemeKontrol, (req, res) => adminController.winbackManuelGonder(req, res));
router.get('/winback/log', authMiddleware, odemeKontrol, (req, res) => adminController.winbackLog(req, res));

// ==================== YORUM AVCISI ====================
router.get('/yorum-avcisi/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.yorumAyarlariGetir(req, res));
router.put('/yorum-avcisi/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.yorumAyarlariGuncelle(req, res));
router.get('/yorum-avcisi/log', authMiddleware, odemeKontrol, (req, res) => adminController.yorumLogGetir(req, res));
router.get('/yorum-avcisi/istatistik', authMiddleware, odemeKontrol, (req, res) => adminController.yorumIstatistik(req, res));

// ==================== GECE RAPORU ====================
router.get('/gece-raporu/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.geceRaporuAyarlari(req, res));
router.put('/gece-raporu/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.geceRaporuGuncelle(req, res));
router.get('/gece-raporu/log', authMiddleware, odemeKontrol, (req, res) => adminController.geceRaporuLog(req, res));
router.get('/gece-raporu/onizle', authMiddleware, odemeKontrol, (req, res) => adminController.geceRaporuOnizle(req, res));

// ==================== SMS (NetGSM) ====================
router.get('/sms/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.smsAyarlariGetir(req, res));
router.put('/sms/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.smsAyarlariGuncelle(req, res));
router.get('/sms/log', authMiddleware, odemeKontrol, (req, res) => adminController.smsLogGetir(req, res));
router.post('/sms/test', authMiddleware, odemeKontrol, (req, res) => adminController.smsTestGonder(req, res));
router.get('/sms/bakiye', authMiddleware, odemeKontrol, (req, res) => adminController.smsBakiye(req, res));

// ==================== PRİM HESAPLAMA ====================
router.get('/prim/rapor', authMiddleware, odemeKontrol, (req, res) => adminController.primRaporu(req, res));
router.post('/prim/ode', authMiddleware, odemeKontrol, (req, res) => adminController.primOde(req, res));

// ==================== KASA TAKİBİ ====================
router.get('/kasa', authMiddleware, odemeKontrol, (req, res) => adminController.kasaListesi(req, res));
router.post('/kasa', authMiddleware, odemeKontrol, (req, res) => adminController.kasaEkle(req, res));
router.delete('/kasa/:id', authMiddleware, odemeKontrol, (req, res) => adminController.kasaSil(req, res));
router.get('/kasa/ozet', authMiddleware, odemeKontrol, (req, res) => adminController.kasaOzet(req, res));

// ==================== MÜŞTERİ CRM ====================
router.get('/admin/musteri-crm', authMiddleware, superAdminMiddleware, (req, res) => adminController.musteriCRM(req, res));
router.get('/admin/musteri-crm/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.musteriDetay(req, res));

// ==================== QR KOD ====================
router.get('/admin/qr-kod', authMiddleware, superAdminMiddleware, (req, res) => adminController.adminQrKodOlustur(req, res));
router.get('/qr-kod', authMiddleware, (req, res) => adminController.qrKodOlustur(req, res));

// ==================== ONLINE RANDEVU (Public) ====================
router.get('/book/:slug', (req, res) => bookingController.isletmeBilgileri(req, res));
router.get('/book/:slug/hizmetler', (req, res) => bookingController.hizmetleriGetir(req, res));
router.get('/book/:slug/calisanlar', (req, res) => bookingController.calisanlariGetir(req, res));
router.get('/book/:slug/saatler', (req, res) => bookingController.musaitSaatler(req, res));
router.post('/book/:slug/randevu', (req, res) => bookingController.randevuOlustur(req, res));

module.exports = router;
