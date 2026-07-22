import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, ImagePlus, Loader2, Sparkles, Rocket, Trash2, ArrowUp, ArrowDown,
  CheckCircle2, AlertCircle, X, ExternalLink, FlaskConical, FolderOpen,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ═══════════════════════════════════════════════════════════════════
// LABS · Property Publisher
// Demo: drag-drop photos → Supabase public bucket → AI tag/describe
// (via n8n) → create Avantio accommodation + gallery + images (test
// credentials, via n8n) → mirror to Google Drive (via n8n).
// The browser NEVER talks to Avantio directly — swapping test creds
// for live is a credential change in n8n only.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_LABS_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/photo-upload';

const BUCKET = 'labs-property-photos';

// Avantio "Upload Image" category enum — VERIFIED against the API
// portal (all 20 values). DINNING_ROOM and COFFE_PLACE are Avantio's
// own spellings; do not "fix" them or uploads will 400.
const IMAGE_CATEGORIES = [
  'KITCHEN', 'FRONT', 'BEDROOM', 'BATHROOM', 'GARDEN', 'SWIMMING_POOL',
  'TERRACE', 'GARAGE', 'EXTERIOR', 'DETAILS', 'OTHERS', 'LIVING_ROOM',
  'RECEPTION', 'BALCONY', 'DINNING_ROOM', 'COFFE_PLACE', 'VIEWS',
  'PROPERTY_FLOOR_PLANS', 'RESORT', 'CHILDRENS_ROOM',
];

// Display-only labels: correct spelling on screen, Avantio's exact
// enum value on the wire.
const CATEGORY_LABELS: Record<string, string> = {
  DINNING_ROOM: 'Dining room',
  COFFE_PLACE: 'Coffee place',
};
const categoryLabel = (c: string) =>
  CATEGORY_LABELS[c] ||
  (c.charAt(0) + c.slice(1).toLowerCase()).replace(/_/g, ' ');

// Avantio accommodation type enum — VERIFIED against the API portal
// (all 30 values). Ordered Igloo-relevant first; GARAGE/PARKING's
// slash is Avantio's exact value.
const ACCOMMODATION_TYPES = [
  'HOUSE', 'COTTAGE', 'CHALET', 'BUNGALOW', 'COUNTRY_HOUSE', 'APARTMENT',
  'FLAT', 'STUDIO', 'TOWNHOUSE', 'SEMI_DETACHED_HOUSE', 'PENTHOUSE',
  'CONDOMINIUM', 'VILLA', 'FARM_STAY', 'RESORT', 'HOTEL', 'APARTHOTEL',
  'RENT_BY_ROOM', 'MOBILE_HOME', 'BOAT', 'MOORING', 'PLOT', 'BOXROOM',
  'GARAGE/PARKING', 'BRAND_NEW_BUILDING', 'COMMERCIAL_SPACE',
  'INDUSTRIAL_PREMISE', 'BUSINESS_LEASE_TRANSFER', 'EXCHANGE', 'TRULLO',
];

// Avantio Upload Image accepts these MIME types, 50 KB – 11 MB.
const ACCEPTED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MIN_BYTES = 51_200;
const MAX_BYTES = 11_534_336;

interface DraftImage {
  id: string;
  draft_id: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  file_size: number | null;
  sort_order: number;
  category: string | null;
  description: string | null;
  ai_tagged: boolean;
  avantio_image_id: string | null;
}

type PublishState = 'idle' | 'publishing' | 'published' | 'error';

export default function PropertyPublisher() {
  // Property details
  const [draftId, setDraftId] = useState<string | null>(null);
  const [propName, setPropName] = useState('');
  const [propType, setPropType] = useState('HOUSE');
  const [city, setCity] = useState('Aviemore');

  // Images
  const [images, setImages] = useState<DraftImage[]>([]);
  const [uploading, setUploading] = useState(0); // count of in-flight uploads
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // AI + publish
  const [tagging, setTagging] = useState(false);
  const [publish, setPublish] = useState<PublishState>('idle');
  const [publishResult, setPublishResult] = useState<{
    accommodationId?: string; galleryId?: string; driveFolderUrl?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);

  // ── Draft lifecycle ──────────────────────────────────────────────

  const ensureDraft = async (): Promise<string> => {
    if (draftId) return draftId;
    const { data, error: err } = await supabase
      .from('labs_property_drafts')
      .insert({ name: propName, accommodation_type: propType, city })
      .select('id')
      .single();
    if (err || !data) throw new Error(err?.message || 'Could not create draft');
    setDraftId(data.id);
    return data.id;
  };

  // Persist detail edits once a draft exists (debounced-ish via blur)
  const saveDetails = async () => {
    if (!draftId) return;
    await supabase
      .from('labs_property_drafts')
      .update({ name: propName, accommodation_type: propType, city, updated_at: new Date().toISOString() })
      .eq('id', draftId);
  };

  // ── Upload ───────────────────────────────────────────────────────

  const addFiles = async (files: FileList | File[]) => {
    setError(null);
    const list = Array.from(files).filter(f => {
      if (!ACCEPTED_MIME.includes(f.type)) return false;
      if (f.size < MIN_BYTES || f.size > MAX_BYTES) {
        setError(`${f.name}: Avantio needs files between 50 KB and 11 MB — skipped.`);
        return false;
      }
      return true;
    });
    if (!list.length) return;

    let id: string;
    try { id = await ensureDraft(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Draft creation failed'); return; }

    setUploading(u => u + list.length);
    const startOrder = images.length;

    await Promise.all(list.map(async (file, i) => {
      try {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${id}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
          cacheControl: '3600', upsert: false,
        });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const row = {
          draft_id: id,
          storage_path: path,
          public_url: pub.publicUrl,
          file_name: file.name,
          file_size: file.size,
          sort_order: startOrder + i + 1,
        };
        const { data, error: insErr } = await supabase
          .from('labs_images').insert(row).select('*').single();
        if (insErr || !data) throw insErr || new Error('insert failed');
        setImages(prev => [...prev, data as DraftImage].sort((a, b) => a.sort_order - b.sort_order));
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`);
      } finally {
        setUploading(u => u - 1);
      }
    }));
  };

  // ── Image edits ──────────────────────────────────────────────────

  const patchImage = async (imgId: string, patch: Partial<DraftImage>) => {
    setImages(prev => prev.map(im => (im.id === imgId ? { ...im, ...patch } : im)));
    await supabase.from('labs_images').update(patch).eq('id', imgId);
  };

  const removeImage = async (im: DraftImage) => {
    setImages(prev => prev.filter(x => x.id !== im.id));
    await supabase.from('labs_images').delete().eq('id', im.id);
    await supabase.storage.from(BUCKET).remove([im.storage_path]);
    // re-number
    setImages(prev => {
      const renum = prev.map((x, i) => ({ ...x, sort_order: i + 1 }));
      renum.forEach(x => supabase.from('labs_images').update({ sort_order: x.sort_order }).eq('id', x.id));
      return renum;
    });
  };

  const move = (im: DraftImage, dir: -1 | 1) => {
    const idx = images.findIndex(x => x.id === im.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= images.length) return;
    const next = [...images];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    const renum = next.map((x, i) => ({ ...x, sort_order: i + 1 }));
    setImages(renum);
    renum.forEach(x => supabase.from('labs_images').update({ sort_order: x.sort_order }).eq('id', x.id));
  };

  // ── AI tagging via n8n ───────────────────────────────────────────

  const autoTag = async () => {
    if (!images.length) return;
    setTagging(true); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'tag_images',
          propertyName: propName || 'a holiday property',
          categories: IMAGE_CATEGORIES,
          images: images.map(im => ({ id: im.id, url: im.public_url })),
        }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} — is the n8n workflow active?`);
      const data = await res.json();
      const results: { id: string; category: string; description: string }[] =
        data.results || data;
      for (const r of results) {
        await patchImage(r.id, { category: r.category, description: r.description, ai_tagged: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI tagging failed');
    } finally {
      setTagging(false);
    }
  };

  // ── Publish via n8n ──────────────────────────────────────────────

  const canPublish =
    propName.trim().length > 0 &&
    images.length > 0 &&
    images.every(im => im.category) &&
    publish !== 'publishing';

  const doPublish = async () => {
    if (!canPublish || !draftId) return;
    setPublish('publishing'); setError(null);
    await saveDetails();
    await supabase.from('labs_property_drafts').update({ status: 'publishing' }).eq('id', draftId);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish',
          draftId,
          property: {
            name: propName,
            type: propType,
            city,
            countryCode: 'GB',
            purpose: 'RENTAL',
            status: 'ENABLED',
          },
          gallery: { name: `${propName} gallery` },
          images: images.map(im => ({
            id: im.id,
            url: im.public_url,
            name: im.file_name.replace(/\.[^.]+$/, '').slice(0, 100),
            category: im.category,
            description: im.description || '',
            order: im.sort_order,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Publish failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const data = await res.json();
      setPublishResult({
        accommodationId: data.accommodationId,
        galleryId: data.galleryId,
        driveFolderUrl: data.driveFolderUrl,
      });
      setPublish('published');
    } catch (e) {
      setPublish('error');
      setError(e instanceof Error ? e.message : 'Publish failed');
      await supabase.from('labs_property_drafts')
        .update({ status: 'error', error_message: String(e) }).eq('id', draftId);
    }
  };

  // warn before leaving mid-upload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (uploading > 0) e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [uploading]);

  // ── UI ───────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Labs banner */}
      <div className="flex items-center gap-2.5 mb-6">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Property Publisher</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Avantio test credentials · nothing here touches live data
        </span>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {publish === 'published' && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm">
            <CheckCircle2 className="w-4 h-4" /> Published to Avantio (test)
          </div>
          <div className="mt-1.5 text-xs text-emerald-700 flex flex-wrap gap-x-4 gap-y-1">
            {publishResult.accommodationId && <span>Accommodation ID: <code className="font-mono">{publishResult.accommodationId}</code></span>}
            {publishResult.galleryId && <span>Gallery ID: <code className="font-mono">{publishResult.galleryId}</code></span>}
            {publishResult.driveFolderUrl && (
              <a href={publishResult.driveFolderUrl} target="_blank" rel="noreferrer"
                 className="inline-flex items-center gap-1 font-semibold hover:underline">
                <FolderOpen className="w-3.5 h-3.5" /> Photos on Drive <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left: property details + actions ── */}
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h2 className="text-sm font-bold text-slate-900 mb-3">Property</h2>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
            <input
              type="text" value={propName}
              onChange={e => setPropName(e.target.value)}
              onBlur={saveDetails}
              placeholder="e.g. Osprey View Lodge"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 mb-3"
            />
            <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
            <select
              value={propType}
              onChange={e => setPropType(e.target.value)}
              onBlur={saveDetails}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-blue-500 mb-3"
            >
              {ACCOMMODATION_TYPES.map(t => <option key={t} value={t}>{categoryLabel(t)}</option>)}
            </select>
            <label className="block text-xs font-semibold text-slate-500 mb-1">City</label>
            <input
              type="text" value={city}
              onChange={e => setCity(e.target.value)}
              onBlur={saveDetails}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500"
            />
            <p className="mt-3 text-[11px] text-slate-400">
              Country GB · Purpose RENTAL · Status ENABLED — fixed for this demo.
            </p>
          </section>

          <button
            onClick={autoTag}
            disabled={!images.length || tagging || uploading > 0}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {tagging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {tagging ? 'Tagging…' : 'Auto-tag & describe with AI'}
          </button>

          <button
            onClick={doPublish}
            disabled={!canPublish}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {publish === 'publishing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            {publish === 'publishing' ? 'Publishing…' : 'Publish to Avantio (test)'}
          </button>
          {!canPublish && publish !== 'publishing' && (
            <p className="text-[11px] text-slate-400 text-center -mt-2">
              Needs a name, at least one photo, and a category on every photo.
            </p>
          )}
          <p className="text-[11px] text-slate-400 text-center">
            Publishing creates the accommodation & gallery via n8n and mirrors photos to Google Drive.
          </p>
        </div>

        {/* ── Right: dropzone + gallery ── */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-slate-400'
            }`}
          >
            <input
              ref={fileInput} type="file" multiple accept={ACCEPTED_MIME.join(',')}
              className="hidden"
              onChange={e => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }}
            />
            <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
            <p className="text-sm font-semibold text-slate-700">
              Drag photos here, or click to browse
            </p>
            <p className="text-xs text-slate-400 mt-1">
              JPG, PNG, WebP or GIF · 50 KB – 11 MB each (Avantio's limits)
            </p>
            {uploading > 0 && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading {uploading}…
              </p>
            )}
          </div>

          {images.length === 0 && uploading === 0 && (
            <div className="text-center py-10 text-slate-400">
              <ImagePlus className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No photos yet — the gallery builds here as you drop them in.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {images.map((im, idx) => (
              <div key={im.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="relative aspect-video bg-slate-100">
                  <img src={im.public_url} alt={im.file_name} className="w-full h-full object-cover" loading="lazy" />
                  <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[11px] font-bold">
                    #{im.sort_order}
                  </span>
                  {im.ai_tagged && (
                    <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-600/90 text-white text-[10px] font-bold">
                      <Sparkles className="w-3 h-3" /> AI
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={im.category || ''}
                      onChange={e => patchImage(im.id, { category: e.target.value || null, ai_tagged: false })}
                      className={`flex-1 px-2 py-1.5 border rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-500 ${
                        im.category ? 'border-slate-300 text-slate-800' : 'border-amber-300 text-amber-600'
                      }`}
                    >
                      <option value="">Category…</option>
                      {IMAGE_CATEGORIES.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                    <button onClick={() => move(im, -1)} disabled={idx === 0}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30" title="Move up">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button onClick={() => move(im, 1)} disabled={idx === images.length - 1}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30" title="Move down">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button onClick={() => removeImage(im)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" title="Remove">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    value={im.description || ''}
                    onChange={e => patchImage(im.id, { description: e.target.value })}
                    placeholder="Description (AI can write this — required to publish)"
                    rows={2}
                    maxLength={700}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 resize-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
