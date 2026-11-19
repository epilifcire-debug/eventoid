import { Download, Share, X } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import { cx } from '../../lib/format';

export function InstallBanner({ tone = 'light', className }: { tone?: 'light' | 'dark'; className?: string }) {
  const { canPrompt, iosHint, install, dismiss } = useInstallPrompt();
  if (!canPrompt && !iosHint) return null;
  const dark = tone === 'dark';
  return (
    <div className={cx('flex items-center gap-3 rounded-btn border px-3 py-2.5 text-sm', dark ? 'border-white/15 bg-white/5 text-slate-200' : 'border-line bg-white text-ink shadow-card', className)}>
      {canPrompt ? <Download className="h-4 w-4 shrink-0 text-primary" /> : <Share className="h-4 w-4 shrink-0 text-primary" />}
      <p className="flex-1 leading-snug">
        {canPrompt ? 'Instale o EVENTOID no seu aparelho.' : <>No iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</>}
      </p>
      {canPrompt && <button type="button" onClick={install} className="min-h-[36px] rounded-btn bg-primary px-3 text-xs font-semibold text-white">Instalar</button>}
      <button type="button" aria-label="Agora não" onClick={dismiss} className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-btn', dark ? 'hover:bg-white/10' : 'hover:bg-bg')}><X className="h-4 w-4" /></button>
    </div>
  );
}
