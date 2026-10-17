const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('yalnız teşekkür/kapanış mesajlarına cevap verilmez, soru içerenlere verilir', async () => {
  await hazirla('');
  const { yalnizNezaket } = require(SRC + '/services/satisBot')._test;
  for (const m of ['Teşekkürler', 'çok teşekkür ederim', 'sağolun abi', 'Kolay gelsin', '👍', '🙏🙏', 'eyvallah usta', 'Teşekkürler\nİyi çalışmalar'])
    assert.strictEqual(yalnizNezaket(m), true, m);
  for (const m of ['teşekkürler fiyat ne', 'evet', 'tamam', 'nasıl çalışıyor', 'teşekkürler gerek yok ama kaç para', 'merhaba'])
    assert.strictEqual(yalnizNezaket(m), false, m);
});

test('WhatsApp Business otomatik karşılama mesajı insan cevabı sayılmaz; çapraz selam ayırt edilir', async () => {
  await hazirla('');
  const { otomatikYanit, yalnizSelam } = require(SRC + '/services/satisBot')._test;
  for (const m of [
    'Ersoy Güzellik Merkezi ile iletişime geçtiğiniz için teşekkürler! Size nasıl yardımcı olabiliriz? Çalışma saatlerimiz sabah 10.00 akşam 20.00dır.',
    'Elit Barber Shop | TAYFUN TÜREGÜN ile iletişime geçtiğiniz için teşekkürler! Size nasıl yardımcı olabiliriz?',
    'Merhabalar randevu işlemleri için lütfen arayınız..! Mesajınız için teşekkür ederiz, en kısa sürede dönüş yapacağız.',
    'Şu anda müsait değiliz, mesai saatlerimiz dışında yazdınız.',
  ]) assert.strictEqual(otomatikYanit(m), true, m);
  for (const m of ['Merhabalar', 'Düşünmüyoruz teşekkür ederiz', 'Randevuları telefonla alıyoruz', 'Siz kimsiniz?', 'Fiyat nedir, nasıl yardımcı olabilirsiniz?'])
    assert.strictEqual(otomatikYanit(m), false, m);
  for (const m of ['Merhabalar', 'merhaba 👋', 'Selam', 'Buyrun', 'iyi günler', 'Selamün aleyküm']) assert.strictEqual(yalnizSelam(m), true, m);
  for (const m of ['Merhaba ne satıyorsunuz', 'telefonla alıyoruz', 'merhaba fiyat']) assert.strictEqual(yalnizSelam(m), false, m);
});
