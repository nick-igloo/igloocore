// ═══════════════════════════════════════════════════════════════════
// src/lib/csv.ts — shared CSV, number, date & download utilities
// ═══════════════════════════════════════════════════════════════════

export interface BookingRecord { [key: string]: string; }

export function norm(s: string): string {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function cleanNum(v: string | number | undefined | null): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const s = String(v).trim();
  if (!s || s === '-') return 0;
  const n = parseFloat(s.replace(/[\u00A3$,\s%]/g, ''));
  return isNaN(n) ? 0 : n;
}

export const cleanNumericValue = cleanNum;

export function r2(n: number): number { return Math.round(n * 100) / 100; }

export function fmt(v: number): string {
  return '\u00A3' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmt0(v: number): string {
  return '\u00A3' + Math.round(v).toLocaleString('en-GB');
}

export function parseDMY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null;
}

export const parseDate = parseDMY;

export function parseMDY(s: string): Date | null {
  if (!s) return null;
  const p = s.trim().split('/');
  return p.length === 3 ? new Date(+p[2], +p[0] - 1, +p[1]) : null;
}

export function parseAny(x: string): Date | null {
  if (!x) return null;
  if (x.includes('-')) {
    const p = x.split('-');
    return p.length === 3 ? new Date(+p[0], +p[1] - 1, +p[2]) : null;
  }
  return parseDMY(x);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d); x.setDate(x.getDate() + n); return x;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function monthKeyOf(d: Date | null): string {
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return MONTH_NAMES[m - 1] + ' ' + y;
}

export function findHeader(rows: string[][], marker = 'Booking number'): number {
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    if (rows[i].some(c => (c || '').includes(marker))) return i;
  }
  return -1;
}

export function resolve(b: BookingRecord, col: string): string {
  if (b[col] !== undefined) return b[col];
  const n = norm(col);
  for (const k of Object.keys(b)) { if (norm(k) === n) return b[k]; }
  if (col === 'Portal / Agent' && b['Portal/Agent']) return b['Portal/Agent'];
  if (col === 'Property name' && b['Accommodation name']) return b['Accommodation name'];
  return '';
}

export function escCsv(cell: unknown): string {
  const s = String(cell != null ? cell : '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(escCsv).join(','), ...rows.map(r => r.map(escCsv).join(','))].join('\n');
}

export function dlBlob(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

export function dlCsv(content: string, filename: string): void {
  dlBlob(new Blob([content], { type: 'text/csv;charset=utf-8;' }), filename);
}
