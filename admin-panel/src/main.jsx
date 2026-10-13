import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Her sayfa yalnız kendi kodunu indirir: müşterinin açtığı randevu sayfası panelin tamamını indirmez (hızlı açılış)
const App = lazy(() => import('./App.jsx'))
const BookingPage = lazy(() => import('./components/BookingPage/BookingPage.jsx'))
const GroupBookingPage = lazy(() => import('./components/BookingPage/GroupBookingPage.jsx'))
const Yukleniyor = () => <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#6f6a62', fontFamily: 'system-ui, sans-serif' }}>Yükleniyor…</div>
import ErrorBoundary from './components/ErrorBoundary.jsx'

// URL routing:
//   /book/:slug  → public booking page (bireysel şube)
//   /g/:slug     → grup landing sayfası
const path = window.location.pathname;
const bookMatch = path.match(/^\/book\/([a-z0-9_-]+)\/?$/i);
const grupMatch = path.match(/^\/g\/([a-z0-9_-]+)\/?$/i);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <Suspense fallback={<Yukleniyor />}>
      {grupMatch ? <GroupBookingPage slug={grupMatch[1]} />
        : bookMatch ? <BookingPage slug={bookMatch[1]} />
        : <App />}
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)
