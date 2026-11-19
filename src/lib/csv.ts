import { toast } from '../components/ui';

/** Gera e baixa um CSV (separador ;, UTF-8 com BOM — abre direto no Excel em português). */
export function downloadCSV(filename: string, header: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  if (!rows.length) { toast.info('Nada para exportar com os filtros atuais.'); return; }
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    // evita injeção de fórmula ao abrir no Excel
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const body = [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast.success('Arquivo gerado');
}
