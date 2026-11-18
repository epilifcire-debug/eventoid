export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

const tz = 'America/Sao_Paulo';

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz });
}
export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: tz });
}
export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz });
}
export function fmtRange(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  const d = (x: Date) => x.toLocaleDateString('pt-BR', { day: 'numeric', timeZone: tz });
  const m = db.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: tz }).replace('.', '');
  return `${d(da)} a ${d(db)} de ${m}`;
}
export function relTime(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}
export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}
export function maskCPF(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
export function maskPhone(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}
/** Exibição parcial de documento (LGPD): ***.456.789-** */
export function hideCPF(v: string) {
  const m = maskCPF(v);
  return m.length === 14 ? `***.${m.slice(4, 11)}-**` : m;
}
