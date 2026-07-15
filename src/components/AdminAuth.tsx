import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Mail, Lock, Wand2, CheckCircle2 } from 'lucide-react';

const ADMIN_EMAILS = ['nick@igloo.scot', 'erin@igloo.scot'];

interface AdminAuthProps {
  onAuthenticated: () => void;
}

type Mode = 'password' | 'magic';

export const AdminAuth: React.FC<AdminAuthProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<Mode>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);

  const isAllowed = (value: string) => ADMIN_EMAILS.includes(value.trim().toLowerCase());

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!isAllowed(email)) {
        throw new Error('Access denied. This portal is restricted to authorised administrators.');
      }
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) {
        if (authError.message?.includes('Invalid login credentials')) {
          throw new Error('Incorrect email or password.');
        }
        throw authError;
      }
      onAuthenticated();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMagicSent(false);

    try {
      if (!isAllowed(email)) {
        throw new Error('Access denied. This portal is restricted to authorised administrators.');
      }
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: window.location.origin,
        },
      });
      if (authError) throw authError;
      setMagicSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: 'linear-gradient(170deg, #0d2850 0%, #1a4a7a 62%, #2e7cc7 130%)' }}>
      <div className="w-full max-w-md">
        {/* igloo wordmark */}
        <div className="text-center mb-7 select-none">
          <div className="text-white font-bold tracking-tight" style={{ fontSize: 44, lineHeight: 1 }}>igloo</div>
          <div className="mt-2 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.75)', letterSpacing: 0.3 }}>Director Portal</div>
        </div>

        <div className="bg-white p-8" style={{ borderRadius: 14, boxShadow: '0 18px 50px rgba(5,20,45,0.45)' }}>
          <div className="grid grid-cols-2 gap-1 mb-6 p-1 rounded-lg" style={{ background: '#f0f4f9' }}>
            <button
              type="button"
              onClick={() => { setMode('magic'); setError(null); setMagicSent(false); }}
              className="py-2 text-sm font-semibold rounded-md transition-colors"
              style={mode === 'magic' ? { background: '#fff', color: '#1a4a7a', boxShadow: '0 1px 2px rgba(13,40,80,0.12)' } : { color: '#5a7a9a' }}
            >
              Magic link
            </button>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(null); setMagicSent(false); }}
              className="py-2 text-sm font-semibold rounded-md transition-colors"
              style={mode === 'password' ? { background: '#fff', color: '#1a4a7a', boxShadow: '0 1px 2px rgba(13,40,80,0.12)' } : { color: '#5a7a9a' }}
            >
              Password
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <EmailField email={email} setEmail={setEmail} />
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: '#0d2850' }}>Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#9ab0c5' }} />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 rounded-lg transition-all text-sm focus:outline-none"
                    style={{ border: '1px solid #d4e2ef' }}
                    onFocus={(e) => { e.currentTarget.style.border = '1px solid #2e7cc7'; e.currentTarget.style.boxShadow = '0 0 0 3px #e8f1fa'; }}
                    onBlur={(e) => { e.currentTarget.style.border = '1px solid #d4e2ef'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#1a4a7a' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0d2850')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#1a4a7a')}
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-5">
              <EmailField email={email} setEmail={setEmail} />
              <p className="text-xs" style={{ color: '#5a7a9a' }}>
                We'll email you a one-time sign-in link. No password needed.
              </p>

              {error && <ErrorBanner message={error} />}
              {magicSent && (
                <div className="rounded-lg px-4 py-3 flex items-start gap-2" style={{ background: '#e9f6f0', border: '1px solid #bfe3d2' }}>
                  <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: '#1a9860' }} />
                  <div className="text-sm" style={{ color: '#14603d' }}>
                    Sign-in link sent to <span className="font-semibold">{email}</span>. Check your
                    inbox and click the link to continue.
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#1a4a7a' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#0d2850')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#1a4a7a')}
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : <><Wand2 className="w-4 h-4" /> Email me a sign-in link</>}
              </button>
            </form>
          )}
        </div>

        <div className="text-center mt-6 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Igloo Highland Ltd · Aviemore, Cairngorms National Park
        </div>
      </div>
    </div>
  );
};

function EmailField({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "#0d2850" }}>Email Address</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#9ab0c5" }} />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="admin@example.com"
          className="w-full pl-10 pr-4 py-3 rounded-lg transition-all text-sm focus:outline-none"
          style={{ border: "1px solid #d4e2ef" }}
          onFocus={(e) => { e.currentTarget.style.border = "1px solid #2e7cc7"; e.currentTarget.style.boxShadow = "0 0 0 3px #e8f1fa"; }}
          onBlur={(e) => { e.currentTarget.style.border = "1px solid #d4e2ef"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <p className="text-red-700 text-sm">{message}</p>
    </div>
  );
}
