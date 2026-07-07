import { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Shield, Search, Loader2, Check, X, UserPlus, Eye, EyeOff, LayoutGrid, ArrowUp, ArrowDown } from 'lucide-react';
import { supabase, Project } from '../lib/supabase';
import { DatabaseUser, DirectorAccess as DirectorAccessRecord } from '../types';
import { quickAccessCards } from '../lib/dashboardCards';

interface DashboardPrefRow {
  user_id: string;
  hidden_cards: string[];
  card_order: string[];
}

export function DirectorAccess() {
  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accessRecords, setAccessRecords] = useState<DirectorAccessRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', password: '', fullName: '', makeAdmin: false });
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Record<string, DashboardPrefRow>>({});
  const [showCardsModal, setShowCardsModal] = useState(false);
  const [cardsUserId, setCardsUserId] = useState<string | null>(null);
  const [cardsDraft, setCardsDraft] = useState<{ hidden: Set<string>; order: string[] }>({ hidden: new Set(), order: [] });
  const [savingCards, setSavingCards] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [usersResult, projectsResult, accessResult, prefsResult] = await Promise.all([
        supabase.rpc('get_all_users'),
        supabase.from('projects').select('*').order('display_order'),
        supabase.from('director_access').select('*'),
        supabase.from('director_dashboard_prefs').select('user_id, hidden_cards, card_order'),
      ]);

      if (usersResult.error) throw usersResult.error;
      if (projectsResult.error) throw projectsResult.error;
      if (accessResult.error) throw accessResult.error;
      if (prefsResult.error) throw prefsResult.error;

      setUsers(usersResult.data || []);
      setProjects(projectsResult.data || []);
      setAccessRecords(accessResult.data || []);
      const map: Record<string, DashboardPrefRow> = {};
      (prefsResult.data || []).forEach((r: DashboardPrefRow) => { map[r.user_id] = r; });
      setPrefs(map);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const toggleAdmin = async (userId: string, currentRole: string | undefined) => {
    try {
      const newRole = currentRole === 'admin' ? null : 'admin';
      const { error } = await supabase.rpc('set_user_role', { target_user_id: userId, new_role: newRole });
      if (error) throw error;
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const grantAccess = async (userId: string, projectId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('director_access').insert({
        user_id: userId,
        project_id: projectId,
        granted_by: user.id,
      });
      if (error) throw error;
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const revokeAccess = async (accessId: string) => {
    try {
      const { error } = await supabase.from('director_access').delete().eq('id', accessId);
      if (error) throw error;
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    setCreateSuccess(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: createForm.email.trim(),
          password: createForm.password,
          full_name: createForm.fullName.trim() || undefined,
          make_admin: createForm.makeAdmin,
        },
      });
      if (fnError) {
        let msg = fnError.message || 'Failed to create user';
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) msg = body.error;
          }
        } catch { /* ignore */ }
        throw new Error(msg);
      }
      if ((data as { error?: string } | null)?.error) {
        throw new Error((data as { error: string }).error);
      }
      const email = createForm.email;
      setCreateForm({ email: '', password: '', fullName: '', makeAdmin: false });
      setShowCreateModal(false);
      setCreateSuccess(`Created ${email}`);
      await loadData();
      setTimeout(() => setCreateSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openCardsModal = (userId: string) => {
    const existing = prefs[userId];
    const order = existing?.card_order?.length
      ? [...existing.card_order, ...quickAccessCards.map(c => c.id).filter(id => !existing.card_order.includes(id))]
      : quickAccessCards.map(c => c.id);
    setCardsDraft({
      hidden: new Set(existing?.hidden_cards || []),
      order,
    });
    setCardsUserId(userId);
    setShowCardsModal(true);
  };

  const toggleCardHidden = (id: string) => {
    setCardsDraft(d => {
      const next = new Set(d.hidden);
      if (next.has(id)) next.delete(id); else next.add(id);
      return { ...d, hidden: next };
    });
  };

  const moveCard = (id: string, dir: -1 | 1) => {
    setCardsDraft(d => {
      const idx = d.order.indexOf(id);
      if (idx === -1) return d;
      const target = idx + dir;
      if (target < 0 || target >= d.order.length) return d;
      const next = [...d.order];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, order: next };
    });
  };

  const saveCardPrefs = async () => {
    if (!cardsUserId) return;
    setSavingCards(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload = {
        user_id: cardsUserId,
        hidden_cards: Array.from(cardsDraft.hidden),
        card_order: cardsDraft.order,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      };
      const { error } = await supabase
        .from('director_dashboard_prefs')
        .upsert(payload, { onConflict: 'user_id' });
      if (error) throw error;
      setShowCardsModal(false);
      setCardsUserId(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingCards(false);
    }
  };

  const resetCardPrefs = async () => {
    if (!cardsUserId) return;
    setSavingCards(true);
    try {
      const { error } = await supabase
        .from('director_dashboard_prefs')
        .delete()
        .eq('user_id', cardsUserId);
      if (error) throw error;
      setShowCardsModal(false);
      setCardsUserId(null);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reset');
    } finally {
      setSavingCards(false);
    }
  };

  const getUserAccess = (userId: string) => accessRecords.filter(a => a.user_id === userId);
  const hasAccess = (userId: string, projectId: string) =>
    accessRecords.some(a => a.user_id === userId && a.project_id === projectId);

  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 bg-red-50 text-red-800 border border-red-200 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {createSuccess && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg flex items-center gap-2 text-sm">
          <Check className="w-4 h-4" /> {createSuccess}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search users by email..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4" /> Create User
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No users found</div>
          ) : (
            filteredUsers.map(user => {
              const userAccess = getUserAccess(user.id);
              const isAdmin = user.raw_app_meta_data?.role === 'admin';

              return (
                <div key={user.id} className="p-6 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900">{user.email}</h3>
                          {isAdmin && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                              <Shield className="w-3 h-3" />
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Joined {new Date(user.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleAdmin(user.id, user.raw_app_meta_data?.role)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                          isAdmin
                            ? 'bg-red-50 text-red-700 hover:bg-red-100'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                        }`}
                      >
                        {isAdmin ? 'Remove Admin' : 'Make Admin'}
                      </button>
                      <button
                        onClick={() => openCardsModal(user.id)}
                        className="px-3 py-1.5 text-sm font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <LayoutGrid className="w-4 h-4" />
                        Cards
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user.id);
                          setShowAccessModal(true);
                        }}
                        className="px-3 py-1.5 text-sm font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Grant Access
                      </button>
                    </div>
                  </div>

                  {userAccess.length > 0 && (
                    <div className="ml-13 space-y-2">
                      <p className="text-sm font-medium text-slate-700">Project access</p>
                      <div className="flex flex-wrap gap-2">
                        {userAccess.map(access => {
                          const project = projects.find(p => p.id === access.project_id);
                          if (!project) return null;
                          return (
                            <div
                              key={access.id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-sm"
                            >
                              <span className="text-slate-800">{project.name}</span>
                              <button
                                onClick={() => revokeAccess(access.id)}
                                className="text-red-600 hover:text-red-800 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {showAccessModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">Grant Project Access</h3>
                <button
                  onClick={() => {
                    setShowAccessModal(false);
                    setSelectedUser(null);
                  }}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                {users.find(u => u.id === selectedUser)?.email}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {projects.map(project => {
                  const already = hasAccess(selectedUser, project.id);
                  return (
                    <button
                      key={project.id}
                      onClick={() => {
                        if (!already) {
                          grantAccess(selectedUser, project.id);
                          setShowAccessModal(false);
                          setSelectedUser(null);
                        }
                      }}
                      disabled={already}
                      className={`w-full p-4 border rounded-lg text-left transition-colors ${
                        already
                          ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60'
                          : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-900">{project.name}</h4>
                          {project.description && (
                            <p className="text-sm text-slate-600 mt-1">{project.description}</p>
                          )}
                        </div>
                        {already && <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 ml-2" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-blue-600" /> Create User
                </h3>
                <p className="text-sm text-slate-500 mt-1">Admin creates an account with email and password</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
                disabled={creating}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="user@example.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={createForm.fullName}
                  onChange={e => setCreateForm(f => ({ ...f, fullName: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="At least 8 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1">Share this password with the user securely</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.makeAdmin}
                  onChange={e => setCreateForm(f => ({ ...f, makeAdmin: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <Shield className="w-4 h-4 text-blue-600" />
                Grant admin role
              </label>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCardsModal && cardsUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-200 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <LayoutGrid className="w-5 h-5 text-amber-600" /> Customise Dashboard Cards
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {users.find(u => u.id === cardsUserId)?.email} — toggle visibility and reorder
                </p>
              </div>
              <button
                onClick={() => { setShowCardsModal(false); setCardsUserId(null); }}
                className="text-slate-400 hover:text-slate-600"
                disabled={savingCards}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-1.5">
                {cardsDraft.order.map((id, idx) => {
                  const card = quickAccessCards.find(c => c.id === id);
                  if (!card) return null;
                  const hidden = cardsDraft.hidden.has(id);
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-2 p-3 rounded-lg border transition-colors ${
                        hidden ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex flex-col gap-0.5">
                        <button
                          onClick={() => moveCard(id, -1)}
                          disabled={idx === 0}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveCard(id, 1)}
                          disabled={idx === cardsDraft.order.length - 1}
                          className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                          aria-label="Move down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{card.name}</p>
                        <p className="text-xs text-slate-500 truncate">{card.category}</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={() => toggleCardHidden(id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        Visible
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={resetCardPrefs}
                disabled={savingCards}
                className="px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Reset to default
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setShowCardsModal(false); setCardsUserId(null); }}
                  disabled={savingCards}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveCardPrefs}
                  disabled={savingCards}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                  {savingCards ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
