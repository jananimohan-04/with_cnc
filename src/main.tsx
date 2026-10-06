import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { DateRangeProvider } from './contexts/DateRangeContext';
import './index.css';

// After a new deployment the old hashed files are gone, so a tab left open from before cannot load a
// lazily imported module (e.g. the PDF library). Reload once to pick up the new version.
window.addEventListener('vite:preloadError', (e) => {
  try {
    if (sessionStorage.getItem('argus.preloadReload') === '1') return;
    sessionStorage.setItem('argus.preloadReload', '1');
  } catch { /* reload anyway */ }
  e.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => { try { setTimeout(() => sessionStorage.removeItem('argus.preloadReload'), 10000); } catch { /* ignore */ } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DateRangeProvider>
      <App />
    </DateRangeProvider>
  </StrictMode>
);
