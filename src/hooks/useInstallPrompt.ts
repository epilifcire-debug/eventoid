import { useEffect, useState } from 'react';

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

const KEY = 'eventoid.install.dismissed';
const isStandalone = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * Convite de instalação discreto: só aparece quando o navegador permite (ou no iPhone, com instrução),
 * nunca no app já instalado, e respeita o "agora não".
 */
export function useInstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled); };
  }, []);

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(KEY, '1'); } catch { /* sem armazenamento */ } };
  const install = async () => {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === 'dismissed') dismiss();
    setEvt(null);
  };

  const canPrompt = !installed && !dismissed && !!evt;
  const iosHint = !installed && !dismissed && !evt && isIOS();
  return { canPrompt, iosHint, install, dismiss };
}
