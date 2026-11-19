import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, CheckCircle2, ImageUp, Loader2, MapPin, CalendarDays, RotateCcw, ShieldCheck } from 'lucide-react';
import logoLight from '../assets/logo-light.png';
import { Alert, Field, Input, Select } from '../components/ui';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';
import { cx, fmtRange, maskCPF, maskPhone } from '../lib/format';
import { getSignupInfo, submitSignup, type SignupInfo } from '../services/selfRegister';

function cpfValid(v: string) {
  const d = v.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (n: number) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

/** Redimensiona para no máximo 720px e gera JPEG (economiza dados móveis). */
async function toJpeg(src: CanvasImageSource, w: number, h: number): Promise<{ blob: Blob; url: string }> {
  const max = 720, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Falha na imagem'))), 'image/jpeg', 0.85));
  return { blob, url: URL.createObjectURL(blob) };
}

type Step = 0 | 1 | 2 | 3;
const STEPS = ['Seus dados', 'Foto', 'Termo'];

export default function SelfRegister() {
  const { token = '' } = useParams();
  const [info, setInfo] = useState<SignupInfo | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({ full_name: '', cpf: '', phone: '', email: '', sector_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [accept, setAccept] = useState(false);
  const [hp, setHp] = useState(''); // campo invisível contra robôs
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState('');

  useEffect(() => { getSignupInfo(token).then(setInfo).catch((e) => setLoadErr(e.message)); }, [token]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let v = e.target.value;
    if (k === 'cpf') v = maskCPF(v);
    if (k === 'phone') v = maskPhone(v);
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((x) => ({ ...x, [k]: '' }));
  };

  const validateData = () => {
    const e: Record<string, string> = {};
    const name = form.full_name.trim().replace(/\s+/g, ' ');
    if (name.length < 5 || !name.includes(' ')) e.full_name = 'Informe nome e sobrenome.';
    if (!cpfValid(form.cpf)) e.cpf = 'CPF inválido.';
    const ph = form.phone.replace(/\D/g, '');
    if (ph.length < 10 || ph.length > 11) e.phone = 'Informe o telefone com DDD.';
    if (form.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'E-mail inválido.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const send = async () => {
    if (!info?.term || !photo || !accept || hp) return;
    setSending(true); setSendErr('');
    try {
      await submitSignup(token, { ...form, term_version: info.term.version, accept }, photo.blob);
      setStep(3);
    } catch (e) { setSendErr(e instanceof Error ? e.message : 'Não foi possível enviar.'); }
    finally { setSending(false); }
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      <header className="bg-navy px-5 pb-6 pt-[max(20px,env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-lg">
          <img src={logoLight} alt="EVENTOID" className="h-7 w-auto" />
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#6EA0FF]">Cadastro de equipe</p>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{info?.name ?? 'Carregando…'}</h1>
          {info?.status === 'ok' && (
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              {(info.venue_name || info.city) && <p className="flex items-center gap-2"><MapPin className="h-4 w-4" />{[info.venue_name, info.city && `${info.city}${info.state ? `/${info.state}` : ''}`].filter(Boolean).join(' · ')}</p>}
              {info.starts_at && info.ends_at && <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{fmtRange(info.starts_at, info.ends_at)}</p>}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-10 pt-5">
        {loadErr ? <Alert tone="danger" title="Não foi possível carregar">{loadErr}</Alert>
          : !info ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Carregando" /></div>
          : info.status === 'unavailable' ? <Alert tone="warning" title="Cadastro indisponível">Este link não está ativo. Confira com a organização do evento se ele está correto.</Alert>
          : info.status === 'no_term' ? <Alert tone="warning" title="Cadastro ainda não liberado">A organização ainda não publicou o termo de uso da biometria. Tente novamente mais tarde.</Alert>
          : step === 3 ? (
            <div className="rounded-card border border-line bg-white p-6 text-center shadow-card">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-light text-success"><CheckCircle2 className="h-9 w-9" /></span>
              <h2 className="mt-4 text-xl font-bold text-ink">Cadastro enviado</h2>
              <p className="mt-2 text-sm text-ink-muted">Obrigado, {form.full_name.split(' ')[0]}. Seu cadastro está <strong className="text-ink">aguardando aprovação</strong> da organização do evento. Você não precisa fazer mais nada agora.</p>
              <p className="mt-4 rounded-btn bg-bg px-3 py-2.5 text-xs text-ink-muted">No dia do evento, a entrada será liberada pelo reconhecimento facial depois da aprovação.</p>
            </div>
          ) : (
            <div className="rounded-card border border-line bg-white shadow-card">
              <ol className="flex gap-2 border-b border-line px-5 py-4">
                {STEPS.map((s, i) => (
                  <li key={s} className="flex-1">
                    <span className={cx('block h-1.5 rounded-full', i < step ? 'bg-success' : i === step ? 'bg-primary' : 'bg-slate-200')} />
                    <span className={cx('mt-1.5 block text-xs font-medium', i === step ? 'text-primary' : 'text-ink-muted')}>{s}</span>
                  </li>
                ))}
              </ol>

              <div className="p-5">
                {step === 0 && (
                  <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (validateData()) setStep(1); }}>
                    <Field label="Nome completo" required error={errors.full_name}><Input value={form.full_name} onChange={set('full_name')} autoComplete="name" /></Field>
                    <Field label="CPF" required error={errors.cpf}><Input value={form.cpf} onChange={set('cpf')} inputMode="numeric" placeholder="000.000.000-00" /></Field>
                    <Field label="Telefone (WhatsApp)" required error={errors.phone}><Input value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="(79) 99999-9999" /></Field>
                    <Field label="E-mail" error={errors.email}><Input value={form.email} onChange={set('email')} type="email" inputMode="email" autoComplete="email" /></Field>
                    {!!info.sectors?.length && (
                      <Field label="Setor em que vai trabalhar" hint="Se não souber, deixe em branco. A organização define depois.">
                        <Select value={form.sector_id} onChange={set('sector_id')}><option value="">Não sei / a definir</option>{info.sectors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
                      </Field>
                    )}
                    <input tabIndex={-1} autoComplete="off" aria-hidden value={hp} onChange={(e) => setHp(e.target.value)} className="absolute left-[-9999px] h-0 w-0 opacity-0" name="website" />
                    <button type="submit" className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-btn bg-primary font-semibold text-white">Continuar<ArrowRight className="h-4 w-4" /></button>
                  </form>
                )}

                {step === 1 && <SelfieStep photo={photo} onPhoto={setPhoto} onBack={() => setStep(0)} onNext={() => setStep(2)} />}

                {step === 2 && info.term && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {photo && <img src={photo.url} alt="Sua foto" className="h-16 w-16 rounded-full object-cover" />}
                      <div className="text-sm"><p className="font-semibold text-ink">{form.full_name}</p><p className="text-ink-muted">CPF {form.cpf}</p></div>
                    </div>
                    <div className="rounded-btn border border-line bg-bg p-4 text-sm">
                      <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-primary" />Termo de uso da biometria · {info.term.version}</p>
                      <dl className="mt-3 space-y-2.5 text-ink-muted">
                        <div><dt className="font-medium text-ink">Finalidade</dt><dd>{info.term.purpose}</dd></div>
                        <div><dt className="font-medium text-ink">Prazo de armazenamento</dt><dd>{info.term.retention}</dd></div>
                        <div><dt className="font-medium text-ink">Termo</dt><dd className="whitespace-pre-line">{info.term.body}</dd></div>
                      </dl>
                    </div>
                    <label className="flex min-h-[48px] items-start gap-3 text-sm text-ink">
                      <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
                      Li e concordo com o uso da minha imagem facial para controle de acesso e presença neste evento.
                    </label>
                    {sendErr && <Alert tone="danger" title="Não foi possível enviar">{sendErr}</Alert>}
                    <div className="grid grid-cols-[auto_1fr] gap-2">
                      <button type="button" onClick={() => setStep(1)} disabled={sending} className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn border border-line px-4 font-semibold text-ink"><ArrowLeft className="h-4 w-4" />Voltar</button>
                      <button type="button" onClick={send} disabled={!accept || sending} className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn bg-primary font-semibold text-white disabled:opacity-50">
                        {sending && <Loader2 className="h-4 w-4 animate-spin" />}{sending ? 'Enviando…' : 'Enviar cadastro'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        <EfcsysSignature className="mt-8 pb-[env(safe-area-inset-bottom)] text-center text-xs text-ink-muted" />
      </main>
    </div>
  );
}

function SelfieStep({ photo, onPhoto, onBack, onNext }: { photo: { blob: Blob; url: string } | null; onPhoto: (p: { blob: Blob; url: string } | null) => void; onBack: () => void; onNext: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [cam, setCam] = useState<'loading' | 'ready' | 'error'>('loading');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (photo) return;
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) { setCam('error'); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false })
      .then((s) => { stream = s; if (video.current) video.current.srcObject = s; setCam('ready'); })
      .catch(() => setCam('error'));
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [photo]);

  const shoot = async () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    onPhoto(await toJpeg(v, v.videoWidth, v.videoHeight));
  };
  const fromFile = async (f?: File) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setErr('Envie uma foto.'); return; }
    if (f.size > 15 * 1024 * 1024) { setErr('Foto muito grande.'); return; }
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = async () => { onPhoto(await toJpeg(img, img.naturalWidth, img.naturalHeight)); URL.revokeObjectURL(url); };
    img.onerror = () => setErr('Não foi possível ler a foto.');
    img.src = url;
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-ink">Foto do rosto</p>
        <p className="text-sm text-ink-muted">De frente, sem boné, óculos escuros ou máscara, em um lugar iluminado.</p>
      </div>
      <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-card bg-navy">
        {photo ? <img src={photo.url} alt="Prévia da foto" className="h-full w-full object-cover" /> : (
          <>
            {cam !== 'error' && <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />}
            {cam === 'error' && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-300"><Camera className="h-8 w-8" />Câmera indisponível. Envie uma foto da galeria.</div>}
            <div aria-hidden className="pointer-events-none absolute inset-[12%_16%] rounded-[50%] border-2 border-white/85 shadow-[0_0_0_999px_rgba(11,25,48,.35)]" />
            {cam === 'ready' && <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white">Encaixe o rosto na moldura</p>}
          </>
        )}
      </div>
      {err && <Alert tone="warning" title="Foto">{err}</Alert>}
      {photo ? (
        <button type="button" onClick={() => onPhoto(null)} className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-btn border border-line font-semibold text-ink"><RotateCcw className="h-4 w-4" />Tirar outra foto</button>
      ) : (
        <div className="grid gap-2">
          {cam === 'ready' && <button type="button" onClick={shoot} className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn bg-primary font-semibold text-white"><Camera className="h-5 w-5" />Tirar foto</button>}
          <label className={cx('flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-btn font-semibold', cam === 'ready' ? 'border border-line text-ink' : 'bg-primary text-white')}>
            <ImageUp className="h-4 w-4" />{cam === 'ready' ? 'Enviar da galeria' : 'Escolher foto'}
            <input type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => { fromFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
      <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
        <button type="button" onClick={onBack} className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn border border-line px-4 font-semibold text-ink"><ArrowLeft className="h-4 w-4" />Voltar</button>
        <button type="button" onClick={onNext} disabled={!photo} className="flex min-h-[50px] items-center justify-center gap-2 rounded-btn bg-primary font-semibold text-white disabled:opacity-50">Continuar<ArrowRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
