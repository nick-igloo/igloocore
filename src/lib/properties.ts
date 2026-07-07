import { supabase } from './supabase';

export type WelcomePackSize = 'none' | 'small' | 'large';

export interface Property {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  has_welcome_pack: boolean;
  welcome_pack_size: WelcomePackSize;
  clean_price: number | null;
  cleaner_name: string;
  match_patterns: string[];
  special_rule: string;
  created_at: string;
  updated_at: string;
}

export interface PropertyOpsUpdate {
  name?: string;
  active?: boolean;
  welcome_pack_size?: WelcomePackSize;
  clean_price?: number | null;
  cleaner_name?: string;
  match_patterns?: string[];
  special_rule?: string;
  notes?: string;
}

export const updatePropertyOps = async (id: string, patch: PropertyOpsUpdate): Promise<void> => {
  const update: Record<string, unknown> = { ...patch, updated_at: new Date().toISOString() };
  if (patch.welcome_pack_size !== undefined) {
    update.has_welcome_pack = patch.welcome_pack_size !== 'none';
  }
  const { error } = await supabase.from('properties').update(update).eq('id', id);
  if (error) throw error;
  invalidatePropertiesCache();
};

export const setPropertyWelcomePackSize = async (
  id: string,
  size: WelcomePackSize
): Promise<void> => {
  const { error } = await supabase
    .from('properties')
    .update({
      welcome_pack_size: size,
      has_welcome_pack: size !== 'none',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
  invalidatePropertiesCache();
};

export interface SettlementConfig {
  small_price: number;
  large_price: number;
}

export const getSettlementConfig = async (): Promise<SettlementConfig> => {
  const { data, error } = await supabase
    .from('settlement_config')
    .select('small_price, large_price')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return {
    small_price: Number(data?.small_price ?? 12),
    large_price: Number(data?.large_price ?? 18),
  };
};

export const updateSettlementConfig = async (cfg: SettlementConfig): Promise<void> => {
  const { error } = await supabase
    .from('settlement_config')
    .update({
      small_price: cfg.small_price,
      large_price: cfg.large_price,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  if (error) throw error;
};

let cache: Property[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000;

export const getProperties = async (activeOnly = true): Promise<Property[]> => {
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    return activeOnly ? cache.filter(p => p.active) : cache;
  }

  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .order('name');

  if (error) throw error;

  cache = data || [];
  cacheTime = Date.now();

  return activeOnly ? cache.filter(p => p.active) : cache;
};

export const invalidatePropertiesCache = () => {
  cache = null;
  cacheTime = 0;
};

export const getPropertyNames = async (activeOnly = true): Promise<string[]> => {
  const props = await getProperties(activeOnly);
  return props.map(p => p.name);
};

export const findPropertyByName = (properties: Property[], name: string): Property | undefined => {
  const lower = name.toLowerCase();
  return properties.find(p => p.name.toLowerCase() === lower);
};
