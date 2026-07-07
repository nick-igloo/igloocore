import { ReactNode, ButtonHTMLAttributes } from 'react';

// ═══════════════════════════════════════════════════════════════════
// src/components/ui/kit.tsx — Igloo UI kit
// Shared building blocks so every page composes the same pieces.
// Requires the 'igloo' palette in tailwind.config.js (see styling guide).
// ═══════════════════════════════════════════════════════════════════

// ── PageHeader — the standard top-of-page block ─────────────────────
export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
      <div>
        <h1 className="text-[22px] font-extrabold text-igloo-ink tracking-tight">{title}</h1>
        {subtitle && <p className="text-igloo-muted text-[13px] mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Page — standard content container ──────────────────────────────
export function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`${wide ? 'max-w-7xl' : 'max-w-[1080px]'} mx-auto px-5 py-6 pb-10`}>
      {children}
    </div>
  );
}

// ── Card ────────────────────────────────────────────────────────────
export function Card({ children, accent, className = '' }: {
  children: ReactNode; accent?: 'green' | 'blue' | 'amber' | 'coral' | 'navy'; className?: string;
}) {
  const accentClass = accent ? {
    green: 'border-l-[3px] border-l-igloo-green',
    blue: 'border-l-[3px] border-l-igloo-blue',
    amber: 'border-l-[3px] border-l-igloo-amber',
    coral: 'border-l-[3px] border-l-igloo-coral',
    navy: 'border-l-[3px] border-l-igloo-navy',
  }[accent] : '';
  return (
    <div className={`bg-white border border-igloo-border rounded-xl shadow-igloo overflow-hidden ${accentClass} ${className}`}>
      {children}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

// ── SectionLabel — the small-caps grey label ────────────────────────
export function SectionLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[10px] font-bold uppercase tracking-[1.8px] text-igloo-dim ${className}`}>
      {children}
    </div>
  );
}

// ── StatCard — headline number + caption ───────────────────────────
export function StatCard({ label, value, caption, accent }: {
  label: string; value: ReactNode; caption?: ReactNode;
  accent?: 'green' | 'blue' | 'amber' | 'coral' | 'navy';
}) {
  return (
    <Card accent={accent}>
      <CardBody>
        <SectionLabel className="mb-1.5">{label}</SectionLabel>
        <div className="text-2xl font-extrabold tracking-tight text-igloo-ink">{value}</div>
        {caption && <div className="text-igloo-muted text-[11.5px] mt-0.5">{caption}</div>}
      </CardBody>
    </Card>
  );
}

// ── Badge ───────────────────────────────────────────────────────────
const BADGE_VARIANTS = {
  green: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  coral: 'bg-red-100 text-red-800',
  blue: 'bg-igloo-pale text-igloo-navy',
  grey: 'bg-igloo-surface2 text-igloo-muted',
} as const;

export function Badge({ children, variant = 'grey' }: {
  children: ReactNode; variant?: keyof typeof BADGE_VARIANTS;
}) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide whitespace-nowrap ${BADGE_VARIANTS[variant]}`}>
      {children}
    </span>
  );
}

// ── Buttons ─────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary: 'bg-igloo-navy text-white hover:bg-igloo-ink',
  green: 'bg-igloo-green text-white hover:brightness-95',
  amber: 'bg-igloo-amber text-white hover:brightness-95',
  ghost: 'bg-igloo-surface2 text-igloo-muted border border-igloo-border hover:bg-igloo-pale',
  danger: 'bg-igloo-coral text-white hover:brightness-95',
} as const;

export function Btn({ variant = 'primary', small = false, className = '', children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof BTN_VARIANTS; small?: boolean;
  }) {
  return (
    <button
      className={`
        inline-flex items-center gap-2 rounded-lg font-semibold transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${small ? 'px-3 py-1.5 text-[11px]' : 'px-5 py-2 text-[12.5px]'}
        ${BTN_VARIANTS[variant]} ${className}
      `}
      {...rest}>
      {children}
    </button>
  );
}

// ── Table primitives ────────────────────────────────────────────────
export function Th({ children, right = false }: { children?: ReactNode; right?: boolean }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-igloo-muted border-b-2 border-igloo-border whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

export function Td({ children, right = false, className = '' }: {
  children?: ReactNode; right?: boolean; className?: string;
}) {
  return (
    <td className={`px-4 py-2.5 text-[13px] ${right ? 'text-right tabular-nums' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}