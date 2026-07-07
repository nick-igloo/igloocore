import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_BOOKINGS_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_BOOKINGS_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  console.warn('[bookingsSupabase] Missing VITE_BOOKINGS_SUPABASE_URL or VITE_BOOKINGS_SUPABASE_ANON_KEY');
}

export const bookingsSupabase = createClient(url ?? '', key ?? '', {
  auth: { persistSession: false, autoRefreshToken: false },
});

export interface RemoteBooking {
  id: string;
  property_name: string;
  customer_id: string | null;
  guest_name: string | null;
  arrival_date: string | null;
  check_out_date: string | null;
  status: string | null;
  source: string | null;
  customers?: { name: string | null; email: string | null; phone: string | null } | null;
}

export async function fetchRemoteBookings(): Promise<RemoteBooking[]> {
  const { data, error } = await bookingsSupabase
    .from('bookings')
    .select('id, property_name, customer_id, guest_name, arrival_date, check_out_date, status, source, customers(name,email,phone)')
    .order('check_out_date', { ascending: false })
    .limit(5000);
  if (error) {
    console.error('[bookingsSupabase] fetch error', error);
    return [];
  }
  return (data ?? []) as unknown as RemoteBooking[];
}
