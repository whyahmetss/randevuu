// Kapanış kartını ve ilerleme çubuğunu ekler. <body data-total="15" data-end="12.5">
(function(){
  const b=document.body, total=+b.dataset.total, at=+b.dataset.end, len=total-at;
  b.style.setProperty('--total',total+'s');
  b.insertAdjacentHTML('beforeend',`
  <section class="scene end" style="--at:${at}s;--len:${len+1}s">
    <div class="logo up" style="--d:${at+.1}s">Sıra<span>GO</span></div>
    <div class="gap-s"></div>
    <div class="mid up" style="--d:${at+.35}s">WhatsApp'tan<br>otomatik randevu</div>
    <div class="gap"></div><div class="gap-s"></div>
    <div class="cta pop" style="--d:${at+.7}s">14 gün ücretsiz dene</div>
    <div class="gap"></div>
    <div class="url fade" style="--d:${at+1}s">sırago.com</div>
  </section>
  <div class="bar"></div>`);
})();
