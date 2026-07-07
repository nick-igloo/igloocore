import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Loader2, AlertOctagon, Plus, X, User as UserIcon,
  MapPin, CheckCircle2, Wrench, Mail, MessageSquare, ImageOff, Search,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getProperties, Property } from '../lib/properties';
import {
  IssueReport, IssueSeverity, listAllIssues, createIssue, Contractor,
  listContractors, logContractorOnIssue, markOwnerNotifiedOnIssue,
  notifyOwnerAboutIssue, resolveIssue, addIssueNote, getPhotoUrl,
} from '../lib/turnover';
import { TurnoverNav } from '../components/TurnoverNav';
import { PhotoPicker } from '../components/PhotoPicker';

const ADMIN_EMAILS = ['nick@igloo.scot', 'erin@igloo.scot'];

export default function TurnoverIssues() {
  const [loading, setLoading] = useState(true);
  const [issues, setIssues] = useState<IssueReport[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [performerName, setPerformerName] = useState('');
  const [search, setSearch] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [searchParams] = useSearchParams();
  const [creating, setCreating] = useState(() => searchParams.get('new') === '1');
  const [activeIssue, setActiveIssue] = useState<IssueReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = userEmail ? ADMIN_EMAILS.includes(userEmail.toLowerCase()) : false;

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const u = session?.user;
      setUserEmail(u?.email ?? null);
      if (u) {
        const { data: cp } = await supabase
          .from('cleaner_profiles')
          .select('full_name')
          .eq('auth_user_id', u.id)
          .maybeSingle();
        if (cp?.full_name) setPerformerName(cp.full_name);
        else if (u.user_metadata?.full_name) setPerformerName(u.user_metadata.full_name);
        else if (u.email) setPerformerName(u.email.split('@')[0]);
      }
      const [i, p, c] = await Promise.all([listAllIssues(), getProperties(true), listContractors()]);
      setIssues(i);
      setProperties(p);
      setContractors(c);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((i) => {
      if (!showResolved && (i.status === 'resolved' || i.status === 'cancelled')) return false;
      if (!q) return true;
      return `${i.property_name} ${i.title} ${i.description} ${i.reporter_name}`.toLowerCase().includes(q);
    });
  }, [issues, search, showResolved]);

  const openCount = issues.filter((i) => i.status !== 'resolved' && i.status !== 'cancelled').length;

  const handleCreate = (issue: IssueReport) => {
    setIssues((prev) => [issue, ...prev]);
    setCreating(false);
  };

  const handleUpdate = (updated: IssueReport) => {
    setIssues((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    setActiveIssue(updated);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 pb-24">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/guest-ready" className="text-slate-500 hover:text-slate-700"><ArrowLeft className="w-5 h-5" /></Link>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2"><AlertOctagon className="w-4 h-4 text-red-600" /> Issues</h1>
            <p className="text-xs text-slate-500">{openCount} open</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg"
          >
            <Plus className="w-4 h-4" /> Report
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <section className="bg-white rounded-2xl border border-slate-200 p-3 space-y-2">
          <div className="relative">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={performerName}
              onChange={(e) => setPerformerName(e.target.value)}
              placeholder="Your name"
              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search issues"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <button
              onClick={() => setShowResolved((v) => !v)}
              className={`text-xs font-semibold px-3 rounded-lg border transition-colors ${
                showResolved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {showResolved ? 'Hide resolved' : 'Show resolved'}
            </button>
          </div>
        </section>

        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No open issues</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {visible.map((i) => (
              <IssueCard key={i.id} issue={i} onOpen={() => setActiveIssue(i)} />
            ))}
          </ul>
        )}
      </main>

      {creating && (
        <NewIssueSheet
          properties={properties}
          performerName={performerName}
          performerRole={isAdmin ? 'director' : 'cleaner'}
          initialPropertyId={searchParams.get('property') ?? ''}
          onClose={() => setCreating(false)}
          onCreated={handleCreate}
        />
      )}

      {activeIssue && (
        <IssueDetailSheet
          issue={activeIssue}
          contractors={contractors}
          isAdmin={isAdmin}
          performerName={performerName}
          onClose={() => setActiveIssue(null)}
          onUpdate={handleUpdate}
        />
      )}

      <TurnoverNav issueCount={openCount} />
    </div>
  );
}

function severityClass(s: IssueSeverity): string {
  switch (s) {
    case 'urgent': return 'bg-red-100 text-red-800';
    case 'high': return 'bg-orange-100 text-orange-800';
    case 'low': return 'bg-slate-100 text-slate-600';
    default: return 'bg-amber-100 text-amber-800';
  }
}

function statusBadge(s: IssueReport['status']): { label: string; cls: string } {
  switch (s) {
    case 'open': return { label: 'Open', cls: 'bg-red-100 text-red-700' };
    case 'contractor_logged': return { label: 'Contractor logged', cls: 'bg-orange-100 text-orange-700' };
    case 'owner_notified': return { label: 'Owner notified', cls: 'bg-blue-100 text-blue-700' };
    case 'resolved': return { label: 'Resolved', cls: 'bg-emerald-100 text-emerald-700' };
    case 'cancelled': return { label: 'Cancelled', cls: 'bg-slate-100 text-slate-500' };
  }
}

function IssueCard({ issue, onOpen }: { issue: IssueReport; onOpen: () => void }) {
  const badge = statusBadge(issue.status);
  const firstPhoto = issue.photos[0];
  return (
    <li>
      <button
        onClick={onOpen}
        className="w-full bg-white rounded-2xl border border-slate-200 text-left overflow-hidden hover:border-slate-300 transition-colors"
      >
        <div className="flex gap-3 p-3">
          <div className="w-16 h-16 rounded-xl bg-slate-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
            {firstPhoto ? (
              <img src={getPhotoUrl(firstPhoto)} alt="" className="w-full h-full object-cover" />
            ) : (
              <ImageOff className="w-5 h-5 text-slate-300" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${severityClass(issue.severity)}`}>{issue.severity}</span>
            </div>
            <div className="font-semibold text-slate-900 mt-1 truncate">{issue.title}</div>
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {issue.property_name || 'Unassigned'}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

function NewIssueSheet({
  properties, performerName, performerRole, initialPropertyId, onClose, onCreated,
}: {
  properties: Property[];
  performerName: string;
  performerRole: string;
  initialPropertyId?: string;
  onClose: () => void;
  onCreated: (issue: IssueReport) => void;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IssueSeverity>('normal');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim() || !propertyId) {
      setError('Property and title are required.');
      return;
    }
    if (!performerName.trim()) {
      setError('Please enter your name on the Issues screen first.');
      return;
    }
    const prop = properties.find((p) => p.id === propertyId);
    setSaving(true);
    setError(null);
    try {
      const issue = await createIssue({
        property_id: propertyId,
        property_name: prop?.name ?? '',
        title: title.trim(),
        description: description.trim(),
        severity,
        photos,
        reporter_name: performerName.trim(),
        reporter_role: performerRole,
      });
      onCreated(issue);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-900">Report an issue</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Property">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            >
              <option value="">Select property…</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="What's the problem?">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dishwasher not draining"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="More detail (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Anything a contractor should know…"
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm"
            />
          </Field>
          <Field label="Urgency">
            <div className="grid grid-cols-4 gap-1 bg-slate-100 rounded-lg p-1">
              {(['low', 'normal', 'high', 'urgent'] as IssueSeverity[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className={`py-1.5 text-xs font-semibold rounded-md capitalize transition-colors ${
                    severity === s ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Photos">
            <PhotoPicker folder="issues" paths={photos} onChange={setPhotos} max={4} />
          </Field>
          {error && <div className="text-sm text-red-700">{error}</div>}
          <button
            onClick={submit}
            disabled={saving}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit issue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function IssueDetailSheet({
  issue, contractors, isAdmin, performerName, onClose, onUpdate,
}: {
  issue: IssueReport;
  contractors: Contractor[];
  isAdmin: boolean;
  performerName: string;
  onClose: () => void;
  onUpdate: (i: IssueReport) => void;
}) {
  const [showContractorPicker, setShowContractorPicker] = useState(false);
  const [selectedContractor, setSelectedContractor] = useState<string>(issue.contractor_id ?? '');
  const [manualContractor, setManualContractor] = useState('');
  const [contractorNote, setContractorNote] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const badge = statusBadge(issue.status);

  const refresh = async () => {
    const { data } = await supabase.from('issue_reports').select('*').eq('id', issue.id).maybeSingle();
    if (data) onUpdate({ ...data, photos: Array.isArray(data.photos) ? data.photos : [] });
  };

  const logContractor = async () => {
    const picked = contractors.find((c) => c.id === selectedContractor);
    const name = picked?.name || manualContractor.trim();
    if (!name) {
      setError('Choose or type a contractor name.');
      return;
    }
    if (!performerName.trim()) {
      setError('Enter your name on the Issues screen first.');
      return;
    }
    setBusy('contractor');
    setError(null);
    try {
      await logContractorOnIssue(issue.id, {
        contractor_id: picked?.id ?? null,
        contractor_name: name,
        note: contractorNote,
        actorName: performerName,
      });
      setShowContractorPicker(false);
      setContractorNote('');
      await refresh();
      setInfo(`Logged status: Contractor notified – ${name}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const notifyOwner = async () => {
    if (!performerName.trim()) {
      setError('Enter your name first.');
      return;
    }
    setBusy('owner');
    setError(null);
    try {
      const res = await notifyOwnerAboutIssue(issue.id);
      if (!res.ok) throw new Error(res.error || 'Failed');
      await markOwnerNotifiedOnIssue(issue.id, {
        ownerEmail: res.email ?? '',
        note: '',
        actorName: performerName,
      });
      await refresh();
      setInfo(`Owner emailed${res.email ? ` at ${res.email}` : ''}.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const resolve = async () => {
    if (!performerName.trim()) {
      setError('Enter your name first.');
      return;
    }
    setBusy('resolve');
    setError(null);
    try {
      await resolveIssue(issue.id, { notes: resolveNotes, actorName: performerName });
      await refresh();
      setInfo('Issue marked resolved.');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const postNote = async () => {
    if (!noteText.trim() || !performerName.trim()) return;
    setBusy('note');
    try {
      await addIssueNote(issue.id, { note: noteText.trim(), actorName: performerName });
      setNoteText('');
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const canResolve = issue.status !== 'resolved' && issue.status !== 'cancelled';

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <h2 className="font-bold text-slate-900 truncate pr-2">{issue.title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${severityClass(issue.severity)}`}>{issue.severity}</span>
            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{issue.property_name}</span>
          </div>

          {issue.description && <p className="text-sm text-slate-700 whitespace-pre-wrap">{issue.description}</p>}

          {issue.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {issue.photos.map((p) => (
                <a key={p} href={getPhotoUrl(p)} target="_blank" rel="noopener" className="block rounded-lg overflow-hidden border border-slate-200 aspect-square">
                  <img src={getPhotoUrl(p)} alt="" className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          )}

          <div className="text-xs text-slate-500 space-y-1">
            <div>Reported by <span className="font-semibold text-slate-700">{issue.reporter_name || '—'}</span> · {new Date(issue.created_at).toLocaleString('en-GB')}</div>
            {issue.contractor_logged_at && (
              <div>Contractor: <span className="font-semibold text-slate-700">{issue.contractor_name}</span> · {new Date(issue.contractor_logged_at).toLocaleString('en-GB')}</div>
            )}
            {issue.owner_notified_at && (
              <div>Owner notified: <span className="font-semibold text-slate-700">{issue.owner_notified_email || 'sent'}</span> · {new Date(issue.owner_notified_at).toLocaleString('en-GB')}</div>
            )}
            {issue.resolved_at && (
              <div>Resolved · {new Date(issue.resolved_at).toLocaleString('en-GB')}{issue.resolution_notes ? ` — ${issue.resolution_notes}` : ''}</div>
            )}
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          {info && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{info}</div>}

          {isAdmin && canResolve && (
            <div className="space-y-3">
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Director actions</div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => setShowContractorPicker((v) => !v)}
                    className="w-full inline-flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 rounded-lg"
                  >
                    <Wrench className="w-4 h-4" /> Log contractor status
                  </button>
                  {showContractorPicker && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <select
                        value={selectedContractor}
                        onChange={(e) => { setSelectedContractor(e.target.value); setManualContractor(''); }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      >
                        <option value="">Select contractor…</option>
                        {contractors.map((c) => <option key={c.id} value={c.id}>{c.name}{c.trade ? ` · ${c.trade}` : ''}</option>)}
                      </select>
                      <input
                        value={manualContractor}
                        onChange={(e) => { setManualContractor(e.target.value); setSelectedContractor(''); }}
                        placeholder="Or type a name"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      />
                      <input
                        value={contractorNote}
                        onChange={(e) => setContractorNote(e.target.value)}
                        placeholder="Note (e.g. WhatsApped at 14:30)"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                      />
                      <button
                        onClick={logContractor}
                        disabled={busy === 'contractor'}
                        className="w-full bg-slate-900 hover:bg-slate-700 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {busy === 'contractor' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save status'}
                      </button>
                    </div>
                  )}

                  <button
                    onClick={notifyOwner}
                    disabled={busy === 'owner'}
                    className="w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
                  >
                    {busy === 'owner' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4" /> Email owner</>}
                  </button>

                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                    <textarea
                      value={resolveNotes}
                      onChange={(e) => setResolveNotes(e.target.value)}
                      rows={2}
                      placeholder="Resolution notes (optional)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
                    />
                    <button
                      onClick={resolve}
                      disabled={busy === 'resolve'}
                      className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-lg disabled:opacity-50"
                    >
                      {busy === 'resolve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4" /> Mark resolved</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-slate-200 pt-3">
            <div className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Add note</div>
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Status update…"
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
              />
              <button
                onClick={postNote}
                disabled={!noteText.trim() || busy === 'note'}
                className="px-3 bg-slate-900 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
              >
                Post
              </button>
            </div>
            {issue.status_note && <div className="text-xs text-slate-500 mt-2">Latest: {issue.status_note}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}
