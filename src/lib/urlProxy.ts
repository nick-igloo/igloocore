const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export function getProxiedUrl(supabaseUrl: string): string {
  if (!supabaseUrl.includes('supabase.co')) {
    return supabaseUrl;
  }

  const url = new URL(supabaseUrl);

  if (url.pathname.includes('/storage/v1/object/sign/reports/')) {
    const parts = url.pathname.split('/storage/v1/object/sign/reports/');
    const filePath = parts[1];
    return `${SUPABASE_URL}/functions/v1/storage-proxy/${filePath}`;
  }

  if (url.pathname.includes('/storage/v1/object/public/reports/')) {
    const parts = url.pathname.split('/storage/v1/object/public/reports/');
    const filePath = parts[1];
    return `${SUPABASE_URL}/functions/v1/storage-proxy/${filePath}`;
  }

  return supabaseUrl;
}

export function isSupabaseUrl(url: string): boolean {
  return url.includes('supabase.co');
}
