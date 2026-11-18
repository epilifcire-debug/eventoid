import { useState } from 'react';
import type { HourPoint } from '../../services/api';
import type { Sector } from '../../types';

/** Barras agrupadas Entradas × Saídas por hora (SVG leve, sem biblioteca). */
export function HourlyBars({ data }: { data: HourPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(50, ...data.map((d) => Math.max(d.in, d.out)));
  const top = Math.ceil(max / 50) * 50;
  const W = 640, Hh = 210, pl = 34, pb = 24, pt = 8;
  const iw = W - pl - 8, ih = Hh - pb - pt;
  const step = iw / data.length, bw = Math.min(12, step * 0.32);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(top * t));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="h-auto w-full" role="img" aria-label="Acessos por hora: entradas e saídas">
        {ticks.map((t) => {
          const y = pt + ih - (t / top) * ih;
          return <g key={t}><line x1={pl} x2={W - 8} y1={y} y2={y} stroke="#E2E8F0" strokeDasharray={t ? '3 4' : undefined} /><text x={pl - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#64748B">{t}</text></g>;
        })}
        {data.map((d, i) => {
          const x = pl + i * step + step / 2;
          const hi = (d.in / top) * ih, ho = (d.out / top) * ih;
          return (
            <g key={d.h} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x - step / 2} y={pt} width={step} height={ih} fill={hover === i ? '#F1F5F9' : 'transparent'} />
              <rect x={x - bw - 1} y={pt + ih - hi} width={bw} height={hi} rx="2" fill="#2563EB" />
              <rect x={x + 1} y={pt + ih - ho} width={bw} height={ho} rx="2" fill="#CBD5E1" />
              {i % 2 === 0 && <text x={x} y={Hh - 6} textAnchor="middle" fontSize="10" fill="#64748B">{d.h}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-btn border border-line bg-white px-3 py-2 text-xs shadow-pop">
          <p className="font-semibold text-ink">{data[hover].h}</p>
          <p className="text-primary">Entradas: {data[hover].in}</p>
          <p className="text-ink-muted">Saídas: {data[hover].out}</p>
        </div>
      )}
    </div>
  );
}

export function SectorBars({ sectors }: { sectors: Sector[] }) {
  const list = [...sectors].filter((s) => s.present > 0).sort((a, b) => b.present - a.present).slice(0, 8);
  const max = Math.max(1, ...list.map((s) => s.present));
  return (
    <ul className="space-y-3.5">
      {list.map((s) => (
        <li key={s.id} className="grid grid-cols-[110px_1fr_40px] items-center gap-3 text-sm">
          <span className="truncate text-ink">{s.name}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(s.present / max) * 100}%` }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-ink">{s.present}</span>
        </li>
      ))}
    </ul>
  );
}
