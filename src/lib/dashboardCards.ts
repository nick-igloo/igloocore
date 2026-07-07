import * as Icons from 'lucide-react';
import { ClipboardList, FileText, ReceiptText, Zap, Sparkles, Users, AlertOctagon, Settings, Wallet, HardDrive } from 'lucide-react';
import type { ComponentType } from 'react';

export type CardColor = 'emerald' | 'blue' | 'amber' | 'orange' | 'teal' | 'red';

export interface QuickAccessCard {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  color: CardColor;
  category: string;
  url: string;
  external?: boolean;
}

export const quickAccessCards: QuickAccessCard[] = [
  {
    id: 'booking-processor',
    name: 'Booking Processor',
    description: 'Process monthly bookings, calculate cleans, welcome packs, and portal commissions',
    icon: Icons.Calendar,
    color: 'blue',
    category: 'Operations',
    url: '/booking-processor',
  },
  {
    id: 'owner-reports',
    name: 'Owner Property Reports',
    description: 'Generate booking reports and letters for owners',
    icon: FileText,
    color: 'emerald',
    category: 'Reports',
    url: '/reports',
  },
  {
    id: 'settlement-converter',
    name: 'Settlement to CSV',
    description: 'Upload PDF settlement statements to extract and export financial data',
    icon: ClipboardList,
    color: 'blue',
    category: 'Finance',
    url: '/settlement-converter',
  },
  {
    id: 'settlement-generator',
    name: 'Settlement Generator',
    description: 'Upload booking CSVs and generate owner settlement statements with commission breakdown',
    icon: ReceiptText,
    color: 'orange',
    category: 'Finance',
    url: '/settlement-generator',
  },
  {
    id: 'pat-testing',
    name: 'PAT Testing Tool',
    description: 'Log portable appliance test results with photos, generate reports and track compliance',
    icon: Zap,
    color: 'emerald',
    category: 'Safety',
    url: '/pat-testing',
  },
  {
    id: 'daily-safety',
    name: 'Daily Safety Checks',
    description: 'Log daily fire safety and legionella checks across every property in one tap',
    icon: Icons.ShieldCheck,
    color: 'red',
    category: 'Safety',
    url: '/daily-safety',
  },
  {
    id: 'turnover',
    name: 'Guest Ready',
    description: 'Mobile hub for cleaners and directors: safety checks, clean, welcome pack, tasks and issues — all in one place',
    icon: Sparkles,
    color: 'emerald',
    category: 'Operations',
    url: '/guest-ready',
  },
  {
    id: 'turnover-tasks',
    name: 'Tasks',
    description: 'Open tasks across properties — assign to cleaners, set due dates and complete with photo proof',
    icon: ClipboardList,
    color: 'teal',
    category: 'Operations',
    url: '/turnover/tasks',
  },
  {
    id: 'turnover-issues',
    name: 'Issues',
    description: 'Report faults with photos, log contractor status, email owner, mark resolved',
    icon: AlertOctagon,
    color: 'red',
    category: 'Operations',
    url: '/turnover/issues',
  },
  {
    id: 'director-expenses',
    name: 'Director Expenses',
    description: 'Log spend on the go, attach receipt photos, export a monthly CSV for bookkeeping',
    icon: Wallet,
    color: 'emerald',
    category: 'Finance',
    url: '/expenses',
  },
  {
    id: 'cleaner-management',
    name: 'Cleaner Management',
    description: 'Add cleaners and assign properties they are responsible for',
    icon: Users,
    color: 'blue',
    category: 'Team',
    url: '/cleaner-management',
  },
  {
    id: 'drive-sync',
    name: 'Drive Document Sync',
    description: 'Scan a Google Drive folder, auto-classify documents by property, and file them in one click',
    icon: HardDrive,
    color: 'teal',
    category: 'Automation',
    url: '/drive-sync',
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'Single source of truth for properties, owners, cleaners, bank details and pricing',
    icon: Settings,
    color: 'blue',
    category: 'Admin',
    url: '/settings',
  },
];

export const colorClasses: Record<CardColor, {
  bg: string; bgHover: string; text: string; border: string; badge: string;
}> = {
  emerald: {
    bg: 'bg-emerald-50', bgHover: 'group-hover:bg-emerald-100', text: 'text-emerald-600',
    border: 'hover:border-emerald-300', badge: 'bg-emerald-50 text-emerald-700',
  },
  blue: {
    bg: 'bg-blue-50', bgHover: 'group-hover:bg-blue-100', text: 'text-blue-700',
    border: 'hover:border-blue-300', badge: 'bg-blue-50 text-blue-700',
  },
  amber: {
    bg: 'bg-amber-50', bgHover: 'group-hover:bg-amber-100', text: 'text-amber-600',
    border: 'hover:border-amber-300', badge: 'bg-amber-50 text-amber-700',
  },
  orange: {
    bg: 'bg-orange-50', bgHover: 'group-hover:bg-orange-100', text: 'text-orange-600',
    border: 'hover:border-orange-300', badge: 'bg-orange-50 text-orange-700',
  },
  teal: {
    bg: 'bg-teal-50', bgHover: 'group-hover:bg-teal-100', text: 'text-teal-600',
    border: 'hover:border-teal-300', badge: 'bg-teal-50 text-teal-700',
  },
  red: {
    bg: 'bg-red-50', bgHover: 'group-hover:bg-red-100', text: 'text-red-600',
    border: 'hover:border-red-300', badge: 'bg-red-50 text-red-700',
  },
};

export interface DashboardPrefs {
  hidden_cards: string[];
  card_order: string[];
}

export function applyPrefs(cards: QuickAccessCard[], prefs: DashboardPrefs | null): QuickAccessCard[] {
  if (!prefs) return cards;
  const hidden = new Set(prefs.hidden_cards || []);
  const visible = cards.filter((c) => !hidden.has(c.id));
  const order = prefs.card_order || [];
  if (order.length === 0) return visible;
  const indexOf = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...visible].sort((a, b) => {
    const ia = indexOf(a.id);
    const ib = indexOf(b.id);
    if (ia !== ib) return ia - ib;
    return cards.indexOf(a) - cards.indexOf(b);
  });
}
