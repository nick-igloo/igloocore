// ═══════════════════════════════════════════════════════════════════
// src/lib/brand.ts — Igloo palette + inline style building blocks
// ═══════════════════════════════════════════════════════════════════

import { CSSProperties } from 'react';

export const C = {
  navyDeep: '#0d2850',
  navy: '#1a4a7a',
  blue: '#2e7cc7',
  bluePale: '#e8f1fa',
  surface: '#ffffff',
  surface2: '#f0f4f9',
  border: '#d4e2ef',
  muted: '#5a7a9a',
  dim: '#9ab0c5',
  coral: '#d94848',
  green: '#1a9860',
  amber: '#d68a2a',
} as const;

export const sPageContainer: CSSProperties = {
  maxWidth: 1080,
  margin: '0 auto',
  padding: '24px 20px 40px',
};

export const sCard: CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  overflow: 'hidden',
  boxShadow: '0 1px 3px rgba(13,40,80,0.04)',
};

export const sCardInner: CSSProperties = {
  padding: '16px 20px',
};

export function sBand(color: string): CSSProperties {
  return { borderLeft: `3px solid ${color}` };
}

export function sBadge(bg: string, fg: string): CSSProperties {
  return {
    display: 'inline-block',
    background: bg,
    color: fg,
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.3,
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  };
}

export const sLabel: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: 1.8,
  color: C.dim,
};

export const sBtn: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '9px 18px',
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 600,
  cursor: 'pointer',
  border: 'none',
  transition: 'all 0.15s',
};

export const sBtnPrimary: CSSProperties = { ...sBtn, background: C.navy, color: '#fff' };
export const sBtnGreen: CSSProperties = { ...sBtn, background: C.green, color: '#fff' };
export const sBtnAmber: CSSProperties = { ...sBtn, background: C.amber, color: '#fff' };
export const sBtnGhost: CSSProperties = { ...sBtn, background: C.surface2, color: C.muted, border: `1px solid ${C.border}` };
export const sBtnSmall: CSSProperties = { ...sBtn, padding: '6px 12px', fontSize: 11.5 };

export function sIconBox(bg: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 10,
    background: bg,
    color: C.navy,
    fontWeight: 700,
  };
}

export const sStatValue: CSSProperties = {
  fontSize: 22,
  fontWeight: 800,
  color: C.navyDeep,
  letterSpacing: '-0.4px',
};

export const sInput: CSSProperties = {
  padding: '7px 10px',
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  fontSize: 13,
  fontFamily: "'Outfit', sans-serif",
  color: C.navyDeep,
  background: C.surface,
  outline: 'none',
  width: '100%',
};
