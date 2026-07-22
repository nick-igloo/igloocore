import { useCallback, useEffect, useState } from 'react';
import {
  Star, Loader2, Sparkles, Send, RefreshCw, CheckCircle2, AlertCircle, X,
  FlaskConical, MessageSquare,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// LABS · Review Responder
// Demo: list Avantio reviews → Claude drafts a reply in Igloo's voice
// → send via PUT /reviews/{id}/response. All API traffic goes through
// one n8n webhook (action-routed); test credentials only.
// ═══════════════════════════════════════════════════════════════════

const WEBHOOK_URL =
  import.meta.env.VITE_N8N_REVIEWS_WEBHOOK_URL ||
  'https://igloo.app.n8n.cloud/webhook/review-responder';

const MAX_RESPONSE = 4000; // Avantio: response string length <= 4000

// The review object's exact shape isn't expanded in the API reference,
// so normalise defensively from whatever the tenant returns.
interface AvantioReview {
  id: string;
  rating?: number | string;
  score?: number | string;
  title?: string;
  comment?: string;
  text?: string;
  review?: string;
  guestName?: string;
  customerName?: string;
  author?: string;
  accommodationId?: string;
  accommodationName?: string;
  salesChannel?: string;
  channel?: string;
  creationDate?: string;
  createdAt?: string;
  date?: string;
  response?: unknown;
  [key: string]: unknown;
}

interface ReviewVM {
  id: string;
  rating: number | null;
  title: string;
  body: string;
  guest: string;
  channel: string;
  date: string;
  accommodation: string;
  alreadyResponded: boolean;
}

function normalise(r: AvantioReview): ReviewVM {
  const ratingRaw = r.rating ?? r.score;
  const rating = ratingRaw != null && !Number.isNaN(Number(ratingRaw)) ? Number(ratingRaw) : null;
  return {
    id: String(r.id),
    rating,
    title: String(r.title || ''),
    body: String(r.comment || r.text || r.review || ''),
    guest: String(r.guestName || r.customerName || r.author || 'Guest'),
    channel: String(r.salesChannel || r.channel || ''),
    date: String(r.creationDate || r.createdAt || r.date || ''),
    accommodation: String(r.accommodationName || r.accommodationId || ''),
    alreadyResponded: r.response != null && r.response !== '',
  };
}

type SendState = 'idle' | 'sending' | 'sent';

export default function ReviewResponder() {
  const [reviews, setReviews] = useState<ReviewVM[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [drafting, setDrafting] = useState<Record<string, boolean>>({});
  const [sendState, setSendState] = useState<Record<string, SendState>>({});
  const [raw, setRaw] = useState<AvantioReview[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list_reviews' }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} — is the n8n workflow active?`);
      const payload = await res.json();
      const list: AvantioReview[] = payload?.data ?? payload?.reviews ?? (Array.isArray(payload) ? payload : []);
      setRaw(list);
      setReviews(list.map(normalise));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const draftReply = async (rv: ReviewVM) => {
    setDrafting(d => ({ ...d, [rv.id]: true })); setError(null);
    try {
      const original = raw.find(r => String(r.id) === rv.id) ?? rv;
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft_reply', review: original }),
      });
      if (!res.ok) throw new Error(`Draft failed (${res.status})`);
      const data = await res.json();
      const reply = data.reply || data.text || '';
      if (!reply) throw new Error('No draft returned');
      setDrafts(d => ({ ...d, [rv.id]: reply.slice(0, MAX_RESPONSE) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Drafting failed');
    } finally {
      setDrafting(d => ({ ...d, [rv.id]: false }));
    }
  };

  const sendReply = async (rv: ReviewVM) => {
    const text = (drafts[rv.id] || '').trim();
    if (!text) return;
    setSendState(s => ({ ...s, [rv.id]: 'sending' })); setError(null);
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_reply', reviewId: rv.id, response: text }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Send failed (${res.status}): ${body.slice(0, 200)}`);
      }
      setSendState(s => ({ ...s, [rv.id]: 'sent' }));
    } catch (e) {
      setSendState(s => ({ ...s, [rv.id]: 'idle' }));
      setError(e instanceof Error ? e.message : 'Send failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="flex items-center gap-2.5 mb-6">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 text-[11px] font-bold uppercase tracking-wider">
          <FlaskConical className="w-3.5 h-3.5" /> Labs
        </span>
        <h1 className="text-xl font-bold text-slate-900">Review Responder</h1>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Avantio test credentials · replies drafted by AI, sent only when you say so
        </span>
        <div className="flex-1" />
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-red-700 text-sm flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading && (
        <div className="text-center py-16 text-slate-400">
          <Loader2 className="w-8 h-8 mx-auto animate-spin mb-3" />
          <p className="text-sm">Loading reviews from Avantio…</p>
        </div>
      )}

      {!loading && reviews.length === 0 && !error && (
        <div className="text-center py-16 text-slate-400">
          <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No reviews on this tenant yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map(rv => {
          const state = sendState[rv.id] || 'idle';
          const draft = drafts[rv.id] ?? '';
          return (
            <div key={rv.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-sm">{rv.guest}</span>
                    {rv.rating != null && (
                      <span className="inline-flex items-center gap-0.5 text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`w-3.5 h-3.5 ${i < Math.round(rv.rating!) ? 'fill-current' : 'opacity-25'}`} />
                        ))}
                        <span className="ml-1 text-xs font-semibold text-slate-500">{rv.rating}</span>
                      </span>
                    )}
                    {rv.channel && (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[11px] font-semibold">
                        {rv.channel.replace(/^bk_/, '')}
                      </span>
                    )}
                    {rv.alreadyResponded && (
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 text-[11px] font-semibold">
                        responded
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {[rv.accommodation, rv.date && rv.date.slice(0, 10)].filter(Boolean).join(' · ')}
                  </div>
                  {rv.title && <p className="mt-2 text-sm font-semibold text-slate-800">{rv.title}</p>}
                  {rv.body && <p className="mt-1 text-sm text-slate-600 whitespace-pre-wrap">{rv.body}</p>}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                {state === 'sent' ? (
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-semibold">
                    <CheckCircle2 className="w-4 h-4" /> Reply sent to Avantio
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => draftReply(rv)}
                        disabled={!!drafting[rv.id]}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
                      >
                        {drafting[rv.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {draft ? 'Redraft with AI' : 'Draft with AI'}
                      </button>
                      <span className="text-[11px] text-slate-400 ml-auto">{draft.length}/{MAX_RESPONSE}</span>
                    </div>
                    <textarea
                      value={draft}
                      onChange={e => setDrafts(d => ({ ...d, [rv.id]: e.target.value.slice(0, MAX_RESPONSE) }))}
                      placeholder="Reply to this guest — draft with AI or write your own."
                      rows={4}
                      maxLength={MAX_RESPONSE}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => sendReply(rv)}
                        disabled={!draft.trim() || state === 'sending'}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                      >
                        {state === 'sending' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {state === 'sending' ? 'Sending…' : 'Send reply'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
