import { useState } from 'react';
import { kart, sekmeStil, RENK } from './ortak';
import ItirazBankasi from './ItirazBankasi';

// Satış Rehberi (kullanıcı kararı 2026-10-10): 30 günlük plan + ekip rehberi panelde, tek yerde.
// Metinler burada sabit; itiraz bankası canlı (ekip ekler).
const B = ({ children }) => <b style={{ color: 'var(--text)' }}>{children}</b>;
const P = ({ children }) => <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 10px' }}>{children}</p>;
const H = ({ children }) => <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', margin: '18px 0 8px' }}>{children}</h3>;
const Tablo = ({ basliklar, satirlar }) => (
  <div style={{ overflowX: 'auto', marginBottom: 12 }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
      <thead><tr>{basliklar.map(b => <th key={b} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--dim)', fontWeight: 600 }}>{b}</th>)}</tr></thead>
      <tbody>{satirlar.map((s, i) => <tr key={i}>{s.map((h, j) => <td key={j} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text)', verticalAlign: 'top' }}>{h}</td>)}</tr>)}</tbody>
    </table>
  </div>
);
const Liste = ({ items, sirali }) => {
  const Tag = sirali ? 'ol' : 'ul';
  return <Tag style={{ margin: '0 0 12px', paddingLeft: 20, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{items.map((x, i) => <li key={i} style={{ marginBottom: 4 }}>{x}</li>)}</Tag>;
};

function Plan() {
  return (
    <div>
      <P><B>Hedef: 1 Aralık'a kadar 200 işletme bağlamak.</B> Bağlanan = kaydı açılmış, kurulumu yapılmış gerçek işletme. Satış Masası'nın üstündeki şerit her gün kalan sayıyı ve günlük gereken tempoyu hesaplar.</P>
      <Tablo basliklar={['Ölçü', 'Kişi başı günlük', 'Nereden bakılır']} satirlar={[
        ['Arama / ziyaret', '20 arama ya da 10 ziyaret', 'Satış Masası → Benim günüm'],
        ['Gerçek görüşme', '5', 'Satış Masası'],
        ['Demo gönderilen', '2–3', 'Satış Masası'],
        ['Bağlanan (kurulum)', 'Masa üstündeki hedef (otomatik)', 'Satış Masası + Büyüme'],
      ]} />
      <H>Üç kural</H>
      <Liste sirali items={[
        'Ürünü "randevu programı" diye değil, "müşterine sen meşgulken cevap veren dijital çalışan" diye anlatıyoruz.',
        'Panel gezdirmiyoruz; dükkânın kendi demo sayfasını gösteriyoruz (Masa → ✨ Demo).',
        'Kurulumu esnafa bırakmıyoruz; biz yapıyoruz, 5 dakikada canlı.',
      ]} />
      <H>Hafta hafta</H>
      <Liste sirali items={[
        <><B>1. hafta — ilk dükkânlar.</B> Ahmet sahada tek semt; telefoncular günde 20'şer arar. Amaç: ilk kurulumlar, tezgâha QR kart, "neden almıyorum" cevaplarını İtiraz Bankası'na eklemek.</>,
        <><B>2. hafta — metni oturtmak.</B> İtirazlara göre metinler düzelir. Kurulan her dükkâna "Esnaf Getir" sayfası gösterilir: komşusuna link atarsa bedava ay kazanır.</>,
        <><B>3. hafta — ilk ödemeler.</B> 1. haftanın denemesi biter; sorumlusu arar, "Öncü Esnaf: fiyatın ömür boyu sabit" ile ödemeye geçirir. Ahmet ikinci semte geçer.</>,
        <><B>4. hafta ve sonrası — tekrarla.</B> Büyüme ekranında işe yarayan kanala yüklen. Deneme biten herkes aranır.</>,
      ]} />
      <H>Günlük ritim (yarım gün = 4 saat)</H>
      <Tablo basliklar={['Saat', 'Telefon ekibi', 'Saha (Ahmet)']} satirlar={[
        ['1. saat', 'Masa → "Bugün ara" listesinden 10 arama', 'Semtte 4–5 dükkân'],
        ['2. saat', '10 arama daha; ilgilenene ✨ Demo → linki WhatsApp\'tan gönder', '4–5 dükkân daha'],
        ['3. saat', '"Evet" diyenlerle ekrandan birlikte 5 dakikada kurulum', 'Kurulum + QR kart'],
        ['4. saat', 'Geri aranacaklar + denemesi süren dükkânlara "ilk randevu geldi mi?"', 'Ertesi günün sokak listesi'],
      ]} />
      <P>Esnafı en rahat <B>10:00–12:00</B> ve <B>14:00–16:00</B> arası yakalarsınız; akşam ve cumartesi öğleden sonra aramayın. Her aramadan sonra sonucu Masa'da tek tıkla işaretleyin; işaretlenmeyen arama sayılmaz.</P>
    </div>
  );
}

function Metinler() {
  return (
    <div>
      <P>Ezberlemeyin, kendi ağzınıza uydurun. Amaç sunum değil, üç soruyla derdi buldurmak.</P>
      <H>Telefon</H>
      <Liste sirali items={[
        '"Merhaba, [dükkân adı] ile mi görüşüyorum? Ben SıraGO\'dan [isim], 1 dakikanız var mı?"',
        '"Randevuları şu an nasıl alıyorsunuz, telefondan mı WhatsApp\'tan mı?"',
        '"Yoğunken ya da akşam yazan müşteriye hemen cevap verebiliyor musunuz?"',
        '"Cevap veremediğiniz için başka yere giden müşteri oluyor mu?"',
        '"Tam bunun için bir sistem yaptık: müşteri WhatsApp\'tan ya da linkten kendi saatini seçiyor, siz sadece onaylıyorsunuz. Size özel sayfanızı hazırladım, WhatsApp\'tan göndereyim mi?"',
        'Baktıysa: "14 gün ücretsiz, kart istemiyoruz. Şimdi 5 dakikada birlikte kuralım mı?"',
      ]} />
      <H>Saha</H>
      <Liste items={[
        'Giriş: "Kolay gelsin usta, 2 dakikanı alırım. Satış yapmaya gelmedim, bir şey göstereyim."',
        'Telefonda dükkânın kendi demo sayfasını aç, önüne koy: "Müşterin buraya giriyor, saç+sakal seçiyor, saatini alıyor. Sen traş ederken telefonla uğraşmıyorsun."',
        '"Fiyatlarını söyle, şimdi sayfaya ekleyelim" → kurulumu orada bitir, QR kartı tezgâha koy, Masa\'da "Bağlandı" işaretle.',
      ]} />
      <H>WhatsApp (arama açılmazsa, tek mesaj)</H>
      <P>Masa'daki 💬 düğmesi "Merhaba, [dükkân adı] ile mi görüşüyorum?" yazılı açar. Cevap gelirse telefon metninin 2–5. adımları. Cevap gelmezse ikinci mesaj yok.</P>
      <H>Ödemeye geçirirken (denemenin 10.–14. günü)</H>
      <P>"Kaç randevu geldi? [sayı]. İlk 100 ödeyen esnafın fiyatı ömür boyu sabit kalıyor, şu an son [X] yer var. Linki göndereyim, kartla 1 dakikada."</P>
    </div>
  );
}

function UrunSss() {
  return (
    <div>
      <P><B>SıraGO, esnaf meşgulken müşteriye cevap veren, randevuyu alan, hatırlatan ve gelmeyeni geri çağıran dijital çalışandır.</B></P>
      <H>Bir randevunun yolculuğu</H>
      <Liste sirali items={[
        'Müşteri esnafın kendi WhatsApp numarasına yazar ya da randevu.sırago.com/book/dükkân-adı sayfasına girer (Instagram, QR kart, WhatsApp durumu).',
        'Bot hizmeti ve saati sorar, o saatte boş çalışanı bulur, randevuyu oluşturur. Online sayfada WhatsApp doğrulama kodu gider; aynı saate iki randevu verilemez.',
        'Esnafa panelde ve telefonunda bildirim gider.',
        'Randevudan 24 saat, 1 saat ve 15 dakika önce müşteriye otomatik hatırlatma gider.',
        'Sonrası (Standart ve üstü): Google yorumu isteği, uzun süre gelmeyene "sizi özledik", doğum günü mesajı.',
      ]} />
      <H>Paketler</H>
      <P>Güncel fiyatlar Süper Admin → Paketler'de; tanıtım sitesi de oradan okur. 14 gün ücretsiz, kart istenmez. İlk 100 ödeyen esnaf "Öncü Esnaf": fiyatı ömür boyu sabit (ortaklık değil, fiyat kilidi).</P>
      <H>Sık sorular</H>
      <Tablo basliklar={['Soru', 'Cevap']} satirlar={[
        ['WhatsApp numaram değişir mi?', 'Hayır; QR okutup bağlıyorsunuz, telefonunuzda WhatsApp normal çalışır.'],
        ['Numaram kapanır mı?', 'Bot dışarı toplu mesaj atmaz; sadece size yazana cevap verir ve hatırlatma gönderir.'],
        ['Müşteri uygulama indirecek mi?', 'Hayır. WhatsApp\'tan yazar ya da linke tıklar.'],
        ['Kart bilgisi istiyor musunuz?', '14 günlük denemede hayır. Ödeme zamanı WhatsApp\'tan link gelir.'],
        ['İptal edersem?', 'Ödemezseniz panel kapanır, bilgiler silinmez; ödeyince kaldığı yerden devam.'],
        ['Kurulum ne kadar sürer?', '5 dakika: hizmetler, çalışanlar, WhatsApp QR. Birlikte yapıyoruz.'],
        ['Yabancı müşteri yazarsa?', 'Standart ve üstünde bot İngilizce ve Arapça da cevap verir.'],
      ]} />
    </div>
  );
}

function Kurallar() {
  return (
    <div>
      <Liste sirali items={[
        <>Alan adımız <B>sırago.com</B> ve <B>randevu.sırago.com</B>. "sirago.com" (ı'sız) başkasının sitesi; asla yazmayın, söylemeyin.</>,
        <>Yalan yok: "resmî WhatsApp API", "gelmeyen müşteri sıfıra iner", "binlerce esnaf kullanıyor", "SMS doğrulama", "iyzico" demeyin. Doğrulama kodu WhatsApp'tan, ödeme Shopier'den.</>,
        '"İstemiyorum" diyen bir daha aranmaz; Masa\'da "İlgilenmiyor" işaretlenir.',
        'Başkasının listesindeki dükkânı aramayın; Masa her adayı tek kişiye verir.',
        'Satış botundan günde 30\'dan fazla mesaj atılmaz; numara yanarsa en güçlü kanalımız kapanır.',
        'Esnafın müşteri bilgisi ekip dışına çıkmaz; ekran görüntüsü paylaşırken isim ve numara kapatılır.',
        'Cevabını bilmediğiniz soruda uydurmayın: "Ekibe sorup döneyim" deyin ve gruba yazın.',
      ]} />
    </div>
  );
}

export default function SatisRehberi({ api, patron }) {
  const [sekme, setSekme] = useState('itiraz');
  const SEKMELER = [['itiraz', 'İtirazlar'], ['metin', 'Konuşma metinleri'], ['plan', 'Plan ve ritim'], ['urun', 'Ürün ve SSS'], ['kural', 'Kurallar']];
  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>Satış Rehberi</h1>
      <p style={{ color: 'var(--dim)', fontSize: 13, margin: '0 0 14px' }}>Aramadan önce, aramada, aramadan sonra. İtiraz bankası ekibin ortak hafızası: sahada duyduğunu ekle.</p>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 18, overflowX: 'auto' }}>
        {SEKMELER.map(([id, ad]) => <button key={id} onClick={() => setSekme(id)} style={sekmeStil(sekme === id)}>{ad}</button>)}
      </div>
      <div style={{ ...kart }}>
        {sekme === 'itiraz' && <ItirazBankasi api={api} patron={patron} />}
        {sekme === 'metin' && <Metinler />}
        {sekme === 'plan' && <Plan />}
        {sekme === 'urun' && <UrunSss />}
        {sekme === 'kural' && <Kurallar />}
      </div>
      <div style={{ fontSize: 12, color: RENK.gri, marginTop: 10 }}>Metinlerde değişiklik isteğin olursa kurucuya yaz; itirazları doğrudan buradan ekleyebilirsin.</div>
    </div>
  );
}
