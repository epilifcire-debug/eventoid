import { useRef, useState } from 'react';
import { Save, Upload, X } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Button, Card, Field, Input, Select, Toggle, toast } from '../components/ui';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';
import { runAction } from '../lib/actions';
import { cx } from '../lib/format';

type Section = 'offline' | 'face' | 'signature' | 'security';
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'offline', label: 'Operação offline' }, { key: 'face', label: 'Reconhecimento facial' },
  { key: 'signature', label: 'Assinatura EFCSYS' }, { key: 'security', label: 'Segurança' },
];

export default function Settings() {
  const [sec, setSec] = useState<Section>('offline');
  const [saving, setSaving] = useState(false);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const [sigVisible, setSigVisible] = useState(true);
  const [sigLink, setSigLink] = useState('https://efcsys.com.br');
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (f?: File) => {
    if (!f) return;
    if (!['image/png', 'image/svg+xml'].includes(f.type)) { toast.error('Envie PNG ou SVG.'); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error('Arquivo maior que 2 MB.'); return; }
    setSigUrl(URL.createObjectURL(f));
  };
  const save = async () => { setSaving(true); await runAction('Configurações salvas'); setSaving(false); };

  return (
    <Page title="Configurações" subtitle="Parâmetros globais disponíveis ao Administrador Master.">
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="self-start p-2">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Seções">
            {SECTIONS.map((s) => (
              <button key={s.key} onClick={() => setSec(s.key)} className={cx('min-h-[44px] whitespace-nowrap rounded-btn px-4 text-left text-sm font-medium', sec === s.key ? 'bg-primary-light text-primary' : 'text-ink hover:bg-bg')}>{s.label}</button>
            ))}
          </nav>
        </Card>
        <Card className="p-5 sm:p-6">
          {sec === 'offline' && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-semibold">Operação offline</h2><p className="text-sm text-ink-muted">Defina a validade dos dados e os alertas de sincronização.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Validade padrão (horas)" hint="Bloqueia leituras somente quando os dados vencerem."><Input type="number" defaultValue={24} /></Field>
                <Field label="Avisar após (horas sem sincronizar)"><Input type="number" defaultValue={6} /></Field>
                <Field label="Sincronização completa antes do evento"><Select defaultValue="1"><option value="1">Até 1 hora antes</option><option value="2">Até 2 horas antes</option><option value="6">Até 6 horas antes</option></Select></Field>
                <Field label="Alerta de fila acumulada (registros)"><Input type="number" defaultValue={50} /></Field>
              </div>
            </div>
          )}
          {sec === 'face' && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-semibold">Reconhecimento facial</h2><p className="text-sm text-ink-muted">Parâmetros padrão dos leitores.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Intervalo de releitura do mesmo funcionário (s)"><Input type="number" defaultValue={20} /></Field>
                <Field label="Tempo do resultado na tela (s)"><Input type="number" defaultValue={5} /></Field>
                <Field label="Alerta após negativas consecutivas"><Input type="number" defaultValue={5} /></Field>
                <Field label="Qualidade mínima da captura"><Select defaultValue="m"><option value="b">Baixa</option><option value="m">Média</option><option value="a">Alta</option></Select></Field>
              </div>
              <Alert tone="info" title="Prova de vida">Preparada para atualização futura. Não está ativa nesta versão.</Alert>
            </div>
          )}
          {sec === 'signature' && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-semibold">Assinatura EFCSYS</h2><p className="text-sm text-ink-muted">Exclusivo do Administrador Master.</p></div>
              <input ref={fileRef} type="file" accept="image/png,image/svg+xml" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-line px-6 py-8 text-center hover:border-primary/50 hover:bg-primary-light/30">
                <Upload className="h-6 w-6 text-primary" /><span className="mt-2 font-semibold">Enviar assinatura gráfica</span><span className="text-sm text-ink-muted">PNG ou SVG, até 2 MB</span>
              </button>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Link de destino"><Input type="url" value={sigLink} onChange={(e) => setSigLink(e.target.value)} placeholder="https://" /></Field>
                <div className="flex items-end"><Toggle checked={sigVisible} onChange={setSigVisible} label="Exibir assinatura no rodapé" /></div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Pré-visualização</p>
                <div className="flex items-center justify-between gap-3 rounded-btn bg-navy px-5 py-4">
                  {!sigVisible ? <span className="text-xs text-slate-400">Assinatura oculta</span> : sigUrl ? (
                    <a href={sigLink} target="_blank" rel="noreferrer"><img src={sigUrl} alt="Assinatura EFCsys" className="h-6 w-auto" /></a>
                  ) : <EfcsysSignature className="text-xs text-slate-300" />}
                  {sigUrl && <button aria-label="Remover imagem" onClick={() => setSigUrl(null)} className="flex h-10 w-10 items-center justify-center rounded-btn text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>}
                </div>
              </div>
            </div>
          )}
          {sec === 'security' && (
            <div className="space-y-5">
              <div><h2 className="text-lg font-semibold">Segurança</h2><p className="text-sm text-ink-muted">Sessões e senhas.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Encerrar sessão após inatividade (min)"><Input type="number" defaultValue={60} /></Field>
                <Field label="Força mínima de senha"><Select defaultValue="forte"><option value="media">Média</option><option value="forte">Forte</option></Select></Field>
              </div>
              <Toggle checked label="Exigir troca de senha no primeiro acesso" onChange={() => {}} />
              <Toggle checked label="Apagar dados faciais locais ao sair do leitor" onChange={() => {}} />
            </div>
          )}
          <div className="mt-6 border-t border-line pt-5"><Button icon={Save} loading={saving} onClick={save}>Salvar configurações</Button></div>
        </Card>
      </div>
    </Page>
  );
}
