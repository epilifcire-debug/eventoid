import type { ReactNode } from 'react';
import { cx } from '../../lib/format';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnTablet?: boolean;
}

/** Tabela no desktop/tablet (com rolagem horizontal) e cartões no celular. */
export function DataTable<T extends { id: string }>({ rows, columns, mobile, onRowClick }: {
  rows: T[];
  columns: Column<T>[];
  mobile: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
}) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-slate-50/70 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {columns.map((c) => (
                <th key={c.key} className={cx('px-5 py-3 font-semibold', c.hideOnTablet && 'hidden lg:table-cell', c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cx('border-b border-line last:border-0 transition-colors hover:bg-slate-50', onRowClick && 'cursor-pointer')}>
                {columns.map((c) => (
                  <td key={c.key} className={cx('px-5 py-3 text-ink', c.hideOnTablet && 'hidden lg:table-cell', c.className)}>{c.render(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cx('px-4 py-3.5', onRowClick && 'cursor-pointer active:bg-slate-50')}>
            {mobile(r)}
          </li>
        ))}
      </ul>
    </>
  );
}
