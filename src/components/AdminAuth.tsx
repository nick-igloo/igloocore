import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Mail, Lock, Shield, Wand2, CheckCircle2 } from 'lucide-react';

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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
              <Shield className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Director Portal</h1>
            <p className="text-gray-500 text-sm">Administrator access only</p>
          </div>

          <div className="grid grid-cols-2 gap-1 mb-6 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setMode('magic'); setError(null); setMagicSent(false); }}
              className={`py-2 text-sm font-semibold rounded-md transition-colors ${
                mode === 'magic' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Magic link
            </button>
            <button
              type="button"
              onClick={() => { setMode('password'); setError(null); setMagicSent(false); }}
              className={`py-2 text-sm font-semibold rounded-md transition-colors ${
                mode === 'password' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Password
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handlePasswordSubmit} className="space-y-5">
              <EmailField email={email} setEmail={setEmail} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
                  />
                </div>
              </div>

              {error && <ErrorBanner message={error} />}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</> : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-5">
              <EmailField email={email} setEmail={setEmail} />
              <p className="text-xs text-slate-500">
                We'll email you a one-time sign-in link. No password needed.
              </p>

              {error && <ErrorBanner message={error} />}
              {magicSent && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="text-emerald-800 text-sm">
                    Sign-in link sent to <span className="font-semibold">{email}</span>. Check your
                    inbox and click the link to continue.
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</> : <><Wand2 className="w-4 h-4" /> Email me a sign-in link</>}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

function EmailField({ email, setEmail }: { email: string; setEmail: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
      <div className="relative">
        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="admin@example.com"
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm"
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
