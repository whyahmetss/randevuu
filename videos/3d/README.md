# SıraGO 3D Reels (Blender + EEVEE)

Sahneler tamamen Python betiklerinden üretilir; `.blend` dosyaları Git'e girmez.

| Yol | İçerik |
|---|---|
| `_test/test_sahne.py` | Kurulum testi: GPU doğrulama + kare başına süre |
| `<video-adı>/` | Her videonun sahne betikleri |
| `out/` | Son MP4'ler (1080×1920, 30 fps, H.264) |

## Araçlar (bu bilgisayar)

- Blender 5.2.2 LTS (taşınabilir): `C:\Users\cvdra\projeler\.araclar\blender-5.2.2-windows-x64\blender.exe`
  Windows grafik tercihi: Yüksek performans (GTX 1650 Ti). Motor: EEVEE (Cycles yok).
- FFmpeg 9.0.2 (winget `Gyan.FFmpeg`)
- Node 22.11 (taşınabilir): `C:\Users\cvdra\projeler\.araclar\node-v22.11.0-win-x64`

## Test

```bash
blender -b -P videos/3d/_test/test_sahne.py -- videos/3d/_test/out 6
```

Ölçüm (2026-10-21, 1080×1920, 64 örnek): ilk kare ~73 sn (bir kerelik shader derleme), sonrası ~2.7 sn/kare.
Render sırasında oyun / Wallpaper Engine kapalı olsun: 4 GB VRAM'in ~2.7 GB'ını Blender kullanıyor.
