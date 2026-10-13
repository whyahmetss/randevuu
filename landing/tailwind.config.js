// Landing'in Tailwind ayarı (2026-10-13): eskiden tarayıcıda cdn.tailwindcss.com ile çalışıyordu (yavaş).
// index.html'de sınıf değişince yeniden derleyin:
//   npx tailwindcss@3.4.17 -c tailwind.config.js -i tw.giris.css -o tw.css --minify
module.exports = {
  content: ['./index.html'],
  theme: {
    extend: {
      colors: {
        cream: '#FDFCF8',
        savor: '#F3EFE0',
        wa: { 50: '#eef6f1', 100: '#d9ebe0', 200: '#b5d6c3', 300: '#86b99c', 400: '#4f9471', 500: '#1f6f4a', 600: '#1a5f3f', 700: '#164f35', 800: '#123f2b', 900: '#0e3021' },
        dark: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
      },
      borderRadius: { '4xl': '2rem', '5xl': '2.5rem' },
      fontFamily: { sans: ['Geist', 'sans-serif'], serif: ['Geist', 'sans-serif'] },
    },
  },
};
