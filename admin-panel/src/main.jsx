import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import BookingPage from './components/BookingPage/BookingPage.jsx'

// URL routing: /book/:slug → public booking page
const path = window.location.pathname;
const bookMatch = path.match(/^\/book\/([a-z0-9_-]+)\/?$/i);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {bookMatch ? <BookingPage slug={bookMatch[1]} /> : <App />}
  </StrictMode>,
)
