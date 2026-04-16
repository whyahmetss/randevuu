import { useState } from 'react';
import Referans from '../Referans/Referans';
import DogumGunu from '../DogumGunu/DogumGunu';

export default function MusteriGetir({ api }) {
  const [tab, setTab] = useState('referans');

  return (
    <div>
      {/* Başlık */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          🚀 Müşteri Getir
        </h2>
        <div style={{ color: 'var(--dim)', fontSize: 13, marginTop: 4 }}>
          Mevcut müşterilerin sana yeni müşteri kazandırsın. İki otomatik kanal: Arkadaş Getir + Doğum Günü Pazarlaması.
        </div>
      </div>

      {/* Tab seçici */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4, maxWidth: 500 }}>
        <button
          onClick={() => setTab('referans')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === 'referans' ? 'linear-gradient(135deg,#54E097,#2cb872)' : 'transparent',
            color: tab === 'referans' ? '#fff' : 'var(--dim)',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s'
          }}
        >
          🎁 Arkadaş Getir
        </button>
        <button
          onClick={() => setTab('dogumgunu')}
          style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === 'dogumgunu' ? 'linear-gradient(135deg,#ec4899,#be185d)' : 'transparent',
            color: tab === 'dogumgunu' ? '#fff' : 'var(--dim)',
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s'
          }}
        >
          🎂 Doğum Günü
        </button>
      </div>

      {/* İçerik */}
      {tab === 'referans' && <Referans api={api} />}
      {tab === 'dogumgunu' && <DogumGunu api={api} />}
    </div>
  );
}
