const express = require('express');
const router = express.Router();
const { authMiddleware, superAdminMiddleware } = require('../middleware/auth');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const botController = require('../controllers/botController');

// ==================== AUTH ====================
router.post('/auth/giris', (req, res) => authController.giris(req, res));
router.get('/auth/profil', authMiddleware, (req, res) => authController.profilim(req, res));

// ==================== İLETİŞİM (public) ====================
router.post('/iletisim', (req, res) => adminController.iletisimGonder(req, res));

// ==================== WHATSAPP WEBHOOK ====================
router.post('/webhook/whatsapp', (req, res) => botController.gelenMesaj(req, res));
router.post('/bot/test', (req, res) => botController.testMesaj(req, res));

// ==================== ADMIN PANEL ====================
router.get('/randevular', authMiddleware, (req, res) => adminController.randevulariGetir(req, res));
router.put('/randevular/:id/durum', authMiddleware, (req, res) => adminController.randevuDurumGuncelle(req, res));

router.get('/hizmetler', authMiddleware, (req, res) => adminController.hizmetleriGetir(req, res));
router.post('/hizmetler', authMiddleware, (req, res) => adminController.hizmetEkle(req, res));
router.put('/hizmetler/:id', authMiddleware, (req, res) => adminController.hizmetGuncelle(req, res));
router.delete('/hizmetler/:id', authMiddleware, (req, res) => adminController.hizmetSil(req, res));

router.get('/calisanlar', authMiddleware, (req, res) => adminController.calisanlariGetir(req, res));
router.post('/calisanlar', authMiddleware, (req, res) => adminController.calisanEkle(req, res));

router.get('/musteriler', authMiddleware, (req, res) => adminController.musterileriGetir(req, res));

router.get('/istatistikler', authMiddleware, (req, res) => adminController.istatistikler(req, res));
router.get('/grafik-verileri', authMiddleware, (req, res) => adminController.grafikVerileri(req, res));

router.get('/ayarlar', authMiddleware, (req, res) => adminController.isletmeAyarlari(req, res));
router.put('/ayarlar', authMiddleware, (req, res) => adminController.isletmeGuncelle(req, res));
router.get('/paket', authMiddleware, (req, res) => adminController.paketBilgisi(req, res));
router.get('/bot/durum', authMiddleware, (req, res) => adminController.botDurum(req, res));
router.put('/bot/ayarlar', authMiddleware, (req, res) => adminController.botAyarlarGuncelle(req, res));
router.post('/bot/telegram/bagla', authMiddleware, (req, res) => adminController.telegramBagla(req, res));
router.post('/bot/telegram/ayir', authMiddleware, (req, res) => adminController.telegramAyir(req, res));
router.post('/bot/whatsapp/bagla', authMiddleware, (req, res) => adminController.whatsappBagla(req, res));
router.get('/bot/wp/durum', authMiddleware, (req, res) => adminController.wpWebDurum(req, res));
router.post('/bot/wp/baslat', authMiddleware, (req, res) => adminController.wpWebBaslat(req, res));
router.post('/bot/wp/ayir', authMiddleware, (req, res) => adminController.wpWebAyir(req, res));
router.get('/bot/wp/sse', authMiddleware, (req, res) => adminController.wpWebSse(req, res));

// ==================== KAMPANYALAR ====================
router.get('/kampanyalar', authMiddleware, (req, res) => adminController.kampanyalariGetir(req, res));
router.post('/kampanyalar', authMiddleware, (req, res) => adminController.kampanyaEkle(req, res));
router.post('/kampanyalar/:id/gonder', authMiddleware, (req, res) => adminController.kampanyaGonder(req, res));
router.delete('/kampanyalar/:id', authMiddleware, (req, res) => adminController.kampanyaSil(req, res));

// ==================== MEMNUNIYET ====================
router.get('/memnuniyetler', authMiddleware, (req, res) => adminController.memnuniyetleriGetir(req, res));

// ==================== BEKLEME LİSTESİ ====================
router.get('/bekleme-listesi', authMiddleware, (req, res) => adminController.beklemeListesiGetir(req, res));

// ==================== SUPER ADMIN ====================
router.get('/admin/isletmeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.tumIsletmeler(req, res));
router.post('/admin/isletmeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeEkle(req, res));
router.put('/admin/isletmeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeGuncelleAdmin(req, res));
router.delete('/admin/isletmeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.isletmeSil(req, res));

router.get('/admin/odemeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeleriGetir(req, res));
router.post('/admin/odemeler', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeEkle(req, res));
router.put('/admin/odemeler/:id', authMiddleware, superAdminMiddleware, (req, res) => adminController.odemeGuncelle(req, res));

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

module.exports = router;
