import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import BookingPage from './components/BookingPage/BookingPage.jsx'
import GroupBookingPage from './components/BookingPage/GroupBookingPage.jsx'
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
      {grupMatch ? <GroupBookingPage slug={grupMatch[1]} />
        : bookMatch ? <BookingPage slug={bookMatch[1]} />
        : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
