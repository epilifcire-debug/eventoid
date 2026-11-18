import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// PWA: registra o service worker só em produção servida por http(s) normal.
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.MODE !== 'preview' && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
