import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, Clock, RotateCcw, ScanFace } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Avatar, Button, Card, CardHeader, MiniStat, Modal, Select } from '../components/ui';
import { DataTable } from '../components/ui/DataTable';
import { ListCard, StatsRow, Toolbar, matches, useDebounced } from '../components/ui/ListKit';
import { FaceBadge } from '../components/ui/status';
import { useData } from '../hooks/useData';
import { runAction } from '../lib/actions';
import { cx } from '../lib/format';
import { DEMO_MODE } from '../lib/config';

const STEPS = ['Foto frontal', 'Rosto levemente à esquerda', 'Rosto levemente à direita', 'Revisão', 'Confirmação'];

export default function FaceEnroll() {
  const { data = [], isLoading, error, refetch } = useData('employees');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q);
  const rows = data.filter((e) => matches(dq, e.full_name, e.code));
  return (
    <Page title="Cadastro facial" subtitle="Capture e revise as imagens usadas no reconhecimento.">
      <div className="space-y-5">
        <Toolbar placeholder="Buscar em cadastro facial..." value={q} onChange={setQ} actionLabel="Iniciar captura" actionIcon={Camera} onAction={() => setOpen(true)} />
        <StatsRow>
          <MiniStat label="Cadastros concluídos" value={data.filter((e) => e.face_status === 'complete').length} icon={CheckCircle2} tone="success" />
          <MiniStat label="Aguardando aprovação" value={data.filter((e) => e.face_status === 'pending').length} icon={Clock} tone="primary" />
          <MiniStat label="Precisam refazer" value={data.filter((e) => e.face_status === 'redo' || e.face_status === 'none').length} icon={AlertTriangle} tone="warning" />
        </StatsRow>
        <ListCard title="Cadastro facial" count={rows.length} loading={isLoading} error={error} onRetry={refetch} empty="Nenhum cadastro facial encontrado.">
          <DataTable rows={rows}
            columns={[
              { key: 'n', header: 'Funcionário', render: (r) => <span className="flex items-center gap-3"><Avatar name={r.full_name} size={34} /><span className="font-medium">{r.full_name}</span></span> },
              { key: 'c', header: 'Código', render: (r) => <span className="tabular-nums text-ink-muted">{r.code}</span> },
              { key: 'f', header: 'Situação facial', render: (r) => <FaceBadge s={r.face_status} /> },
              { key: 'a', header: '', className: 'text-right', render: (r) => r.face_status !== 'complete' && <Button variant="outline" icon={ScanFace} onClick={() => setOpen(true)}>{r.face_status === 'none' ? 'Capturar' : 'Refazer'}</Button> },
            ]}
            mobile={(r) => <div className="flex items-center gap-3"><Avatar name={r.full_name} size={40} /><div className="flex-1"><p className="font-medium">{r.full_name}</p><p className="text-xs text-ink-muted">{r.code}</p></div><FaceBadge s={r.face_status} /></div>} />
        </ListCard>
      </div>
      <CaptureWizard open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

function CaptureWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const employees = useData('employees').data ?? [];
  const [step, setStep] = useState(0);
  const [shots, setShots] = useState<Array<string | null>>([null, null, null]);
  const [blurry, setBlurry] = useState(false);
  const [camErr, setCamErr] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(0); setShots([null, null, null]); setCamErr(false);
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
      .then((s) => { stream.current = s; if (video.current) video.current.srcObject = s; })
      .catch(() => setCamErr(true));
    return () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [open]);

  const capture = () => {
    let data = 'placeholder';
    const v = video.current;
    if (v && v.videoWidth) {
      const c = document.createElement('canvas'); c.width = 360; c.height = 360 * (v.videoHeight / v.videoWidth);
      c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height); data = c.toDataURL('image/jpeg', 0.8);
    }
    // Detecção de foto turva: na demonstração o aviso aparece de forma aleatória; a análise real entra com o módulo facial.
    const isBlurry = DEMO_MODE && Math.random() < 0.15;
    setBlurry(isBlurry);
    if (isBlurry) return;
    setShots((s) => s.map((x, i) => (i === step ? data : x)));
    setStep((s) => s + 1);
  };

  return (
    <Modal open={open} onClose={onClose} title="Captura facial guiada" size="lg"
      footer={
        step < 3 ? <Button icon={Camera} onClick={capture}>Capturar {STEPS[step].toLowerCase()}</Button>
          : step === 3 ? <><Button variant="outline" onClick={() => setStep(0)}>Refazer todas</Button><Button icon={Check} onClick={() => setStep(4)}>Confirmar fotos</Button></>
          : <Button onClick={async () => { await runAction('Cadastro facial enviado para revisão'); onClose(); }}>Concluir</Button>
      }>
      <div className="space-y-4">
        <Select aria-label="Funcionário">{employees.filter((e) => e.face_status !== 'complete').map((e) => <option key={e.id}>{e.full_name} — {e.code}</option>)}</Select>
        <ol className="flex gap-1.5">
          {STEPS.map((s, i) => <li key={s} title={s} className={cx('h-1.5 flex-1 rounded-full', i < step ? 'bg-success' : i === step ? 'bg-primary' : 'bg-slate-200')} />)}
        </ol>
        <p className="text-sm font-semibold">{step + 1}. {STEPS[step]}</p>

        {step < 3 && (
          <div className="relative mx-auto aspect-[3/4] w-full max-w-xs overflow-hidden rounded-card bg-navy">
            {!camErr && <video ref={video} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" />}
            {camErr && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-slate-300"><Camera className="h-8 w-8" />Câmera indisponível neste navegador. A captura usa uma imagem de teste.</div>}
            <div aria-hidden className="pointer-events-none absolute inset-[14%_18%] rounded-[50%] border-2 border-white/80 shadow-[0_0_0_999px_rgba(11,25,48,.35)]" style={{ transform: step === 1 ? 'rotate(-6deg)' : step === 2 ? 'rotate(6deg)' : undefined }} />
            <p className="absolute inset-x-0 bottom-3 text-center text-sm font-medium text-white">{step === 0 ? 'Olhe para a câmera' : step === 1 ? 'Vire levemente para a esquerda' : 'Vire levemente para a direita'}</p>
          </div>
        )}
        {blurry && step < 3 && <Alert tone="warning" title="Foto turva">Mantenha o celular parado, melhore a iluminação e capture novamente.</Alert>}

        {step >= 3 && (
          <div className="grid grid-cols-3 gap-3">
            {shots.map((s, i) => (
              <div key={i} className="text-center">
                <div className="relative aspect-[3/4] overflow-hidden rounded-btn bg-slate-100">
                  {s && s !== 'placeholder' ? <img src={s} alt={STEPS[i]} className="h-full w-full -scale-x-100 object-cover" /> : <ScanFace className="absolute inset-0 m-auto h-8 w-8 text-slate-400" />}
                  {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">PERFIL</span>}
                </div>
                <p className="mt-1 text-xs text-ink-muted">{['Frontal', 'Esquerda', 'Direita'][i]}</p>
                {step === 3 && <button onClick={() => { setStep(i); }} className="mt-1 inline-flex min-h-[36px] items-center gap-1 text-xs font-medium text-primary"><RotateCcw className="h-3 w-3" />Refazer</button>}
              </div>
            ))}
          </div>
        )}
        {step === 4 && <Alert tone="success" title="Fotos prontas">Apenas a foto frontal aparece no perfil. As demais são usadas só para melhorar o reconhecimento.</Alert>}
        <Card className="border-dashed"><CardHeader title="Prova de vida" subtitle="Preparada para atualização futura (piscar, virar o rosto). Não ativa nesta versão." /></Card>
      </div>
    </Modal>
  );
}
