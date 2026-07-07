import { useState, useMemo, ReactNode } from 'react';
import { CSSProperties } from 'react';
import {
  ReconRow, ReconEngineResult, monthKeyOf, monthLabel, fmt, fmt0, escCsv, dlCsv,
} from '../lib/reconEngine';

// ═══════════════════════════════════════════════════════════════════
// src/components/ReconView.tsx — shared reconciliation presentation
// Renders month pills, per-channel cards (Issues / On its way / Paid)
// for an engine result. Used by both Manual and Live tabs; pass
// tab-specific controls (upload chips, refresh button...) via `toolbar`.
// ═══════════════════════════════════════════════════════════════════

const C = {
  navyDeep: '#0d2850', navy: '#1a4a7a', blue: '#3a8fd1', bluePale: '#ddeeff',
  coral: '#e8513a', amber: '#e8a020', green: '#3ab87a',
  bg: '#f0f4f9', surface: '#ffffff', surface2: '#eef3f9',
  border: '#d4e2ef', muted: '#5a7a9a', dim: '#9ab0c5',
};

const LABEL_STYLE: Record<string, { bg: string; fg: string }> = {
  'Paid': { bg: '#d8f0e5', fg: '#1a6e42' },
  'Resolution': { bg: C.surface2, fg: C.muted },
  'In transit': { bg: C.bluePale, fg: C.navy },
  'Due': { bg: C.bluePale, fg: C.navy },
  'Upcoming': { bg: C.surface2, fg: C.muted },
  'Overdue': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Short-paid': { bg: '#fde0d8', fg: '#9a2a1a' },
  'Overpaid': { bg: '#fdefd5', fg: '#7a4e10' },
  'Unknown': { bg: '#fdefd5', fg: '#7a4e10' },
  'Breakdown pending': { bg: C.bluePale, fg: C.navy },
};

const sCard: CSSProperties = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 1px 4px rgba(26,74,122,0.07), 0 4px 16px rgba(26,74,122,0.06)', overflow: 'hidden' };
const sBadge = (bg: string, fg: string): CSSProperties => ({ display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: bg, color: fg, letterSpacing: '0.3px', whiteSpace: 'nowrap' });
const sBtn: CSSProperties = { padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif", display: 'inline-flex', alignItems: 'center', gap: 6 };
const sPill = (active: boolean): CSSProperties => ({
  padding: '6px 14px', borderRadius: 20, border: `1px solid ${active ? C.navy : C.border}`,
  background: active ? C.navy : C.surface, color: active ? '#fff' : C.muted,
  cursor: 'pointer', fontWeight: 600, fontSize: 12, fontFamily: "'Outfit', sans-serif",
});

interface Props {
  engine: ReconEngineResult | null;
  toolbar?: ReactNode;          // tab-specific controls, rendered in the top bar
  emptyMessage?: ReactNode;     // shown when engine is null
  exportPrefix?: string;
}

export default function ReconView({ engine, toolbar, emptyMessage, exportPrefix = 'reconciliation' }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKeyOf(new Date()));
  const [showPaid, setShowPaid] = useState<Record<string, boolean>>({});

  const availableMonths = useMemo(() => {
    if (!engine) return [];
    const s = new Set<string>();
    engine.rows.forEach(r => { if (r.monthKey && r.bucket !== 'hidden') s.add(r.monthKey); });
    return [...s].sort().reverse();
  }, [engine]);

  const activeMonth = availableMonths.includes(selectedMonth)
    ? selectedMonth
    : (availableMonths[0] || selectedMonth);

  const channels = useMemo(() => {
    if (!engine) return [];
    return (['Airbnb', 'Booking.com'] as const).map(ch => {
      const chRows = engine.rows.filter(r => r.channel === ch && r.monthKey === activeMonth && r.bucket !== 'hidden');
      const issuePriority = (l: string) => l === 'Short-paid' ? 0 : l === 'Overdue' ? 1 : 2;
      const issues = chRows.filter(r => r.bucket === 'issue')
        .sort((a, b) => issuePriority(a.label) - issuePriority(b.label));
      const onway = chRows.filter(r => r.bucket === 'onway')
        .sort((a, b) => (a.sortDate?.getTime() || 0) - (b.sortDate?.getTime() || 0));
      const paid = chRows.filter(r => r.bucket === 'paid')
        .sort((a, b) => (b.sortDate?.getTime() || 0) - (a.sortDate?.getTime() || 0));
      const bankIssues = engine.unmatchedBank.filter(t => t.channel === ch && t.monthKey === activeMonth);
      const sumPaid = Math.round(paid.reduce((s, r) => s + (r.channelPaid || 0), 0) * 100) / 100;
      return {
        channel: ch, issues, onway, paid, bankIssues,
        received: sumPaid,
        onwayTotal: Math.round(onway.reduce((s, r) => s + (r.channelPaid ?? r.expected ?? 0), 0) * 100) / 100,
        shortTotal: Math.round(issues.filter(r => r.label === 'Short-paid').reduce((s, r) => s + (r.diff || 0), 0) * 100) / 100,
        commissionDue: Math.round(chRows.reduce((s, r) => s + r.commissionDue, 0) * 100) / 100,
      };
    });
  }, [engine, activeMonth]);

  const exportCsv = () => {
    if (!engine) return;
    const monthRows = engine.rows.filter(r => r.monthKey === activeMonth && r.bucket !== 'hidden');
    const h = ['Channel', 'Status', 'Payout date', 'Bank date', 'Code', 'Property', 'Check-out', 'Channel paid', 'Avantio expected', 'Diff', 'Note'];
    const rows = monthRows.map(r => [
      r.channel, r.label, r.payoutDate, r.bankDate, r.code, r.property, r.checkout,
      r.channelPaid != null ? r.channelPaid.toFixed(2) : '',
      r.expected != null ? r.expected.toFixed(2) : '',
      r.diff != null ? r.diff.toFixed(2) : '',
      r.note,
    ]);
    dlCsv([h.map(escCsv).join(','), ...rows.map(rr => rr.map(escCsv).join(','))].join('\n'),
      `${exportPrefix}_${activeMonth}.csv`);
  };

  const rowLine = (r: ReconRow, i: number) => {
    const st = LABEL_STYLE[r.label] || LABEL_STYLE['Paid'];
    const amount = r.label === 'Short-paid' && r.diff != null ? r.diff
      : (r.channelPaid ?? r.expected ?? null);
    return (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
        <span style={{ ...sBadge(st.bg, st.fg), width: 76, textAlign: 'center' }}>{r.label}</span>
        <span style={{ fontWeight: 600, color: C.navyDeep, width: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.property}>{r.property}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.dim, width: 110 }}>{r.code}</span>
        <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{r.checkout || r.payoutDate}</span>
        <span style={{ color: C.dim, fontSize: 11.5, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.note}>{r.note}</span>
        <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: r.label === 'Short-paid' ? C.coral : C.navyDeep, minWidth: 84, textAlign: 'right' }}>
          {amount != null ? fmt(amount) : ''}
        </span>
      </div>
    );
  };

  return (
    <div>
      {/* ── TOP BAR: toolbar + months + export ── */}
      <div style={{ ...sCard, padding: '12px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {toolbar}
        {engine && toolbar && <div style={{ width: 1, height: 22, background: C.border, margin: '0 6px' }} />}
        {availableMonths.map(m => (
          <button key={m} style={sPill(m === activeMonth)} onClick={() => setSelectedMonth(m)}>{monthLabel(m)}</button>
        ))}
        {engine && (
          <button style={{ ...sBtn, marginLeft: 'auto', background: C.navy, color: '#fff' }} onClick={exportCsv}>&#8595; Export</button>
        )}
      </div>

      {!engine && (
        <div style={{ ...sCard, padding: '40px 24px', textAlign: 'center' }}>
          {emptyMessage || (
            <div style={{ color: C.dim, fontSize: 12.5 }}>No reconciliation data yet.</div>
          )}
        </div>
      )}

      {engine && channels.map(ch => {
        const showingPaid = !!showPaid[ch.channel + activeMonth];
        const issueCount = ch.issues.length + ch.bankIssues.length;
        return (
          <div key={ch.channel} style={{ ...sCard, marginBottom: 20 }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, background: ch.channel === 'Airbnb' ? '#fdf6f4' : '#f4f9fd', display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.3px', minWidth: 120 }}>{ch.channel}</span>
              <span style={{ fontSize: 13, color: C.muted }}>
                Received <b style={{ color: '#1a6e42', fontSize: 15 }}>{fmt0(ch.received)}</b>
                <span style={{ color: C.dim }}> ({ch.paid.length})</span>
              </span>
              <span style={{ fontSize: 13, color: C.muted }}>
                On its way <b style={{ color: C.navy, fontSize: 15 }}>{fmt0(ch.onwayTotal)}</b>
                <span style={{ color: C.dim }}> ({ch.onway.length})</span>
              </span>
              {issueCount > 0
                ? <span style={{ fontSize: 13, color: C.muted }}>
                    Issues <b style={{ color: C.coral, fontSize: 15 }}>{issueCount}</b>
                    {ch.shortTotal < 0 && <span style={{ color: C.coral }}> ({fmt(ch.shortTotal)})</span>}
                  </span>
                : <span style={{ fontSize: 13, color: '#1a6e42', fontWeight: 600 }}>&#10003; No issues</span>}
              {ch.commissionDue > 0 && (
                <span style={{ fontSize: 12, color: '#7a4e10', marginLeft: 'auto' }}>
                  Commission to be invoiced: <b>{fmt(ch.commissionDue)}</b>
                </span>
              )}
            </div>

            {ch.issues.map((r, i) => rowLine(r, i))}
            {ch.bankIssues.map((t, i) => (
              <div key={'b' + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 20px', borderBottom: `1px solid ${C.surface2}`, fontSize: 13 }}>
                <span style={{ ...sBadge('#fdefd5', '#7a4e10'), width: 76, textAlign: 'center' }}>Bank?</span>
                <span style={{ fontWeight: 600, color: C.navyDeep, width: 190 }}>Unmatched payment</span>
                <span style={{ width: 110 }} />
                <span style={{ color: C.muted, fontSize: 12, width: 78 }}>{t.date}</span>
                <span style={{ color: C.dim, fontSize: 11.5, flex: 1 }}>In bank, no matching payout in the data (often prior-period)</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 84, textAlign: 'right' }}>{fmt(t.amount)}</span>
              </div>
            ))}

            {ch.onway.map((r, i) => rowLine(r, 1000 + i))}

            {ch.paid.length > 0 && (
              <div>
                <button
                  style={{ width: '100%', padding: '10px 20px', border: 'none', background: C.surface2, color: C.muted, fontSize: 12, fontWeight: 600, fontFamily: "'Outfit', sans-serif", cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => setShowPaid(p => ({ ...p, [ch.channel + activeMonth]: !showingPaid }))}>
                  {showingPaid ? '\u25BE Hide' : '\u25B8 Show'} {ch.paid.length} paid bookings ({fmt0(ch.received)})
                </button>
                {showingPaid && ch.paid.map((r, i) => rowLine(r, 2000 + i))}
              </div>
            )}

            {ch.issues.length === 0 && ch.bankIssues.length === 0 && ch.onway.length === 0 && ch.paid.length === 0 && (
              <div style={{ padding: '24px 20px', textAlign: 'center', color: C.dim, fontSize: 12.5 }}>No activity for {monthLabel(activeMonth)}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
