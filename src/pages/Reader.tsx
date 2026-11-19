import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BriefcaseBusiness, Check, Clock, Database, KeyRound, Loader2, LogOut, PhoneCall, RotateCcw, Wifi, WifiOff, X, CameraOff, Play, Pause } from 'lucide-react';
import logoLight from '../assets/logo-light.png';
import { useAuth } from '../hooks/useAuth';
import { DEMO_MODE, READER_REREAD_BLOCK_SECONDS, READER_RESULT_SECONDS } from '../lib/config';
import { cx, fmtTime, initials, relTime } from '../lib/format';
import { READER_MODE_LABEL } from '../types';
import { demoLookupCode, demoNextCandidate, demoRecognize, getReaderContext, loadReaderDataset, registerAccess, type ReaderContext, type ReaderContextResult, type ReaderEmployee, type RecognitionResult } from '../services/reader';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';

type Phase = 'waiting' | 'processing' | 'allowed' | 'denied';

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

function useCamera(enabled: boolean) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    if (!enabled) return;
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) { setState('error'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
      .then((s) => { stream = s; if (ref.current) { ref.current.srcObject = s; } setState('ready'); })
      .catch(() => setState('error'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [enabled]);
  return { ref, state };
}

export default function Reader() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const online = useOnline();
  const [ctxRes, setCtxRes] = useState<ReaderContextResult | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [left, setLeft] = useState(READER_RESULT_SECONDS);
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [auto, setAuto] = useState(true);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const lastReads = useRef(new Map<string, number>());
  const lastId = useRef<string | null>(null);
  const busy = useRef(false);

  const dataset = useRef<ReaderEmployee[]>([]);
  useEffect(() => { getReaderContext().then(setCtxRes).catch(() => setCtxRes({ ok: false, reason: 'no_backend' })); }, []);
  useEffect(() => {
    if (DEMO_MODE || !ctxRes?.ok) return;
    loadReaderDataset().then((d) => { dataset.current = d; }).catch(() => {});
  }, [ctxRes]);
  const ctx: ReaderContext | null = ctxRes?.ok ? ctxRes.ctx : null;
  const cam = useCamera(!!ctx);

  const logout = async () => { await signOut(); nav('/login', { replace: true }); };

  const reset = useCallback(() => { setPhase('waiting'); setResult(null); setCodeOpen(false); setCode(''); busy.current = false; }, []);

  const show = useCallback((r: RecognitionResult) => {
    setResult(r); setLeft(READER_RESULT_SECONDS); setPhase(r.decision);
    setLastRead(r.occurred_at);
    if (r.decision === 'allowed' && r.employee_id) lastReads.current.set(r.employee_id, Date.now());
  }, []);

  /** Uma leitura por vez; mesmo rosto bloqueado por 20 s, outros continuam liberados. */
  const detect = useCallback((employeeId: string, forceDeny = false) => {
    if (busy.current || !ctx) return;
    const t = lastReads.current.get(employeeId);
    if (t && Date.now() - t < READER_REREAD_BLOCK_SECONDS * 1000) {
      const s = Math.ceil((READER_REREAD_BLOCK_SECONDS * 1000 - (Date.now() - t)) / 1000);
      setNote(`Leitura repetida ignorada — mesmo funcionário liberado em ${s}s`);
      setTimeout(() => setNote(''), 2500);
      return;
    }
    busy.current = true; lastId.current = employeeId; setPhase('processing');
    setTimeout(() => show(demoRecognize(employeeId, forceDeny, ctx.mode)), 1300);
  }, [ctx, show]);

  // Contagem regressiva do resultado (pausa com a pesquisa por código aberta)
  useEffect(() => {
    if ((phase !== 'allowed' && phase !== 'denied') || codeOpen) return;
    if (left <= 0) { reset(); return; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left, codeOpen, reset]);

  // Demonstração: leitura contínua simulada
  useEffect(() => {
    if (!DEMO_MODE || !auto || phase !== 'waiting' || !ctx) return;
    const t = setTimeout(() => { const id = demoNextCandidate(); detect(id, Math.random() < 0.22); }, 4500);
    return () => clearTimeout(t);
  }, [auto, phase, ctx, detect]);

  const flash = (t: string) => { setNote(t); setTimeout(() => setNote(''), 2500); };
  const submitCode = async () => {
    if (DEMO_MODE) {
      const r = demoLookupCode(code);
      if (!r) { flash('Código não encontrado neste evento'); return; }
      setCodeOpen(false); setCode(''); show(r); return;
    }
    // Busca só pelo código digitado, dentro do evento do leitor (nunca lista funcionários)
    const c = code.trim().toUpperCase();
    const emp = dataset.current.find((e) => e.code.toUpperCase() === c || e.code.toUpperCase().endsWith(c.replace(/\D/g, '').padStart(5, '0')));
    if (!emp || !ctx) { flash('Código não encontrado neste evento'); return; }
    try {
      const r = await registerAccess(ctx, emp.employee_id, null);
      if (!r) { flash('Leitura repetida — aguarde o intervalo'); return; }
      setCodeOpen(false); setCode(''); show(r);
    } catch { flash('Falha ao registrar. Verifique a conexão.'); }
  };

  /* ----- Sem evento / erro de configuração ----- */
  if (ctxRes && !ctxRes.ok) {
    const msg = { no_event: ['Nenhum evento atribuído', 'Procure um administrador para vincular este leitor a um evento.'], multiple_events: ['Erro de configuração', 'Há mais de um evento ativo para este operador. A operação foi bloqueada até a correção.'], event_inactive: ['Evento encerrado', 'O evento atribuído não está em andamento.'], no_backend: ['Leitor não conectado', 'O servidor ainda não foi configurado.'] }[ctxRes.reason];
    return (
      <ReaderFrame onLogout={logout}>
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-white">
          <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/10"><CameraOff className="h-7 w-7" /></span>
          <h1 className="text-xl font-bold">{msg[0]}</h1><p className="mt-2 text-sm text-slate-300">{msg[1]}</p>
        </div>
      </ReaderFrame>
    );
  }

  return (
    <ReaderFrame onLogout={logout}>
      {/* Faixa do evento (definido pelo administrador) */}
      <div className="bg-white px-5 py-3">
        <p className="truncate text-[17px] font-bold text-ink">{ctx?.event_name ?? 'Carregando…'}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {ctx && <span className="rounded-full bg-primary px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{READER_MODE_LABEL[ctx.mode]}</span>}
          <span className={cx('inline-flex items-center gap-1.5 font-semibold', online ? 'text-success' : 'text-[#B45309]')}>{online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}{online ? 'Online' : 'Offline'}</span>
          <span className="h-4 w-px bg-line" />
          <span className="truncate text-ink-muted">{ctx?.device_name}</span>
        </div>
      </div>

      {phase === 'allowed' && result ? (
        <ResultPanel tone="success" left={left}>
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white"><Check className="h-14 w-14 text-success" strokeWidth={3.5} /></span>
          <h1 className="mt-5 text-[30px] font-extrabold tracking-tight">ACESSO LIBERADO</h1>
          <span className="mt-5 flex h-28 w-28 items-center justify-center rounded-full border-4 border-white bg-white/15 text-3xl font-bold">{initials(result.employee_name ?? '')}</span>
          <p className="mt-4 text-2xl font-bold">{result.employee_name}</p>
          <span className="mt-3 rounded-btn bg-black/15 px-5 py-2 text-lg font-bold tracking-wider">{result.code}</span>
          <p className="mt-4 inline-flex items-center gap-2 text-lg font-semibold"><BriefcaseBusiness className="h-5 w-5" />{result.sector_name}</p>
          <p className="mt-2 inline-flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5" />{result.access_type === 'exit' ? 'Saída' : 'Entrada'} • {fmtTime(result.occurred_at)}</p>
        </ResultPanel>
      ) : phase === 'denied' && result ? (
        <ResultPanel tone="danger" left={left} paused={codeOpen}>
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white"><X className="h-14 w-14 text-danger" strokeWidth={3.5} /></span>
          <h1 className="mt-5 text-[30px] font-extrabold tracking-tight">ACESSO NEGADO</h1>
          <p className="mt-3 max-w-[280px] text-lg font-semibold leading-snug">{result.reason}</p>
          {codeOpen ? (
            <form onSubmit={(e) => { e.preventDefault(); submitCode(); }} className="mt-7 w-full max-w-[320px] space-y-3">
              <label className="block text-left text-sm font-semibold">Código do funcionário
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FUN-00241" inputMode="text"
                  className="mt-1.5 min-h-[52px] w-full rounded-btn border-0 px-4 text-center text-lg font-semibold tracking-wider text-ink focus:outline-none focus:ring-4 focus:ring-white/40" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setCodeOpen(false)} className="min-h-[52px] rounded-btn border-2 border-white/80 font-semibold">Cancelar</button>
                <button type="submit" className="min-h-[52px] rounded-btn bg-primary font-semibold">Consultar</button>
              </div>
            </form>
          ) : (
            <div className="mt-7 w-full max-w-[320px] space-y-3">
              <button onClick={() => { reset(); }} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-btn bg-primary text-lg font-semibold"><RotateCcw className="h-5 w-5" />Tentar novamente</button>
              <button onClick={() => setCodeOpen(true)} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-btn bg-white text-lg font-semibold text-primary"><KeyRound className="h-5 w-5" />Informar código</button>
              <button onClick={() => { setNote('Supervisor chamado'); setTimeout(() => setNote(''), 2500); }} className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-btn border-2 border-white/90 text-lg font-semibold"><PhoneCall className="h-5 w-5" />Chamar supervisor</button>
            </div>
          )}
        </ResultPanel>
      ) : (
        <>
          {/* Câmera */}
          <div className="relative flex-1 overflow-hidden bg-[#1a2333]">
            {cam.state !== 'error' && <video ref={cam.ref} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />}
            {cam.state === 'error' && <CameraPlaceholder />}
            <FaceGuide scanning={phase === 'processing'} />
            <div className="absolute inset-x-0 bottom-6 flex justify-center px-6">
              {phase === 'processing' ? (
                <div className="flex w-full max-w-[300px] flex-col items-center rounded-card bg-navy/85 px-5 py-4 text-center text-white backdrop-blur">
                  <Loader2 className="h-8 w-8 animate-spin text-[#6EA0FF]" />
                  <p className="mt-2 text-lg font-semibold">Validando acesso</p>
                  <p className="text-sm text-slate-300">Mantenha o rosto centralizado</p>
                </div>
              ) : (
                <div className="rounded-card bg-navy/80 px-7 py-3 text-lg font-semibold text-white backdrop-blur">Posicione o rosto</div>
              )}
            </div>
          </div>
          {/* Rodapé de status */}
          <div className="space-y-3 bg-white px-5 pb-5 pt-4 text-center">
            <p className="inline-flex items-center gap-2 text-lg font-semibold text-ink">
              <span className={cx('h-3.5 w-3.5 rounded-full', cam.state === 'ready' ? 'bg-success' : cam.state === 'loading' ? 'bg-warning' : DEMO_MODE ? 'bg-success' : 'bg-danger')} />
              {cam.state === 'ready' || (DEMO_MODE && cam.state === 'error') ? 'Câmera pronta' : cam.state === 'loading' ? 'Iniciando câmera…' : 'Câmera indisponível'}
              <span className="text-sm font-normal text-ink-muted">· Leitura contínua</span>
            </p>
            <p className="-mt-1 text-sm text-ink-muted">Última sincronização: {ctx ? relTime(ctx.last_sync_at) : '—'}{lastRead && <> · Última leitura {fmtTime(lastRead)}</>}</p>
            <div className="flex items-center justify-center gap-2 rounded-btn bg-bg py-3 text-sm text-ink"><Database className="h-4 w-4 text-ink-muted" />Dados válidos por {ctx?.offline_hours ?? 24}h</div>
            {!DEMO_MODE && ctx && (
              codeOpen ? (
                <form onSubmit={(e) => { e.preventDefault(); submitCode(); }} className="space-y-2 text-left">
                  <label className="block text-sm font-semibold text-ink">Código do funcionário
                    <input autoFocus value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="FUN-00241"
                      className="mt-1.5 min-h-[52px] w-full rounded-btn border border-line px-4 text-center text-lg font-semibold tracking-wider focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => { setCodeOpen(false); setCode(''); }} className="min-h-[48px] rounded-btn border border-line font-semibold text-ink">Cancelar</button>
                    <button type="submit" className="min-h-[48px] rounded-btn bg-primary font-semibold text-white">Registrar</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setCodeOpen(true)} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-primary font-semibold text-primary"><KeyRound className="h-4 w-4" />Informar código</button>
              )
            )}
          </div>
        </>
      )}

      {note && (
        <div role="status" className="pointer-events-none fixed inset-x-0 top-28 z-50 flex justify-center px-6">
          <div className="max-w-[440px] rounded-btn bg-navy/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-pop">{note}</div>
        </div>
      )}

      {DEMO_MODE && ctx && (
        <div className="border-t border-white/10 bg-navy px-3 py-2.5">
          <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-[#FCD34D]">Controles da demonstração</p>
          <div className="grid grid-cols-4 gap-1.5 text-xs font-semibold text-white">
            <button onClick={() => setAuto((v) => !v)} className="flex min-h-[44px] items-center justify-center gap-1 rounded-btn bg-white/10">{auto ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{auto ? 'Pausar' : 'Auto'}</button>
            <button disabled={phase !== 'waiting'} onClick={() => detect(demoNextCandidate())} className="min-h-[44px] rounded-btn bg-success disabled:opacity-40">Liberar</button>
            <button disabled={phase !== 'waiting'} onClick={() => detect(demoNextCandidate(), true)} className="min-h-[44px] rounded-btn bg-danger disabled:opacity-40">Negar</button>
            <button disabled={phase !== 'waiting' || !lastId.current} onClick={() => lastId.current && detect(lastId.current)} className="min-h-[44px] rounded-btn bg-white/10 disabled:opacity-40">Repetir</button>
          </div>
        </div>
      )}
    </ReaderFrame>
  );
}

function ReaderFrame({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  return (
    <div className="flex min-h-[100dvh] justify-center bg-[#060E1C]">
      <div className="flex min-h-[100dvh] w-full max-w-[520px] flex-col bg-navy shadow-pop">
        <header className="flex items-center justify-between px-5 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
          <img src={logoLight} alt="EVENTOID" className="h-6 w-auto" />
          <button onClick={onLogout} className="flex min-h-[44px] items-center gap-2 rounded-btn border-2 border-white/80 px-4 text-sm font-semibold text-white hover:bg-white/10"><LogOut className="h-4 w-4" />Sair</button>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <EfcsysSignature className="bg-navy pb-[max(8px,env(safe-area-inset-bottom))] pt-2 text-center text-[10px] text-slate-500" />
      </div>
    </div>
  );
}

function ResultPanel({ tone, left, paused, children }: { tone: 'success' | 'danger'; left: number; paused?: boolean; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="assertive" className={cx('flex flex-1 flex-col items-center justify-center px-6 py-8 text-center text-white animate-[pop_.2s_ease-out]', tone === 'success' ? 'bg-success' : 'bg-danger')}>
      {children}
      <div className="mt-8 w-full max-w-[320px] border-t border-white/40 pt-4 text-[15px]">{paused ? 'Retorno automático pausado' : `Nova leitura em ${left} segundo${left === 1 ? '' : 's'}`}</div>
    </div>
  );
}

function FaceGuide({ scanning }: { scanning: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="relative h-[62%] max-h-[420px] aspect-[3/4]">
        {['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-xl', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-xl', 'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-xl', 'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-xl']
          .map((c) => <span key={c} className={cx('absolute h-9 w-9 border-white/90', c)} />)}
        <div className="absolute inset-[6%_10%] rounded-[50%] border-2 border-white/85" />
        {scanning && <div className="absolute inset-x-[-12%] h-[3px] animate-[scan_1.3s_ease-in-out_infinite] rounded-full bg-[#4F8BFF] shadow-[0_0_18px_6px_rgba(79,139,255,.55)]" />}
      </div>
    </div>
  );
}

function CameraPlaceholder() {
  return (
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,#3a4a63_0%,#1a2333_70%)]">
      <svg viewBox="0 0 200 260" className="absolute bottom-0 left-1/2 h-[78%] -translate-x-1/2 opacity-60" aria-hidden>
        <ellipse cx="100" cy="92" rx="46" ry="58" fill="#8B98AD" />
        <path d="M18 260c4-58 40-86 82-86s78 28 82 86z" fill="#8B98AD" />
      </svg>
    </div>
  );
}
