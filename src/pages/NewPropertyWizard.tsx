import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, ChevronRight,
  CreditCard, Loader2, Package, Sparkles, User, Users, AlertCircle, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { invalidatePropertiesCache, type WelcomePackSize } from '../lib/properties';

type Step = 'property' | 'operations' | 'owner_bank' | 'owner_portal' | 'cleaner' | 'review';

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'property', label: 'Property', icon: Building2 },
  { key: 'operations', label: 'Operations', icon: Package },
  { key: 'owner_bank', label: 'Bank & Payments', icon: CreditCard },
  { key: 'owner_portal', label: 'Owner Portal', icon: User },
  { key: 'cleaner', label: 'Cleaner', icon: Sparkles },
  { key: 'review', label: 'Review', icon: CheckCircle2 },
];

interface OwnerBank {
  id: string;
  payee_name: string;
  sort_code: string;
  account_number: string;
  account_type: string;
  payment_reference_prefix: string;
}

interface OwnerRecord {
  id: string;
  email: string;
  full_name: string | null;
  approved_for_portal: boolean;
  approved_for_dac7: boolean;
}

interface CleanerRecord {
  id: string;
  full_name: string;
  active: boolean;
}

interface NewPropertyWizardProps {
  /** When true, renders without the full-page shell (sticky header, min-h-screen)
   *  for embedding inside another page's content area, e.g. a Settings tab. */
  embedded?: boolean;
  /** Called instead of navigate() for in-app links when embedded, so the host
   *  page can switch its own tab state rather than relying on a hash change
   *  the host may not be listening for. */
  onDone?: (target: 'properties') => void;
}

export default function NewPropertyWizard({ embedded = false, onDone }: NewPropertyWizardProps = {}) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('property');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  // Step 1: Property
  const [propName, setPropName] = useState('');
  const [propNotes, setPropNotes] = useState('');

  // Step 2: Operations
  const [cleanPrice, setCleanPrice] = useState('');
  const [welcomePackSize, setWelcomePackSize] = useState<WelcomePackSize>('small');
  const [matchPatterns, setMatchPatterns] = useState('');
  const [specialRule, setSpecialRule] = useState('');

  // Step 3: Owner bank
  const [ownerBanks, setOwnerBanks] = useState<OwnerBank[]>([]);
  const [selectedBankOwnerId, setSelectedBankOwnerId] = useState('');
  const [newBankMode, setNewBankMode] = useState(false);
  const [newBankPayee, setNewBankPayee] = useState('');
  const [newBankSort, setNewBankSort] = useState('');
  const [newBankAccount, setNewBankAccount] = useState('');
  const [newBankType, setNewBankType] = useState('Personal');
  const [newBankRef, setNewBankRef] = useState('igloo');

  // Step 4: Owner portal
  const [owners, setOwners] = useState<OwnerRecord[]>([]);
  const [selectedPortalOwnerId, setSelectedPortalOwnerId] = useState('');
  const [newOwnerMode, setNewOwnerMode] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [portalAccess, setPortalAccess] = useState(true);
  const [dac7Access, setDac7Access] = useState(false);

  // Step 5: Cleaner
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([]);
  const [selectedCleanerId, setSelectedCleanerId] = useState('');
  const [cleanerName, setCleanerName] = useState('');

  // Created property ID (set after step 1 save)
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null);

  useEffect(() => {
    loadReferenceData();
  }, []);

  const loadReferenceData = async () => {
    const [bankRes, ownerRes, cleanerRes] = await Promise.all([
      supabase.from('owner_bank_details').select('*').order('payee_name'),
      supabase.rpc('get_all_owners_for_admin'),
      supabase.from('cleaner_profiles').select('id, full_name, active').eq('active', true).order('full_name'),
    ]);
    if (bankRes.data) setOwnerBanks(bankRes.data);
    if (ownerRes.data) setOwners(ownerRes.data);
    if (cleanerRes.data) setCleaners(cleanerRes.data);
  };

  const stepIndex = STEPS.findIndex(s => s.key === step);

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) setStep(STEPS[nextIdx].key);
  };

  const goPrev = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setStep(STEPS[prevIdx].key);
  };

  const formatSortCode = (raw: string): string => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 6) return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
    return raw;
  };

  const handleCreateProperty = async () => {
    if (!propName.trim()) { setError('Property name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('properties')
        .insert({ name: propName.trim(), notes: propNotes.trim() })
        .select('id')
        .single();
      if (err) throw err;
      setCreatedPropertyId(data.id);
      invalidatePropertiesCache();
      goNext();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('unique') ? 'A property with that name already exists.' : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOperations = async () => {
    if (!createdPropertyId) return;
    setSaving(true);
    setError(null);
    try {
      const patterns = matchPatterns
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

      const { error: err } = await supabase
        .from('properties')
        .update({
          clean_price: cleanPrice ? Number(cleanPrice) : null,
          welcome_pack_size: welcomePackSize,
          has_welcome_pack: welcomePackSize !== 'none',
          match_patterns: patterns,
          special_rule: specialRule,
          cleaner_name: cleanerName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', createdPropertyId);
      if (err) throw err;
      invalidatePropertiesCache();
      goNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBankMapping = async () => {
    if (!createdPropertyId) return;
    setSaving(true);
    setError(null);
    try {
      let ownerId = selectedBankOwnerId;

      if (newBankMode && newBankPayee && newBankSort && newBankAccount) {
        const { data, error: err } = await supabase
          .from('owner_bank_details')
          .insert({
            payee_name: newBankPayee.trim(),
            sort_code: formatSortCode(newBankSort),
            account_number: newBankAccount.replace(/\D/g, ''),
            account_type: newBankType,
            payment_reference_prefix: newBankRef.trim() || 'igloo',
          })
          .select('id')
          .single();
        if (err) throw err;
        ownerId = data.id;
        setOwnerBanks(prev => [...prev, { id: data.id, payee_name: newBankPayee.trim(), sort_code: formatSortCode(newBankSort), account_number: newBankAccount.replace(/\D/g, ''), account_type: newBankType, payment_reference_prefix: newBankRef.trim() || 'igloo' }]);
        setSelectedBankOwnerId(data.id);
        setNewBankMode(false);
      }

      if (ownerId) {
        await supabase.from('property_owner_mapping').delete().eq('property_id', createdPropertyId);
        const { error: mapErr } = await supabase
          .from('property_owner_mapping')
          .insert({ property_id: createdPropertyId, property_name: propName.trim(), owner_id: ownerId });
        if (mapErr) throw mapErr;
      }

      goNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOwnerPortal = async () => {
    if (!createdPropertyId) return;
    setSaving(true);
    setError(null);
    try {
      let ownerId = selectedPortalOwnerId;

      if (newOwnerMode && newOwnerEmail.trim()) {
        const { data, error: err } = await supabase
          .from('owners')
          .insert({
            email: newOwnerEmail.trim().toLowerCase(),
            full_name: newOwnerName.trim() || null,
            approved_for_portal: portalAccess,
            approved_for_dac7: dac7Access,
          })
          .select('id')
          .single();
        if (err) throw err;
        ownerId = data.id;
        setOwners(prev => [...prev, { id: data.id, email: newOwnerEmail.trim().toLowerCase(), full_name: newOwnerName.trim() || null, approved_for_portal: portalAccess, approved_for_dac7: dac7Access }]);
        setSelectedPortalOwnerId(data.id);
        setNewOwnerMode(false);
      }

      if (ownerId) {
        const { error: linkErr } = await supabase
          .from('owner_properties')
          .insert({
            owner_id: ownerId,
            property_name: propName.trim(),
            display_name: propName.trim(),
          });
        if (linkErr && !linkErr.message?.includes('duplicate')) throw linkErr;
      }

      goNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCleaner = async () => {
    if (!createdPropertyId) return;
    setSaving(true);
    setError(null);
    try {
      if (selectedCleanerId) {
        const { error: err } = await supabase
          .from('cleaner_property_assignments')
          .insert({ cleaner_id: selectedCleanerId, property_id: createdPropertyId });
        if (err && !err.message?.includes('duplicate')) throw err;
      }
      goNext();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleFinish = () => {
    setCompleted(true);
  };

  if (completed) {
    const card = (
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Property onboarded</h2>
        <p className="text-sm text-slate-500 mt-2">
          <span className="font-semibold text-slate-700">{propName}</span> is now live across all systems — bookings, settlements, safety checks, and guest ready.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => (embedded && onDone ? onDone('properties') : navigate('/settings#properties'))}
            className="w-full px-4 py-3 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
          >
            View in Settings
          </button>
          <button
            onClick={() => {
              setCompleted(false);
              setStep('property');
              setCreatedPropertyId(null);
              setPropName('');
              setPropNotes('');
              setCleanPrice('');
              setWelcomePackSize('small');
              setMatchPatterns('');
              setSpecialRule('');
              setSelectedBankOwnerId('');
              setSelectedPortalOwnerId('');
              setSelectedCleanerId('');
              setCleanerName('');
              setNewBankMode(false);
              setNewOwnerMode(false);
            }}
            className="w-full px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
          >
            Add another property
          </button>
        </div>
      </div>
    );

    if (embedded) {
      return <div className="flex items-center justify-center py-16">{card}</div>;
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        {card}
      </div>
    );
  }

  return (
    <div className={embedded ? '' : 'min-h-screen bg-slate-50'}>
      {embedded ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-1 pb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
      ) : (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            <Link
              to="/settings#setup"
              className="text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg p-2 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">Onboard New Property</h1>
              <p className="text-xs text-slate-500">Step {stepIndex + 1} of {STEPS.length}</p>
            </div>
          </div>
        </header>
      )}

      {/* Step indicators */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-6">
        <nav className="flex items-center gap-1 overflow-x-auto pb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isCurrent = s.key === step;
            const isPast = i < stepIndex;
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (isPast || (i === 0)) setStep(s.key);
                }}
                disabled={!isPast && !isCurrent && i !== 0}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isCurrent
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isPast
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isPast ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-700 text-sm flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
          </div>
        )}

        {step === 'property' && (
          <StepCard
            title="Property Details"
            subtitle="The canonical name used across all systems. Must match your booking CSVs."
          >
            <div className="space-y-4">
              <Field label="Property name" required>
                <input
                  autoFocus
                  type="text"
                  value={propName}
                  onChange={e => setPropName(e.target.value)}
                  placeholder="e.g. Harbour View Cottage"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </Field>
              <Field label="Internal notes (optional)">
                <input
                  type="text"
                  value={propNotes}
                  onChange={e => setPropNotes(e.target.value)}
                  placeholder="Any admin notes..."
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </Field>
            </div>
            <StepFooter
              onNext={handleCreateProperty}
              nextLabel="Create property"
              saving={saving}
              canProceed={propName.trim().length > 0}
            />
          </StepCard>
        )}

        {step === 'operations' && (
          <StepCard
            title="Operations Config"
            subtitle="Pricing, cleaning, and booking processor settings for this property."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Cleaning price">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">£</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={cleanPrice}
                    onChange={e => setCleanPrice(e.target.value)}
                    placeholder="65"
                    className="w-full pl-8 pr-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </Field>
              <Field label="Welcome pack size">
                <select
                  value={welcomePackSize}
                  onChange={e => setWelcomePackSize(e.target.value as WelcomePackSize)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="none">None</option>
                  <option value="small">Small</option>
                  <option value="large">Large</option>
                </select>
              </Field>
              <Field label="Cleaner display name">
                <input
                  type="text"
                  value={cleanerName}
                  onChange={e => setCleanerName(e.target.value)}
                  placeholder="e.g. Andrea"
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </Field>
              <Field label="Special rule">
                <select
                  value={specialRule}
                  onChange={e => setSpecialRule(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  <option value="ignore_owner_cleans">Ignore owner cleans</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Field label="Match patterns (comma-separated CSV name variants)">
                  <input
                    type="text"
                    value={matchPatterns}
                    onChange={e => setMatchPatterns(e.target.value)}
                    placeholder="e.g. harbour view, harbour view cottage"
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-slate-400 mt-1.5">Lowercased substrings that match this property in booking CSVs</p>
                </Field>
              </div>
            </div>
            <StepFooter
              onNext={handleSaveOperations}
              onPrev={goPrev}
              saving={saving}
              canProceed
              skipLabel="Skip — configure later"
              onSkip={goNext}
            />
          </StepCard>
        )}

        {step === 'owner_bank' && (
          <StepCard
            title="Owner Bank Details & Mapping"
            subtitle="Link this property to an owner for settlement payments."
          >
            {!newBankMode ? (
              <div className="space-y-4">
                <Field label="Select existing owner">
                  <select
                    value={selectedBankOwnerId}
                    onChange={e => setSelectedBankOwnerId(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— Select owner —</option>
                    {ownerBanks.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.payee_name} ({o.sort_code} / {o.account_number})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">OR</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  onClick={() => setNewBankMode(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Users className="w-4 h-4" />
                  Add new owner bank details
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">New owner bank details</p>
                  <button onClick={() => setNewBankMode(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <Field label="Payee name" required>
                      <input
                        type="text"
                        value={newBankPayee}
                        onChange={e => setNewBankPayee(e.target.value)}
                        placeholder="John Smith"
                        className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </Field>
                  </div>
                  <Field label="Sort code" required>
                    <input
                      type="text"
                      value={newBankSort}
                      onChange={e => setNewBankSort(e.target.value)}
                      placeholder="00-00-00"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                  <Field label="Account number" required>
                    <input
                      type="text"
                      value={newBankAccount}
                      onChange={e => setNewBankAccount(e.target.value)}
                      placeholder="12345678"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                  <Field label="Account type">
                    <select
                      value={newBankType}
                      onChange={e => setNewBankType(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option>Personal</option>
                      <option>Business</option>
                    </select>
                  </Field>
                  <Field label="Payment ref prefix">
                    <input
                      type="text"
                      value={newBankRef}
                      onChange={e => setNewBankRef(e.target.value)}
                      placeholder="igloo"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                </div>
              </div>
            )}
            <StepFooter
              onNext={handleSaveBankMapping}
              onPrev={goPrev}
              saving={saving}
              canProceed={!!(selectedBankOwnerId || (newBankMode && newBankPayee && newBankSort && newBankAccount))}
              skipLabel="Skip — no bank details yet"
              onSkip={goNext}
            />
          </StepCard>
        )}

        {step === 'owner_portal' && (
          <StepCard
            title="Owner Portal Access"
            subtitle="Grant the property owner access to view their reports and documents."
          >
            {!newOwnerMode ? (
              <div className="space-y-4">
                <Field label="Select existing owner">
                  <select
                    value={selectedPortalOwnerId}
                    onChange={e => setSelectedPortalOwnerId(e.target.value)}
                    className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">— Select owner —</option>
                    {owners.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.full_name || o.email} ({o.email})
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs text-slate-400 font-medium">OR</span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                <button
                  onClick={() => setNewOwnerMode(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Add new owner
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700">New owner</p>
                  <button onClick={() => setNewOwnerMode(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Email" required>
                    <input
                      type="email"
                      value={newOwnerEmail}
                      onChange={e => setNewOwnerEmail(e.target.value)}
                      placeholder="owner@example.com"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                  <Field label="Full name">
                    <input
                      type="text"
                      value={newOwnerName}
                      onChange={e => setNewOwnerName(e.target.value)}
                      placeholder="John Smith"
                      className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                </div>
                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={portalAccess}
                      onChange={e => setPortalAccess(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Portal access
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dac7Access}
                      onChange={e => setDac7Access(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    DAC7 access
                  </label>
                </div>
              </div>
            )}
            <StepFooter
              onNext={handleSaveOwnerPortal}
              onPrev={goPrev}
              saving={saving}
              canProceed={!!(selectedPortalOwnerId || (newOwnerMode && newOwnerEmail.trim()))}
              skipLabel="Skip — set up later"
              onSkip={goNext}
            />
          </StepCard>
        )}

        {step === 'cleaner' && (
          <StepCard
            title="Assign Cleaner"
            subtitle="Assign a cleaner for turnover tasks and guest ready sessions."
          >
            <div className="space-y-4">
              <Field label="Select cleaner">
                <select
                  value={selectedCleanerId}
                  onChange={e => setSelectedCleanerId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">— Select cleaner —</option>
                  {cleaners.map(c => (
                    <option key={c.id} value={c.id}>{c.full_name}</option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-slate-400">
                Need to add a new cleaner? You can do that in{' '}
                <Link to="/cleaner-management" className="text-blue-600 hover:underline">Cleaner Management</Link>{' '}
                after completing onboarding.
              </p>
            </div>
            <StepFooter
              onNext={handleSaveCleaner}
              onPrev={goPrev}
              saving={saving}
              canProceed={!!selectedCleanerId}
              skipLabel="Skip — assign later"
              onSkip={goNext}
            />
          </StepCard>
        )}

        {step === 'review' && (
          <StepCard
            title="Review & Finish"
            subtitle="Summary of what was configured for this property."
          >
            <div className="space-y-3">
              <ReviewRow label="Property" value={propName} done />
              <ReviewRow label="Clean price" value={cleanPrice ? `£${cleanPrice}` : 'Not set'} done={!!cleanPrice} />
              <ReviewRow label="Welcome pack" value={welcomePackSize} done={welcomePackSize !== 'none'} />
              <ReviewRow label="Match patterns" value={matchPatterns || 'Not set'} done={!!matchPatterns} />
              <ReviewRow label="Bank mapping" value={selectedBankOwnerId ? ownerBanks.find(o => o.id === selectedBankOwnerId)?.payee_name || 'Mapped' : 'Not mapped'} done={!!selectedBankOwnerId} />
              <ReviewRow label="Owner portal" value={selectedPortalOwnerId ? owners.find(o => o.id === selectedPortalOwnerId)?.email || 'Linked' : 'Not linked'} done={!!selectedPortalOwnerId} />
              <ReviewRow label="Cleaner assigned" value={selectedCleanerId ? cleaners.find(c => c.id === selectedCleanerId)?.full_name || 'Assigned' : 'Not assigned'} done={!!selectedCleanerId} />
            </div>
            <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
              The property is already active and will appear in Daily Safety Checks, Guest Ready, and the Booking Processor automatically.
            </div>
            <StepFooter
              onNext={handleFinish}
              onPrev={goPrev}
              nextLabel="Complete onboarding"
              saving={false}
              canProceed
            />
          </StepCard>
        )}
      </main>
    </div>
  );
}

function StepCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      </div>
      <div className="px-6 py-5 space-y-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function StepFooter({
  onNext, onPrev, nextLabel, saving, canProceed, skipLabel, onSkip,
}: {
  onNext: () => void;
  onPrev?: () => void;
  nextLabel?: string;
  saving: boolean;
  canProceed: boolean;
  skipLabel?: string;
  onSkip?: () => void;
}) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-5">
      <div>
        {onPrev && (
          <button
            onClick={onPrev}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {skipLabel && onSkip && (
          <button
            onClick={onSkip}
            disabled={saving}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {skipLabel}
          </button>
        )}
        <button
          onClick={onNext}
          disabled={saving || !canProceed}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {nextLabel || 'Continue'}
          {!saving && <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function ReviewRow({ label, value, done }: { label: string; value: string; done: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-100">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
      )}
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide w-28 flex-shrink-0">{label}</span>
      <span className={`text-sm flex-1 truncate ${done ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>{value}</span>
    </div>
  );
}
