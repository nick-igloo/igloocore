import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Papa from 'papaparse';
import JSZip from 'jszip';
import {
  getProperties,
  setPropertyWelcomePackSize,
  getSettlementConfig,
  updateSettlementConfig,
  invalidatePropertiesCache,
  Property,
  WelcomePackSize,
} from '../lib/properties';
import ReconciliationTab from './ReconciliationTab';
import LiveReconciliationTab from './LiveReconciliationTab';
import {
  BookingRecord, norm, cleanNum, parseDMY as parseDate, fmt,
  findHeader, resolve, escCsv, toCsv, dlBlob, dlCsv, MONTH_NAMES as MONTHS,
} from '../lib/csv';
import {
  C, sCard, sCardInner, sBand, sBadge, sLabel, sBtn, sBtnPrimary, sBtnGreen,
  sBtnAmber, sBtnGhost, sBtnSmall, sIconBox, sStatValue, sInput, sPageContainer,
} from '../lib/brand';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface CleanConfigItem {
  id: number;
  property: string;
  patterns: string[];
  cleaner: string;
  price: number;
}

interface CleanResult {
  property: string;
  cleaner: string;
  price: number;
  count: number;
  total: number;
}

interface WelcomeResult {
  property: string;
  size: 'Small' | 'Large';
  price: number;
  count: number;
  total: number;
}

// ─── DEFAULT CONFIGURATION ───────────────────────────────────────────────────

const DEFAULT_CLEANS: Omit<CleanConfigItem, 'id'>[] = [
  { property: "10 Bynack", patterns: ["10 bynack"], cleaner: "Andrea", price: 70 },
  { property: "26 Ben Avon", patterns: ["26 ben avon"], cleaner: "Andrea", price: 70 },
  { property: "31 Caledonia Place", patterns: ["31 caledonia"], cleaner: "Andrea", price: 110 },
  { property: "4 Ben Avon", patterns: ["4 ben avon"], cleaner: "Andrea", price: 70 },
  { property: "4 Bynack", patterns: ["4 bynack"], cleaner: "Andrea", price: 70 },
  { property: "Alpine View", patterns: ["alpine view"], cleaner: "Andrea", price: 110 },
  { property: "Burnside Pines", patterns: ["burnside pines"], cleaner: "Andrea", price: 95 },
  { property: "Casa Amor", patterns: ["casa amor"], cleaner: "Andrea", price: 85 },
  { property: "Balnagowan Cottage", patterns: ["balnagowan cottage"], cleaner: "AVM", price: 156 },
  { property: "Braeside", patterns: ["braeside"], cleaner: "Lara", price: 170 },
  { property: "Dalfern Lodge", patterns: ["dalfern lodge"], cleaner: "Tegan", price: 140 },
  { property: "Dalnaglar", patterns: ["dalnaglar"], cleaner: "AVM", price: 156 },
  { property: "Eagle Lodge", patterns: ["eagle lodge"], cleaner: "Tegan", price: 120 },
  { property: "Killiechangie", patterns: ["killiechangie"], cleaner: "Emma McRae", price: 150 },
  { property: "Lairig Ghru Lodge", patterns: ["lairig ghru"], cleaner: "AVM", price: 168 },
  { property: "Longfield", patterns: ["longfield"], cleaner: "Alanah", price: 121 },
  { property: "Schoolhouse", patterns: ["schoolhouse"], cleaner: "Emma McRae", price: 150 },
  { property: "The Eagles Nest", patterns: ["eagles nest"], cleaner: "Andrea", price: 300 },
  { property: "The Maltings", patterns: ["maltings"], cleaner: "Emma V", price: 170 },
  { property: "Torr Beatha", patterns: ["torr beatha"], cleaner: "AVM", price: 120 },
  { property: "Woodland House", patterns: ["woodland house"], cleaner: "Emma V", price: 150 },
];

const DEFAULT_WELCOME_SMALL = [
  "10 Bynack", "26 Ben Avon", "31 Caledonia Place", "4 Ben Avon", "4 Bynack",
  "Alpine View", "Burnside Pines", "Casa Amor", "Longfield", "Pine Marten Cottage",
  "Snowmass Lodge", "Torr Beatha", "Woodhaus", "Taigh Mathair",
];

const DEFAULT_WELCOME_LARGE = [
  "Balbeag Cottage", "Balnagowan Cottage", "Braeside", "Dalfern Lodge", "Dalnaglar",
  "Eagle Lodge", "Killiechangie", "Lairig Ghru Lodge", "Loramore",
  "Schoolhouse", "The Bellhouse", "The Eagles Nest",
  "The Maltings", "The Shieling", "Woodland House",
];

const DEFAULT_NO_WELCOME = [
  "18 Dalfaber", "Fraser Cottage", "Telford Cottage", "Druim an Lochain Cottage",
  "Birchview", "Apartment Puerto Pollensa", "Carriden",
];

const DEFAULT_SPECIAL_RULES: Record<string, string> = { killiechangie: "ignore_owner_cleans" };

// ─── PAGE HELPERS ────────────────────────────────────────────────────────────

function findCleanConfig(prop: string, configs: CleanConfigItem[]): { cleaner: string; price: number } | null {
  const n = norm(prop);
  for (const cfg of configs) {
    if (cfg.patterns.some(p => n.includes(p))) return { cleaner: cfg.cleaner, price: cfg.price };
  }
  return null;
}

function findWelcomeConfig(
  prop: string, small: string[], large: string[], no: string[], sp: number, lp: number
): { size: 'Small' | 'Large'; price: number } | null {
  const n = norm(prop);
  if (no.some(p => n.includes(norm(p)))) return null;
  if (large.some(p => n.includes(norm(p)) || norm(p).includes(n))) return { size: 'Large', price: lp };
  if (small.some(p => n.includes(norm(p)) || norm(p).includes(n))) return { size: 'Small', price: sp };
  return null;
}

function hasSpecialRule(prop: string, rules: Record<string, string>, rule: string): boolean {
  const n = norm(prop);
  return Object.entries(rules).some(([k, v]) => n.includes(k) && v === rule);
}

function isOwner(status: string): boolean { return norm(status).includes('owner'); }
function isPaidOrConfirmed(status: string): boolean { const s = norm(status); return s === 'paid' || s === 'confirmed'; }

function getMonths(bookings: BookingRecord[]): string[] {
  const s = new Set<string>();
  bookings.forEach(b => {
    const d = parseDate(b['Check-out date']);
    if (d) s.add(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
  });
  return [...s].sort();
}

const ORDERED_COLS = [
  'Date', 'Booking number', 'Portal / Agent', 'Property name',
  'Check-in date', 'Check-out date', 'Guest: Name', 'Guest: Last names',
  'Paid', 'Portal/Intermediary Commission: calculated commission',
];

// ─── COMPONENT ───────────────────────────────────────────────────────────────

function BookingProcessor() {
  const [all, setAll] = useState<BookingRecord[]>([]);
  const [month, setMonth] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [fname, setFname] = useState('');
  const [showConfig, setShowConfig] = useState(false);
  const [configTab, setConfigTab] = useState('cleans');
  const [view, setView] = useState<'processor' | 'recon' | 'live'>('processor');
  const fileRef = useRef<HTMLInputElement>(null);
  const [sotLoaded, setSotLoaded] = useState<null | number>(null);

  // Single source of truth: on mount, pull the full Avantio rows synced by
  // n8n (property_bookings_cache.raw carries the complete export row).
  // A manually dropped CSV still overrides for ad-hoc analysis.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('property_bookings_cache')
        .select('raw')
        .not('raw', 'is', null);
      if (cancelled || error || !data?.length) return;
      const bookings = (data as any[]).map(d => d.raw as BookingRecord)
        .filter(b => b && b['Booking number']);
      if (!bookings.length) return;
      setAll(bookings);
      setFname('Synced from Avantio feed');
      setSotLoaded(bookings.length);
      const ms = getMonths(bookings);
      if (ms.length) setMonth(ms[0]);
    })();
    return () => { cancelled = true; };
  }, []);

  // Config state
  const [cleanConfigs, setCleanConfigs] = useState<CleanConfigItem[]>(
    DEFAULT_CLEANS.map((c, i) => ({ ...c, id: i }))
  );
  const [welcomeSmall, setWelcomeSmall] = useState<string[]>([]);
  const [welcomeLarge, setWelcomeLarge] = useState<string[]>([]);
  const [noWelcome, setNoWelcome] = useState<string[]>([]);
  const [smallPrice, setSmallPrice] = useState(12);
  const [largePrice, setLargePrice] = useState(18);
  const [propertyIndex, setPropertyIndex] = useState<Property[]>([]);
  const [specialRules, setSpecialRules] = useState({ ...DEFAULT_SPECIAL_RULES });
  const [nextId, setNextId] = useState(DEFAULT_CLEANS.length);

  // Form state
  const [newCleanProp, setNewCleanProp] = useState('');
  const [newCleanPattern, setNewCleanPattern] = useState('');
  const [newCleanCleaner, setNewCleanCleaner] = useState('');
  const [newCleanPrice, setNewCleanPrice] = useState('');
  const [newWelcomeProp, setNewWelcomeProp] = useState('');

  useEffect(() => {
    (async () => {
      try {
        invalidatePropertiesCache();
        const [props, cfg] = await Promise.all([getProperties(false), getSettlementConfig()]);
        setPropertyIndex(props);
        setWelcomeSmall(props.filter(p => p.welcome_pack_size === 'small').map(p => p.name).sort());
        setWelcomeLarge(props.filter(p => p.welcome_pack_size === 'large').map(p => p.name).sort());
        setNoWelcome(
          props
            .filter(p => p.welcome_pack_size === 'none' && DEFAULT_NO_WELCOME.some(n => norm(p.name).includes(norm(n)) || norm(n).includes(norm(p.name))))
            .map(p => p.name)
            .sort()
        );
        setSmallPrice(cfg.small_price);
        setLargePrice(cfg.large_price);

        const dbCleans: CleanConfigItem[] = props
          .filter(p => p.clean_price != null && (p.cleaner_name || '').trim().length > 0)
          .map((p, i) => ({
            id: i,
            property: p.name,
            patterns: (p.match_patterns && p.match_patterns.length ? p.match_patterns : [norm(p.name)]),
            cleaner: p.cleaner_name,
            price: Number(p.clean_price),
          }));
        if (dbCleans.length > 0) {
          setCleanConfigs(dbCleans);
          setNextId(dbCleans.length);
        }

        const dbRules: Record<string, string> = {};
        props.forEach(p => {
          if (p.special_rule && p.special_rule.trim()) {
            const key = (p.match_patterns && p.match_patterns[0]) || norm(p.name);
            dbRules[key] = p.special_rule;
          }
        });
        if (Object.keys(dbRules).length > 0) setSpecialRules(dbRules);
      } catch (e) {
        console.error('Failed to load welcome config from Supabase', e);
        setWelcomeSmall([...DEFAULT_WELCOME_SMALL]);
        setWelcomeLarge([...DEFAULT_WELCOME_LARGE]);
        setNoWelcome([...DEFAULT_NO_WELCOME]);
      }
    })();
  }, []);

  const persistWelcomeSize = useCallback(async (propertyName: string, size: WelcomePackSize) => {
    const n = norm(propertyName);
    const match = propertyIndex.find(p => norm(p.name) === n) ||
      propertyIndex.find(p => norm(p.name).includes(n) || n.includes(norm(p.name)));
    if (!match) {
      console.warn(`[Welcome] no property match for "${propertyName}" — not persisted`);
      return;
    }
    try {
      await setPropertyWelcomePackSize(match.id, size);
      setPropertyIndex(prev => prev.map(p => p.id === match.id ? { ...p, welcome_pack_size: size, has_welcome_pack: size !== 'none' } : p));
    } catch (e) {
      console.error('Failed to persist welcome pack size', e);
    }
  }, [propertyIndex]);

  const persistPrices = useCallback(async (next: { small_price?: number; large_price?: number }) => {
    try {
      await updateSettlementConfig({
        small_price: next.small_price ?? smallPrice,
        large_price: next.large_price ?? largePrice,
      });
    } catch (e) {
      console.error('Failed to save settlement prices', e);
    }
  }, [smallPrice, largePrice]);

  const load = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { setErr('Please upload a CSV file'); return; }
    setErr(null); setFname(file.name); setAll([]); setMonth('');
    const r = new FileReader();
    r.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = Papa.parse(text);
      const rows = parsed.data as string[][];
      const hi = findHeader(rows);
      if (hi === -1) { setErr('Could not find header row'); return; }
      const headers = rows[hi].map(h => (h || '').trim());
      const data = rows.slice(hi + 1).filter(r => r.some(c => c && c.trim()));
      const bookings: BookingRecord[] = data.map(row => {
        const o: BookingRecord = {};
        headers.forEach((h, i) => { o[h] = (row[i] || '').trim(); });
        return o;
      }).filter(b => b['Booking number']?.trim());
      setAll(bookings);
      const ms = getMonths(bookings);
      if (ms.length) setMonth(ms[0]);
    };
    r.readAsText(file);
  }, []);

  // Portal
  const byPortal = (match: string) => all.filter(b => norm(resolve(b, 'Portal / Agent')).includes(match));
  const bcBookings = byPortal('booking.com');
  const abBookings = byPortal('airbnb');

  const portalRows = (bookings: BookingRecord[]) => {
    return bookings.map(b => {
      const paid = cleanNum(resolve(b, 'Paid'));
      const comm = cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission'));
      return [...ORDERED_COLS.map(c => resolve(b, c)), (paid - comm).toFixed(2)];
    });
  };

  const portalCsv = (bookings: BookingRecord[]) => {
    const h = [...ORDERED_COLS, 'Expected'];
    const rows = portalRows(bookings);
    const tp = bookings.reduce((s, b) => s + cleanNum(resolve(b, 'Paid')), 0);
    const tc = bookings.reduce((s, b) => s + cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission')), 0);
    rows.push(['TOTALS', '', '', '', '', '', '', '', tp.toFixed(2), tc.toFixed(2), (tp - tc).toFixed(2)]);
    return toCsv(h, rows);
  };

  // Month
  const [yr, mo] = month ? month.split('-').map(Number) : [0, 0];
  const monthLabel = month ? MONTHS[mo - 1] + ' ' + yr : '';

  const departingInMonth = useCallback((filterFn?: (b: BookingRecord) => boolean) => {
    if (!month) return [];
    return all.filter(b => {
      const d = parseDate(b['Check-out date']);
      if (!d || d.getFullYear() !== yr || d.getMonth() + 1 !== mo) return false;
      return filterFn ? filterFn(b) : true;
    });
  }, [all, month, yr, mo]);

  // Cleans
  const cleans = useMemo((): CleanResult[] => {
    const deps = departingInMonth();
    const byProp: Record<string, BookingRecord[]> = {};
    deps.forEach(b => { const p = (b['Accommodation name'] || b['Property name'] || '').trim(); if (!byProp[p]) byProp[p] = []; byProp[p].push(b); });
    const results: CleanResult[] = [];
    const unmatchedProps: string[] = [];
    for (const [prop, bookings] of Object.entries(byProp)) {
      const cfg = findCleanConfig(prop, cleanConfigs);
      if (!cfg) {
        unmatchedProps.push(prop);
        continue;
      }
      const ignoreOwner = hasSpecialRule(prop, specialRules, 'ignore_owner_cleans');
      const list = ignoreOwner ? bookings.filter(b => !isOwner(b['Status'])) : bookings;
      if (!list.length) continue;
      results.push({ property: prop, cleaner: cfg.cleaner, price: cfg.price, count: list.length, total: list.length * cfg.price });
    }
    if (unmatchedProps.length > 0) {
      console.log('[Cleans Debug] Unmatched properties:', unmatchedProps);
      console.log('[Cleans Debug] Total departures:', deps.length);
      console.log('[Cleans Debug] Properties in byProp:', Object.keys(byProp));
    }
    results.sort((a, b) => a.cleaner.localeCompare(b.cleaner) || a.property.localeCompare(b.property));
    return results;
  }, [departingInMonth, cleanConfigs, specialRules]);

  const cleansCsvBuild = (data: CleanResult[]) => {
    const h = ['Property', 'Cleaner', 'Price Per Clean', 'Number of Cleans', 'Total'];
    const rows: any[][] = data.map(d => [d.property, d.cleaner, d.price.toFixed(2), d.count, d.total.toFixed(2)]);
    rows.push(['', '', '', 'TOTAL', data.reduce((s, d) => s + d.total, 0).toFixed(2)]);
    rows.push([]);
    rows.push(['Cleaner Summary', '', '', '', '']);
    const ct: Record<string, { count: number; total: number }> = {};
    data.forEach(d => { if (!ct[d.cleaner]) ct[d.cleaner] = { count: 0, total: 0 }; ct[d.cleaner].count += d.count; ct[d.cleaner].total += d.total; });
    for (const [c, v] of Object.entries(ct).sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push(['', c, '', v.count, v.total.toFixed(2)]);
    }
    return { headers: h, rows };
  };

  // Welcome
  const welcome = useMemo((): WelcomeResult[] => {
    const deps = departingInMonth(b => isPaidOrConfirmed(b['Status']));
    console.log('[Welcome Debug] Filtered departures:', deps.length, 'Total in month:', departingInMonth().length);
    console.log('[Welcome Debug] First 5 statuses:', departingInMonth().slice(0, 5).map(b => b['Status']));
    const byProp: Record<string, number> = {};
    deps.forEach(b => { const p = (b['Accommodation name'] || b['Property name'] || '').trim(); byProp[p] = (byProp[p] || 0) + 1; });
    const results: WelcomeResult[] = [];
    const unmatchedProps: string[] = [];
    for (const [prop, count] of Object.entries(byProp)) {
      const cfg = findWelcomeConfig(prop, welcomeSmall, welcomeLarge, noWelcome, smallPrice, largePrice);
      if (!cfg) {
        unmatchedProps.push(prop);
        continue;
      }
      results.push({ property: prop, size: cfg.size, price: cfg.price, count, total: count * cfg.price });
    }
    if (unmatchedProps.length > 0) {
      console.log('[Welcome Debug] Unmatched properties:', unmatchedProps);
    }
    results.sort((a, b) => a.size.localeCompare(b.size) || a.property.localeCompare(b.property));
    return results;
  }, [departingInMonth, welcomeSmall, welcomeLarge, noWelcome, smallPrice, largePrice]);

  const welcomeCsvBuild = (data: WelcomeResult[]) => {
    const h = ['Property', 'Size', 'Price Per Pack', 'Number of Packs', 'Total'];
    const rows: any[][] = data.map(d => [d.property, d.size, d.price.toFixed(2), d.count, d.total.toFixed(2)]);
    const gt = data.reduce((s, d) => s + d.total, 0);
    rows.push(['', '', '', 'TOTAL', gt.toFixed(2)]);
    rows.push([]);
    rows.push(['Summary', '', '', '', '']);
    const sc = data.filter(d => d.size === 'Small');
    const lc = data.filter(d => d.size === 'Large');
    const sn = sc.reduce((s, d) => s + d.count, 0);
    const ln = lc.reduce((s, d) => s + d.count, 0);
    rows.push(['', `Small (${sn})`, smallPrice, sn, sc.reduce((s, d) => s + d.total, 0).toFixed(2)]);
    rows.push(['', `Large (${ln})`, largePrice, ln, lc.reduce((s, d) => s + d.total, 0).toFixed(2)]);
    return { headers: h, rows };
  };

  // ZIP export (4 CSVs)
  const downloadZip = async () => {
    const zip = new JSZip();
    const bcHeaders = [...ORDERED_COLS, 'Expected'];
    const bcRows = portalRows(bcBookings);
    const tp1 = bcBookings.reduce((s, b) => s + cleanNum(resolve(b, 'Paid')), 0);
    const tc1 = bcBookings.reduce((s, b) => s + cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission')), 0);
    bcRows.push(['TOTALS', '', '', '', '', '', '', '', tp1.toFixed(2), tc1.toFixed(2), (tp1 - tc1).toFixed(2)]);
    zip.file('Booking.com.csv', toCsv(bcHeaders, bcRows));

    const abRows = portalRows(abBookings);
    const tp2 = abBookings.reduce((s, b) => s + cleanNum(resolve(b, 'Paid')), 0);
    const tc2 = abBookings.reduce((s, b) => s + cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission')), 0);
    abRows.push(['TOTALS', '', '', '', '', '', '', '', tp2.toFixed(2), tc2.toFixed(2), (tp2 - tc2).toFixed(2)]);
    zip.file('Airbnb.csv', toCsv(bcHeaders, abRows));

    const cd = cleansCsvBuild(cleans);
    zip.file('Cleans.csv', toCsv(cd.headers, cd.rows));

    const wd = welcomeCsvBuild(welcome);
    zip.file('Welcome Packs.csv', toCsv(wd.headers, wd.rows));

    const blob = await zip.generateAsync({ type: 'blob' });
    dlBlob(blob, `bookings_${monthLabel.replace(' ', '_')}.zip`);
  };

  // Computed
  const months = getMonths(all);
  const cleanTotal = cleans.reduce((s, d) => s + d.total, 0);
  const welcomeTotal = welcome.reduce((s, d) => s + d.total, 0);
  const cleanerTotals: Record<string, { count: number; total: number }> = {};
  cleans.forEach(d => { if (!cleanerTotals[d.cleaner]) cleanerTotals[d.cleaner] = { count: 0, total: 0 }; cleanerTotals[d.cleaner].count += d.count; cleanerTotals[d.cleaner].total += d.total; });

  const unmatched = useMemo(() => {
    if (!month) return [];
    const deps = departingInMonth();
    const props = [...new Set(deps.map(b => (b['Property name'] || '').trim()))];
    return props.filter(p => !findCleanConfig(p, cleanConfigs) && !findWelcomeConfig(p, welcomeSmall, welcomeLarge, noWelcome, smallPrice, largePrice) && !noWelcome.some(k => norm(p).includes(norm(k))));
  }, [departingInMonth, month, cleanConfigs, welcomeSmall, welcomeLarge, noWelcome, smallPrice, largePrice]);

  // Config handlers
  const updateClean = (id: number, field: string, value: string) => {
    setCleanConfigs(prev => prev.map(c => c.id === id ? {
      ...c,
      [field]: field === 'price' ? (parseFloat(value) || 0) : value,
      ...(field === 'property' ? { patterns: [norm(value)] } : {}),
    } : c));
  };
  const removeClean = (id: number) => setCleanConfigs(prev => prev.filter(c => c.id !== id));
  const addClean = () => {
    if (!newCleanProp.trim()) return;
    setCleanConfigs(prev => [...prev, { id: nextId, property: newCleanProp.trim(), patterns: [newCleanPattern.trim() || norm(newCleanProp)], cleaner: newCleanCleaner.trim(), price: parseFloat(newCleanPrice) || 0 }]);
    setNextId(n => n + 1);
    setNewCleanProp(''); setNewCleanPattern(''); setNewCleanCleaner(''); setNewCleanPrice('');
  };

  const sizeForList = (setList: React.Dispatch<React.SetStateAction<string[]>>): WelcomePackSize => {
    if (setList === setWelcomeSmall) return 'small';
    if (setList === setWelcomeLarge) return 'large';
    return 'none';
  };

  const removeWelcomeItem = (setList: React.Dispatch<React.SetStateAction<string[]>>, prop: string) => {
    setList(prev => prev.filter(p => p !== prop));
    const size = sizeForList(setList);
    if (size === 'small' || size === 'large') {
      void persistWelcomeSize(prop, 'none');
    }
  };

  const addWelcomeItem = (setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    const value = newWelcomeProp.trim();
    if (!value) return;
    setList(prev => [...prev, value]);
    setNewWelcomeProp('');
    void persistWelcomeSize(value, sizeForList(setList));
  };

  const allCleaners = [...new Set(cleanConfigs.map(c => c.cleaner).filter(Boolean))].sort();

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]); };

  return (
    <div style={{ color: C.navyDeep, fontFamily: "'Outfit', sans-serif", fontWeight: 400 }}>
      {/* ── CONFIG MODAL ── */}
      {showConfig && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,40,80,0.4)', zIndex: 100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowConfig(false); }}>
          <div style={{ background: C.surface, borderRadius: 12, width: '100%', maxWidth: 800, boxShadow: '0 8px 40px rgba(13,40,80,0.25)', maxHeight: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.3px' }}>Property Configuration</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <a
                  href="/settings#properties"
                  style={{ fontSize: 12, fontWeight: 600, color: C.blue, textDecoration: 'none', padding: '6px 10px', borderRadius: 6, background: C.bluePale }}
                >
                  Manage in Settings →
                </a>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: C.muted, padding: 4 }} onClick={() => setShowConfig(false)}>&times;</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, padding: '0 20px', flexShrink: 0 }}>
              {([['cleans', 'Cleans'], ['welcomeSmall', 'Welcome Small'], ['welcomeLarge', 'Welcome Large'], ['noWelcome', 'No Welcome'], ['special', 'Special Rules']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setConfigTab(key)} style={{ padding: '8px 16px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 600, color: configTab === key ? C.navy : C.dim, borderBottom: configTab === key ? `2px solid ${C.navy}` : '2px solid transparent', transition: 'all 0.15s' }}>{label}</button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
              {configTab === 'cleans' && (
                <div>
                  <div style={{ ...sLabel, marginBottom: 12 }}>CLEANING CONFIGURATION</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ ...sLabel, fontSize: 8.5 }}>PROPERTY</div>
                    <div style={{ ...sLabel, fontSize: 8.5 }}>MATCH PATTERN</div>
                    <div style={{ ...sLabel, fontSize: 8.5 }}>CLEANER</div>
                    <div style={{ ...sLabel, fontSize: 8.5 }}>PRICE</div>
                    <div></div>
                  </div>
                  {cleanConfigs.map(c => (
                    <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px 32px', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <input style={sInput} value={c.property} onChange={e => updateClean(c.id, 'property', e.target.value)} />
                      <input style={sInput} value={c.patterns.join(', ')} onChange={e => setCleanConfigs(prev => prev.map(x => x.id === c.id ? { ...x, patterns: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) } : x))} />
                      <input style={sInput} value={c.cleaner} onChange={e => updateClean(c.id, 'cleaner', e.target.value)} list="cleaners" />
                      <input style={{ ...sInput, textAlign: 'right' }} type="number" value={c.price} onChange={e => updateClean(c.id, 'price', e.target.value)} />
                      <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.coral, fontSize: 14, padding: 4, borderRadius: 4 }} onClick={() => removeClean(c.id)}>&times;</button>
                    </div>
                  ))}
                  <datalist id="cleaners">{allCleaners.map(c => <option key={c} value={c} />)}</datalist>
                  <div style={{ marginTop: 16, padding: 16, background: C.surface2, borderRadius: 8 }}>
                    <div style={{ ...sLabel, marginBottom: 10, fontSize: 9 }}>ADD NEW PROPERTY</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px 80px', gap: 8, marginBottom: 10 }}>
                      <input style={sInput} placeholder="Property name" value={newCleanProp} onChange={e => setNewCleanProp(e.target.value)} />
                      <input style={sInput} placeholder="Match pattern (auto)" value={newCleanPattern} onChange={e => setNewCleanPattern(e.target.value)} />
                      <input style={sInput} placeholder="Cleaner" value={newCleanCleaner} onChange={e => setNewCleanCleaner(e.target.value)} list="cleaners" />
                      <input style={{ ...sInput, textAlign: 'right' }} type="number" placeholder="\u00A3" value={newCleanPrice} onChange={e => setNewCleanPrice(e.target.value)} />
                    </div>
                    <button style={{ ...sBtnPrimary, padding: '7px 16px', fontSize: 12 }} onClick={addClean}>+ Add Property</button>
                  </div>
                </div>
              )}

              {configTab === 'welcomeSmall' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={sLabel}>WELCOME PACKS — SMALL</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>Price:</span>
                      <input style={{ ...sInput, width: 70, textAlign: 'right' }} type="number" value={smallPrice} onChange={e => { const v = parseFloat(e.target.value) || 0; setSmallPrice(v); void persistPrices({ small_price: v }); }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {welcomeSmall.map(p => (
                      <span key={p} style={{ ...sBadge('#d8f0e5', '#1a6e42'), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
                        {p}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#1a6e42', padding: 0 }} onClick={() => removeWelcomeItem(setWelcomeSmall, p)}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...sInput, maxWidth: 250 }} placeholder="Add property..." value={newWelcomeProp} onChange={e => setNewWelcomeProp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addWelcomeItem(setWelcomeSmall); }} />
                    <button style={{ ...sBtnPrimary, padding: '7px 16px', fontSize: 12 }} onClick={() => addWelcomeItem(setWelcomeSmall)}>+ Add</button>
                  </div>
                </div>
              )}

              {configTab === 'welcomeLarge' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={sLabel}>WELCOME PACKS — LARGE</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: C.muted }}>Price:</span>
                      <input style={{ ...sInput, width: 70, textAlign: 'right' }} type="number" value={largePrice} onChange={e => { const v = parseFloat(e.target.value) || 0; setLargePrice(v); void persistPrices({ large_price: v }); }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {welcomeLarge.map(p => (
                      <span key={p} style={{ ...sBadge('#fdefd5', '#7a4e10'), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
                        {p}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#7a4e10', padding: 0 }} onClick={() => removeWelcomeItem(setWelcomeLarge, p)}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...sInput, maxWidth: 250 }} placeholder="Add property..." value={newWelcomeProp} onChange={e => setNewWelcomeProp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addWelcomeItem(setWelcomeLarge); }} />
                    <button style={{ ...sBtnPrimary, padding: '7px 16px', fontSize: 12 }} onClick={() => addWelcomeItem(setWelcomeLarge)}>+ Add</button>
                  </div>
                </div>
              )}

              {configTab === 'noWelcome' && (
                <div>
                  <div style={{ ...sLabel, marginBottom: 12 }}>EXCLUDED FROM WELCOME PACKS</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                    {noWelcome.map(p => (
                      <span key={p} style={{ ...sBadge(C.surface2, C.muted), display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', border: `1px solid ${C.border}` }}>
                        {p}
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.coral, fontSize: 12, padding: 0 }} onClick={() => removeWelcomeItem(setNoWelcome, p)}>&times;</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input style={{ ...sInput, maxWidth: 250 }} placeholder="Add property to exclude..." value={newWelcomeProp} onChange={e => setNewWelcomeProp(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addWelcomeItem(setNoWelcome); }} />
                    <button style={{ ...sBtnPrimary, padding: '7px 16px', fontSize: 12 }} onClick={() => addWelcomeItem(setNoWelcome)}>+ Add</button>
                  </div>
                </div>
              )}

              {configTab === 'special' && (
                <div>
                  <div style={{ ...sLabel, marginBottom: 12 }}>SPECIAL RULES</div>
                  <div style={{ background: C.surface2, borderRadius: 8, padding: 16, fontSize: 13, color: C.muted }}>
                    {Object.entries(specialRules).map(([prop, rule]) => (
                      <div key={prop} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                        <div><span style={{ fontWeight: 600, color: C.navyDeep, textTransform: 'capitalize' }}>{prop}</span> — {rule === 'ignore_owner_cleans' ? 'Owner stays excluded from clean count' : rule}</div>
                        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.coral, fontSize: 14, padding: 4 }} onClick={() => setSpecialRules(prev => { const n = { ...prev }; delete n[prop]; return n; })}>&times;</button>
                      </div>
                    ))}
                    {Object.keys(specialRules).length === 0 && <div style={{ color: C.dim }}>No special rules configured.</div>}
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button style={sBtnPrimary} onClick={() => setShowConfig(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div style={sPageContainer}>
        {/* view tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <button
            style={view === 'processor' ? { ...sBtn, background: C.navy, color: '#fff' } : sBtnGhost}
            onClick={() => setView('processor')}>
            Processor
          </button>
          <button
            style={view === 'recon' ? { ...sBtn, background: C.navy, color: '#fff' } : sBtnGhost}
            onClick={() => setView('recon')}>
            Manual Reconciliation
          </button>
          <button
            style={view === 'live' ? { ...sBtn, background: C.navy, color: '#fff' } : sBtnGhost}
            onClick={() => setView('live')}>
            Live Reconciliation
          </button>
          <div style={{ marginLeft: 'auto' }}>
            <button style={sBtnGhost} onClick={() => setShowConfig(true)}>&#9881; Config</button>
          </div>
        </div>
        {view === 'live' ? (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.5px', marginBottom: 4 }}>Live Reconciliation</h1>
              <p style={{ color: C.muted, fontSize: 13 }}>Fed automatically by n8n — Booking.com report emails, Airbnb payout emails, Monzo sheet</p>
            </div>
            <LiveReconciliationTab bookings={all} />
          </div>
        ) : view === 'recon' ? (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.5px', marginBottom: 4 }}>Manual Reconciliation</h1>
              <p style={{ color: C.muted, fontSize: 13 }}>Match Airbnb and Booking.com payouts against expected values and the Monzo statement</p>
            </div>
            <ReconciliationTab bookings={all} />
          </div>
        ) : (
        <div>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.5px', marginBottom: 4 }}>Booking Processor</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>Upload booking CSV to split by portal, generate cleans and welcome pack schedules</p>
        </div>

        {/* Upload */}
        {all.length === 0 && (
          <div
            style={{ border: `2px dashed ${drag ? C.blue : C.border}`, borderRadius: 12, padding: '56px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: drag ? '#e8f2fc' : C.surface }}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={e => { e.preventDefault(); setDrag(false); }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) load(e.target.files[0]); }} />
            <div style={{ ...sIconBox(C.bluePale), margin: '0 auto 16px', fontSize: 20 }}>&#8593;</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>Drop booking CSV here</div>
            <div style={{ color: C.dim, fontSize: 12.5 }}>or click to browse files</div>
          </div>
        )}

        {err && <div style={{ ...sCard, ...sBand(C.coral), ...sCardInner, marginBottom: 16 }}><span style={{ color: C.coral, fontSize: 13, fontWeight: 500 }}>{err}</span></div>}

        {all.length > 0 && (
          <div>
            {/* File bar */}
            <div style={{ ...sCard, ...sCardInner, ...sBand(C.green), marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={sIconBox('#d8f0e5')}>&#10003;</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fname}</div>
                  <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{all.length} bookings &middot; {bcBookings.length} Booking.com &middot; {abBookings.length} Airbnb &middot; {all.length - bcBookings.length - abBookings.length} other/direct</div>
                </div>
              </div>
              <button style={sBtnGhost} onClick={() => { setAll([]); setFname(''); setMonth(''); }}>&times; Clear</button>
            </div>

            {/* TASK 1 */}
            <div style={{ marginBottom: 32 }}>
              <div style={{ ...sLabel, marginBottom: 12 }}>PORTAL BOOKING SPLIT</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Booking.com', data: bcBookings, accent: C.blue, badgeBg: C.bluePale, badgeFg: C.navy, file: 'booking_com.csv' },
                  { label: 'Airbnb', data: abBookings, accent: C.coral, badgeBg: '#fde0d8', badgeFg: '#9a2a1a', file: 'airbnb.csv' },
                ].map(p => {
                  const paid = p.data.reduce((s, b) => s + cleanNum(resolve(b, 'Paid')), 0);
                  const comm = p.data.reduce((s, b) => s + cleanNum(resolve(b, 'Portal/Intermediary Commission: calculated commission')), 0);
                  return (
                    <div key={p.label} style={{ ...sCard, ...sBand(p.accent) }}>
                      <div style={sCardInner}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <span style={sBadge(p.badgeBg, p.badgeFg)}>{p.label}</span>
                          <span style={{ ...sStatValue, fontSize: 22 }}>{p.data.length}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                          {([['Paid', paid, C.navyDeep], ['Commission', comm, C.muted], ['Expected', paid - comm, C.green]] as [string, number, string][]).map(([l, v, c]) => (
                            <div key={l}><div style={{ fontSize: 10, color: C.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: c }}>{fmt(v)}</div></div>
                          ))}
                        </div>
                        <button style={{ ...sBtnPrimary, width: '100%', justifyContent: 'center' }} onClick={() => dlCsv(portalCsv(p.data), p.file)} disabled={!p.data.length}>&#8595; Download CSV</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TASK 2 */}
            <div>
              <div style={{ ...sLabel, marginBottom: 12 }}>CLEANS &amp; WELCOME PACKS</div>

              <div style={{ ...sCard, ...sCardInner, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ ...sLabel, margin: 0 }}>DEPARTURE MONTH</span>
                <select value={month} onChange={e => setMonth(e.target.value)}>
                  {months.map(m => { const [y, mo] = m.split('-').map(Number); return <option key={m} value={m}>{MONTHS[mo - 1]} {y}</option>; })}
                </select>
                {monthLabel && <span style={sBadge(C.bluePale, C.navy)}>{monthLabel}</span>}
                <span style={{ color: C.dim, fontSize: 12 }}>{departingInMonth().length} departures</span>
                <div style={{ marginLeft: 'auto' }}>
                  <button style={{ ...sBtnPrimary, background: C.blue }} onClick={downloadZip} disabled={!all.length}>
                    &#128196; Download All (.zip)
                  </button>
                </div>
              </div>

              {/* Summary cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                {/* Cleans */}
                <div style={{ ...sCard, ...sBand(C.green) }}>
                  <div style={sCardInner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={sIconBox('#d8f0e5')}>&#128471;</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>Cleans</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 1 }}>{cleans.length} properties &middot; {cleans.reduce((s, d) => s + d.count, 0)} cleans</div>
                        </div>
                      </div>
                      <div style={sStatValue}>{fmt(cleanTotal)}</div>
                    </div>
                    <div style={{ background: C.surface2, borderRadius: 8, padding: 12, marginBottom: 14 }}>
                      <div style={{ ...sLabel, marginBottom: 8, fontSize: 9 }}>CLEANER BREAKDOWN</div>
                      {Object.entries(cleanerTotals).sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => (
                        <div key={c} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5 }}>
                          <span style={{ fontWeight: 500 }}>{c} <span style={{ color: C.dim }}>({v.count})</span></span>
                          <span style={{ fontWeight: 600 }}>{fmt(v.total)}</span>
                        </div>
                      ))}
                    </div>
                    <button style={{ ...sBtnGreen, width: '100%', justifyContent: 'center' }} onClick={() => { const d = cleansCsvBuild(cleans); dlCsv(toCsv(d.headers, d.rows), `cleans_${monthLabel.replace(' ', '_')}.csv`); }} disabled={!cleans.length}>&#8595; Cleans CSV</button>
                  </div>
                </div>

                {/* Welcome */}
                <div style={{ ...sCard, ...sBand(C.amber) }}>
                  <div style={sCardInner}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={sIconBox('#fdefd5')}>&#127873;</div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.3px' }}>Welcome Packs</div>
                          <div style={{ color: C.muted, fontSize: 11.5, marginTop: 1 }}>{welcome.length} properties &middot; {welcome.reduce((s, d) => s + d.count, 0)} packs</div>
                        </div>
                      </div>
                      <div style={sStatValue}>{fmt(welcomeTotal)}</div>
                    </div>
                    <div style={{ background: C.surface2, borderRadius: 8, padding: 12, marginBottom: 14 }}>
                      <div style={{ ...sLabel, marginBottom: 8, fontSize: 9 }}>SIZE BREAKDOWN</div>
                      {([['Small', welcome.filter(d => d.size === 'Small'), smallPrice], ['Large', welcome.filter(d => d.size === 'Large'), largePrice]] as [string, WelcomeResult[], number][]).map(([label, items, price]) => (
                        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12.5 }}>
                          <span style={{ fontWeight: 500 }}>{label} <span style={{ color: C.dim }}>({items.reduce((s, d) => s + d.count, 0)} &times; &pound;{price})</span></span>
                          <span style={{ fontWeight: 600 }}>{fmt(items.reduce((s, d) => s + d.total, 0))}</span>
                        </div>
                      ))}
                    </div>
                    <button style={{ ...sBtnAmber, width: '100%', justifyContent: 'center' }} onClick={() => { const d = welcomeCsvBuild(welcome); dlCsv(toCsv(d.headers, d.rows), `welcome_packs_${monthLabel.replace(' ', '_')}.csv`); }} disabled={!welcome.length}>&#8595; Welcome CSV</button>
                  </div>
                </div>
              </div>

              {/* Cleans table */}
              {cleans.length > 0 && (
                <div style={{ ...sCard, marginBottom: 12 }}>
                  <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fcff' }}>
                    <div>
                      <span style={{ ...sLabel, margin: 0 }}>Cleans Detail</span>
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: 10 }}>{monthLabel}</span>
                    </div>
                    <span style={{ ...sBadge('#d8f0e5', '#1a6e42'), fontSize: 11, padding: '4px 10px' }}>{cleans.reduce((s, d) => s + d.count, 0)} cleans</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif", fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ background: C.surface2 }}>
                          <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap' }}>Property</th>
                          <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Cleaner</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Per Clean</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Cleans</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cleans.map((d, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? C.surface : '#fafcff', borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '12px 24px', fontWeight: 600, color: C.navyDeep }}>{d.property}</td>
                            <td style={{ padding: '12px 24px' }}><span style={{ ...sBadge(C.bluePale, C.navy), fontSize: 11.5, padding: '4px 10px' }}>{d.cleaner}</span></td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', color: C.muted }}>{fmt(d.price)}</td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: C.navy }}>{d.count}</td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: C.navyDeep }}>{fmt(d.total)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: C.surface2, borderTop: `2px solid ${C.border}` }}>
                          <td colSpan={3} style={{ padding: '12px 24px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>Total</td>
                          <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: C.navyDeep }}>{cleans.reduce((s, d) => s + d.count, 0)}</td>
                          <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: C.navyDeep }}>{fmt(cleanTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Welcome table */}
              {welcome.length > 0 && (
                <div style={{ ...sCard, marginBottom: 12 }}>
                  <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fffdf8' }}>
                    <div>
                      <span style={{ ...sLabel, margin: 0 }}>Welcome Packs Detail</span>
                      <span style={{ fontSize: 11, color: C.muted, marginLeft: 10 }}>{monthLabel}</span>
                    </div>
                    <span style={{ ...sBadge('#fdefd5', '#7a4e10'), fontSize: 11, padding: '4px 10px' }}>{welcome.reduce((s, d) => s + d.count, 0)} packs</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: "'Outfit', sans-serif", fontSize: 13.5 }}>
                      <thead>
                        <tr style={{ background: C.surface2 }}>
                          <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}`, whiteSpace: 'nowrap' }}>Property</th>
                          <th style={{ padding: '10px 24px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Size</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Per Pack</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Packs</th>
                          <th style={{ padding: '10px 24px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {welcome.map((d, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? C.surface : '#fffdf8', borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '12px 24px', fontWeight: 600, color: C.navyDeep }}>{d.property}</td>
                            <td style={{ padding: '12px 24px' }}><span style={{ ...sBadge(d.size === 'Small' ? '#d8f0e5' : '#fdefd5', d.size === 'Small' ? '#1a6e42' : '#7a4e10'), fontSize: 11.5, padding: '4px 10px' }}>{d.size}</span></td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', color: C.muted }}>{fmt(d.price)}</td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: C.navy }}>{d.count}</td>
                            <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 700, color: C.navyDeep }}>{fmt(d.total)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: C.surface2, borderTop: `2px solid ${C.border}` }}>
                          <td colSpan={3} style={{ padding: '12px 24px', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.8px', color: C.muted }}>Total</td>
                          <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: C.navyDeep }}>{welcome.reduce((s, d) => s + d.count, 0)}</td>
                          <td style={{ padding: '12px 24px', textAlign: 'right', fontWeight: 800, fontSize: 15, color: C.navyDeep }}>{fmt(welcomeTotal)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unmatched */}
              {unmatched.length > 0 && (
                <div style={{ ...sCard, ...sBand(C.amber) }}>
                  <div style={sCardInner}>
                    <div style={{ ...sLabel, marginBottom: 8, color: C.amber }}>UNMATCHED PROPERTIES ({unmatched.length})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {unmatched.map((p, i) => <span key={i} style={sBadge('#fdefd5', '#7a4e10')}>{p}</span>)}
                    </div>
                    <div style={{ fontSize: 11, color: C.dim }}>Departures in {monthLabel} not assigned to any config. Open Config to add them.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>
        )}
      </div>
    </div>
  );
}

export default BookingProcessor;
