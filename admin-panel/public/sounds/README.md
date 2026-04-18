# Bildirim Sesleri

Bu klasöre aşağıdaki isimlerle **MP3 dosyaları** bırak. Dosya yoksa
synthesized beep (oscillator) otomatik devreye girer — uygulama
çalışmaya devam eder ama "ding" yerine tek tonlu bir bip çalar.

## Gerekli Dosyalar

| Dosya | Açıklama | Önerilen Kaynak |
|---|---|---|
| `ding.mp3` | Klasik, yumuşak — varsayılan | [notificationsounds.com: "Eventually"](https://notificationsounds.com/notification-sounds/eventually-590) |
| `cash.mp3` | Kasa çanı "ka-ching" | notificationsounds.com: "Piece of Cake" |
| `bell.mp3` | Kapı çanı, geleneksel dükkân | Mixkit: "Door chime" |
| `phone.mp3` | Telefon zili, agresif | Mixkit: "Old phone ringing" |
| `ping.mp3` | Modern iPhone-vari ping | Pixabay: "Notification ping" |

## Kural

- **Süre**: 1-3 saniye (tercihan <2 sn)
- **Format**: MP3, 128kbps yeterli
- **Boyut**: <50KB
- **Lisans**: CC0 / royalty-free (notificationsounds.com, mixkit.co, pixabay.com güvenli)

## Test

Admin panel → Ayarlar → "🔔 Bildirim & Sesler" → sesi seç → **"Şimdi test et"** butonu.

Dosya eksikse console'da "Failed to load" uyarısı görürsün ama synthesized bip yine de çalar.
