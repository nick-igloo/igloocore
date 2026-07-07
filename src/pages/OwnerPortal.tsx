import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { OwnerAuth } from '../components/OwnerAuth';
import { OwnerDocuments } from '../components/OwnerDocuments';
import { Loader2 } from 'lucide-react';
import { User } from '@supabase/supabase-js';

export default function OwnerPortal() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <OwnerAuth onAuthenticated={() => {}} />;
  }

  return <OwnerDocuments user={user} onSignOut={handleSignOut} />;
}
