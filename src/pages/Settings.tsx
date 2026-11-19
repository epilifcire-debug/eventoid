import { useEffect, useRef, useState } from 'react';
import { Save, Upload, X } from 'lucide-react';
import { Page } from '../components/layout/AppShell';
import { Alert, Button, Card, Field, Input, LoadingBlock, Select, Toggle, toast } from '../components/ui';
import { EfcsysSignature } from '../components/layout/EfcsysSignature';
import { useData } from '../hooks/useData';
import { runAction } from '../lib/actions';
import { cx } from '../lib/format';
import { saveSettings, uploadSignature } from '../services/mutations';
import type { AppSettings } from '../types';

type Section = 'offline' | 'face' | 'signature' | 'security';
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: 'offline', label: 'Operação offline' }, { key: 'face', label: 'Reconhecimento facial' },
  { key: 'signature', label: 'Assinatura EFCSYS' }, { key: 'security', label: 'Segurança' },
];

export default function Settings() {
  const { data, isLoading } = useData('settings');
  const [sec, setSec] = useState<Section>('offline');
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<AppSettings | null>(null);
  const [sigFile, setSigFile] = useState<File | null>(null);
  const [sigUrl, setSigUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (data) setCfg(data); }, [data]);
  const set = <K extends keyof AppSettings>(k: K, v: AppSettings[K]) => setCfg((c) => (c ? { ...c, [k]: v } : c));
  const numField = (k: keyof AppSettings, min: number, max: number) => ({
    type: 'number' as const, min, max, value: String(cfg?.[k] ?? ''),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, Number(e.target.value) as never),
  });

  const onFile = (f?: File) => {
    if (!f) return;
    if (!['image/png', 'image/svg+xml'].includes(f.type)) { toast.error('Envie PNG ou SVG.'); return; }
    if (f.size > 2 * 1024 * 1024) { toast.error('Arquivo maior que 2 MB.'); return; }
    setSigFile(f); setSigUrl(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    await runAction('Configurações salvas', async () => {
      const signature_path = sigFile ? await uploadSignature(sigFile) : cfg.signature_path;
      await saveSettings({
        offline_hours: cfg.offline_hours, offline_warn_hours: cfg.offline_warn_hours, full_sync_hours_before: cfg.full_sync_hours_before,
        queue_alert_threshold: cfg.queue_alert_threshold, reread_interval_s: cfg.reread_interval_s, result_time_s: cfg.result_time_s,
        denied_streak_alert: cfg.denied_streak_alert, signature_visible: cfg.signature_visible, signature_link: cfg.signature_link || null, signature_path,
      });
      setSigFile(null);
    }, ['settings']);
    setSaving(false);
  };

  return (
    <Page title="Configurações" subtitle="Parâmetros globais disponíveis ao Administrador Master.">
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <Card className="self-start p-2">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Seções">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" onClick={() => setSec(s.key)} className={cx('min-h-[44px] whitespace-nowrap rounded-btn px-4 text-left text-sm font-medium', sec === s.key ? 'bg-primary-light text-primary' : 'text-ink hover:bg-bg')}>{s.label}</button>
            ))}
          </nav>
        </Card>
        <Card className="p-5 sm:p-6">
          {isLoading || !cfg ? (isLoading ? <LoadingBlock /> : <Alert tone="warning" title="Configurações indisponíveis">Conecte o servidor para carregar os parâmetros.</Alert>) : (
            <>
              {sec === 'offline' && (
                <div className="space-y-5">
                  <div><h2 className="text-lg font-semibold">Operação offline</h2><p className="text-sm text-ink-muted">Defina a validade dos dados e os alertas de sincronização.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Validade padrão (horas)" hint="Bloqueia leituras somente quando os dados vencerem."><Input {...numField('offline_hours', 1, 168)} /></Field>
                    <Field label="Avisar após (horas sem sincronizar)"><Input {...numField('offline_warn_hours', 1, 72)} /></Field>
                    <Field label="Sincronização completa antes do evento">
                      <Select value={cfg.full_sync_hours_before} onChange={(e) => set('full_sync_hours_before', Number(e.target.value))}>
                        <option value={1}>Até 1 hora antes</option><option value={2}>Até 2 horas antes</option><option value={6}>Até 6 horas antes</option>
                      </Select>
                    </Field>
                    <Field label="Alerta de fila acumulada (registros)"><Input {...numField('queue_alert_threshold', 1, 10000)} /></Field>
                  </div>
                </div>
              )}
              {sec === 'face' && (
                <div className="space-y-5">
                  <div><h2 className="text-lg font-semibold">Reconhecimento facial</h2><p className="text-sm text-ink-muted">Padrões para novos leitores. Cada leitor pode ter valores próprios em Configuração de leitores.</p></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Intervalo de releitura do mesmo funcionário (s)"><Input {...numField('reread_interval_s', 5, 600)} /></Field>
                    <Field label="Tempo do resultado na tela (s)"><Input {...numField('result_time_s', 2, 30)} /></Field>
                    <Field label="Alerta após negativas consecutivas"><Input {...numField('denied_streak_alert', 1, 100)} /></Field>
                  </div>
                  <Alert tone="info" title="Prova de vida">Preparada para atualização futura. Não está ativa nesta versão.</Alert>
                </div>
              )}
              {sec === 'signature' && (
                <div className="space-y-5">
                  <div><h2 className="text-lg font-semibold">Assinatura EFCSYS</h2><p className="text-sm text-ink-muted">Exclusivo do Administrador Master.</p></div>
                  <input ref={fileRef} type="file" accept="image/png,image/svg+xml" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-card border-2 border-dashed border-line px-6 py-8 text-center hover:border-primary/50 hover:bg-primary-light/30">
                    <Upload className="h-6 w-6 text-primary" /><span className="mt-2 font-semibold">Enviar assinatura gráfica</span><span className="text-sm text-ink-muted">PNG ou SVG, até 2 MB{cfg.signature_path && !sigFile ? ' · já existe uma assinatura enviada' : ''}</span>
                  </button>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Link de destino"><Input type="url" value={cfg.signature_link ?? ''} onChange={(e) => set('signature_link', e.target.value)} placeholder="https://" /></Field>
                    <div className="flex items-end"><Toggle checked={cfg.signature_visible} onChange={(v) => set('signature_visible', v)} label="Exibir assinatura no rodapé" /></div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium">Pré-visualização</p>
                    <div className="flex items-center justify-between gap-3 rounded-btn bg-navy px-5 py-4">
                      {!cfg.signature_visible ? <span className="text-xs text-slate-400">Assinatura oculta</span> : sigUrl ? (
                        <img src={sigUrl} alt="Assinatura EFCsys" className="h-6 w-auto" />
                      ) : <EfcsysSignature className="text-xs text-slate-300" />}
                      {sigUrl && <button type="button" aria-label="Remover imagem" onClick={() => { setSigUrl(null); setSigFile(null); }} className="flex h-10 w-10 items-center justify-center rounded-btn text-slate-300 hover:bg-white/10"><X className="h-4 w-4" /></button>}
                    </div>
                  </div>
                </div>
              )}
              {sec === 'security' && (
                <div className="space-y-4">
                  <div><h2 className="text-lg font-semibold">Segurança</h2><p className="text-sm text-ink-muted">Como o acesso é protegido.</p></div>
                  <ul className="space-y-2 text-sm">
                    {['Cada perfil só acessa o que tem permissão: a regra é aplicada no banco (RLS), não só na tela.',
                      'Usuários entram por convite e definem a própria senha. Nenhuma senha é criada pelo administrador.',
                      'Fotos faciais ficam em armazenamento privado. O operador de Leitura só vê fotos do evento atribuído.',
                      'Ações sensíveis (perfis, biometria, liberações, permissões) ficam registradas na Auditoria.']
                      .map((t) => <li key={t} className="rounded-btn bg-bg px-3 py-2.5">{t}</li>)}
                  </ul>
                  <Alert tone="info" title="Senha e sessão">Força mínima de senha, confirmação de e-mail e duração da sessão são definidas no painel do Supabase, em Authentication.</Alert>
                </div>
              )}
              {sec !== 'security' && <div className="mt-6 border-t border-line pt-5"><Button icon={Save} loading={saving} onClick={save}>Salvar configurações</Button></div>}
            </>
          )}
        </Card>
      </div>
    </Page>
  );
}
