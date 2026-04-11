const express = require('express');
const router = express.Router();
const { authMiddleware, superAdminMiddleware, odemeKontrol } = require('../middleware/auth');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const botController = require('../controllers/botController');

// ==================== AUTH ====================
router.post('/auth/giris', (req, res) => authController.giris(req, res));
router.post('/auth/kayit', (req, res) => authController.botKayit(req, res));
router.get('/auth/profil', authMiddleware, (req, res) => authController.profilim(req, res));

// ==================== İLETİŞİM (public) ====================
router.post('/iletisim', (req, res) => adminController.iletisimGonder(req, res));

// ==================== WHATSAPP WEBHOOK ====================
router.post('/webhook/whatsapp', (req, res) => botController.gelenMesaj(req, res));
router.post('/bot/test', (req, res) => botController.testMesaj(req, res));

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

router.get('/ayarlar', authMiddleware, (req, res) => adminController.isletmeAyarlari(req, res));
router.put('/ayarlar', authMiddleware, (req, res) => adminController.isletmeGuncelle(req, res));
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

// ==================== REFERANS (Affiliate) SİSTEMİ ====================
router.get('/admin/referanslar', authMiddleware, superAdminMiddleware, (req, res) => adminController.referanslarListele(req, res));
router.post('/admin/referanslar', authMiddleware, superAdminMiddleware, (req, res) => adminController.referansOlustur(req, res));
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

// ==================== GOOGLE YORUM FEEDBACK — Premium ====================
router.get('/google-yorum/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumAyarlar(req, res));
router.put('/google-yorum/ayarlar', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumAyarGuncelle(req, res));
router.get('/google-yorum/talepler', authMiddleware, odemeKontrol, (req, res) => adminController.googleYorumTalepleri(req, res));

// ==================== PREMİUM ÖZELLİK DURUMU ====================
router.get('/premium/durum', authMiddleware, (req, res) => adminController.premiumOzellikDurumu(req, res));

module.exports = router;
