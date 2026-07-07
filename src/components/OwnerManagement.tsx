import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Owner, OwnerProperty } from '../types';
import { Plus, Trash2, Loader2, Users, AlertCircle, UserPlus, Building2, CheckCircle, XCircle, Mail, Phone, User, Briefcase } from 'lucide-react';
import { getProperties, type Property } from '../lib/properties';

interface OwnerWithProperties extends Owner {
  properties: OwnerProperty[];
}

export const OwnerManagement: React.FC = () => {
  const [owners, setOwners] = useState<OwnerWithProperties[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showAddOwner, setShowAddOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({
    email: '',
    full_name: '',
    company_name: '',
    phone: '',
    approved_for_dac7: false,
    approved_for_portal: false,
    notes: '',
  });

  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedProperty, setSelectedProperty] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [addingOwner, setAddingOwner] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ownersRes, propList] = await Promise.all([
        supabase.rpc('get_all_owners_for_admin'),
        getProperties().catch(() => [] as Property[]),
      ]);

      if (ownersRes.error) throw ownersRes.error;

      const ownersData: Owner[] = ownersRes.data || [];
      setProperties(propList);

      const ownerPropertiesRes = await supabase
        .from('owner_properties')
        .select('*')
        .order('created_at');

      if (ownerPropertiesRes.error) throw ownerPropertiesRes.error;

      const ownerProperties: OwnerProperty[] = ownerPropertiesRes.data || [];

      const ownersWithProps: OwnerWithProperties[] = ownersData.map(owner => ({
        ...owner,
        properties: ownerProperties.filter(p => p.owner_id === owner.id),
      }));

      setOwners(ownersWithProps);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOwner = async () => {
    if (!newOwner.email.trim()) {
      setError('Email is required');
      return;
    }

    setAddingOwner(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.from('owners').insert({
        email: newOwner.email.trim().toLowerCase(),
        full_name: newOwner.full_name.trim() || null,
        company_name: newOwner.company_name.trim() || null,
        phone: newOwner.phone.trim() || null,
        approved_for_dac7: newOwner.approved_for_dac7,
        approved_for_portal: newOwner.approved_for_portal,
        notes: newOwner.notes.trim() || null,
      });

      if (error) throw error;

      setSuccess(`Owner ${newOwner.email} added successfully`);
      setNewOwner({
        email: '',
        full_name: '',
        company_name: '',
        phone: '',
        approved_for_dac7: false,
        approved_for_portal: false,
        notes: '',
      });
      setShowAddOwner(false);
      await fetchData();
    } catch (err: any) {
      if (err.code === '23505') {
        setError('An owner with this email already exists');
      } else {
        setError(err.message);
      }
    } finally {
      setAddingOwner(false);
    }
  };

  const handleToggleApproval = async (ownerId: string, field: 'approved_for_dac7' | 'approved_for_portal', currentValue: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase
        .from('owners')
        .update({ [field]: !currentValue })
        .eq('id', ownerId);

      if (error) throw error;

      const approvalType = field === 'approved_for_dac7' ? 'DAC7' : 'Portal';
      setSuccess(`${approvalType} access ${!currentValue ? 'granted' : 'revoked'}`);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddPropertyLink = async () => {
    if (!selectedOwnerId || !selectedProperty.trim()) return;

    setAddingLink(true);
    setError(null);
    setSuccess(null);

    try {
      const { error } = await supabase.from('owner_properties').insert({
        owner_id: selectedOwnerId,
        property_name: selectedProperty.trim(),
        display_name: selectedProperty.trim(),
      });

      if (error) throw error;

      setSuccess('Property access granted');
      setSelectedProperty('');
      setSelectedOwnerId('');
      await fetchData();
    } catch (err: any) {
      if (err.message?.includes('unique') || err.code === '23505') {
        setError('This owner already has access to that property');
      } else {
        setError(err.message);
      }
    } finally {
      setAddingLink(false);
    }
  };

  const handleRemovePropertyLink = async (id: string) => {
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.from('owner_properties').delete().eq('id', id);
      if (error) throw error;
      setSuccess('Property access removed');
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteOwner = async (ownerId: string, email: string) => {
    if (!confirm(`Delete owner ${email}? This will remove all their property links.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.from('owners').delete().eq('id', ownerId);
      if (error) throw error;
      setSuccess(`Owner ${email} deleted`);
      await fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-800">Owner Management</h2>
          </div>
          <p className="text-slate-500 text-sm">
            Unified owner list for Portal access and DAC7 reports. Add owners here once, use everywhere.
          </p>
        </div>
        <button
          onClick={() => setShowAddOwner(!showAddOwner)}
          className="flex items-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Owner
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}

      {showAddOwner && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800 mb-4">Add New Owner</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Mail className="w-3 h-3 inline mr-1" />
                Email *
              </label>
              <input
                type="email"
                value={newOwner.email}
                onChange={(e) => setNewOwner({ ...newOwner, email: e.target.value })}
                placeholder="owner@example.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <User className="w-3 h-3 inline mr-1" />
                Full Name
              </label>
              <input
                type="text"
                value={newOwner.full_name}
                onChange={(e) => setNewOwner({ ...newOwner, full_name: e.target.value })}
                placeholder="John Smith"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Briefcase className="w-3 h-3 inline mr-1" />
                Company Name
              </label>
              <input
                type="text"
                value={newOwner.company_name}
                onChange={(e) => setNewOwner({ ...newOwner, company_name: e.target.value })}
                placeholder="Acme Ltd"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                <Phone className="w-3 h-3 inline mr-1" />
                Phone
              </label>
              <input
                type="tel"
                value={newOwner.phone}
                onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value })}
                placeholder="+44 1234 567890"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
              Admin Notes
            </label>
            <textarea
              value={newOwner.notes}
              onChange={(e) => setNewOwner({ ...newOwner, notes: e.target.value })}
              placeholder="Internal notes about this owner..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newOwner.approved_for_portal}
                onChange={(e) => setNewOwner({ ...newOwner, approved_for_portal: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Approve for Owner Portal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newOwner.approved_for_dac7}
                onChange={(e) => setNewOwner({ ...newOwner, approved_for_dac7: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-slate-700">Approve for DAC7</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddOwner}
              disabled={addingOwner || !newOwner.email.trim()}
              className="flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {addingOwner ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Owner
            </button>
            <button
              onClick={() => setShowAddOwner(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-base font-semibold text-slate-800 mb-4">Grant Property Access</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Owner</label>
            {owners.length > 0 ? (
              <select
                value={selectedOwnerId}
                onChange={(e) => setSelectedOwnerId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select an owner...</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.full_name ? `${o.full_name} (${o.email})` : o.email}
                  </option>
                ))}
              </select>
            ) : (
              <div className="border border-slate-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-slate-400">No owners yet. Add an owner above.</p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Property</label>
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">Select a property...</option>
              {properties.map(p => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleAddPropertyLink}
              disabled={addingLink || !selectedOwnerId || !selectedProperty.trim()}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold px-4 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {addingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Grant Access
            </button>
          </div>
        </div>
      </div>

      {owners.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">No owners yet. Add your first owner above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {owners.map((owner) => (
            <div key={owner.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="text-base font-semibold text-slate-800">
                        {owner.full_name || owner.email}
                      </p>
                      {owner.has_account && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded">
                          <CheckCircle className="w-3 h-3" />
                          Has Account
                        </span>
                      )}
                    </div>
                    {owner.full_name && (
                      <p className="text-sm text-slate-500">{owner.email}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-slate-500">
                      {owner.company_name && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {owner.company_name}
                        </span>
                      )}
                      {owner.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {owner.phone}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        {owner.property_count || 0} {owner.property_count === 1 ? 'property' : 'properties'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleApproval(owner.id, 'approved_for_portal', owner.approved_for_portal)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        owner.approved_for_portal
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={owner.approved_for_portal ? 'Revoke Portal access' : 'Grant Portal access'}
                    >
                      {owner.approved_for_portal ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      Portal
                    </button>
                    <button
                      onClick={() => handleToggleApproval(owner.id, 'approved_for_dac7', owner.approved_for_dac7)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        owner.approved_for_dac7
                          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={owner.approved_for_dac7 ? 'Revoke DAC7 access' : 'Grant DAC7 access'}
                    >
                      {owner.approved_for_dac7 ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                      DAC7
                    </button>
                    <button
                      onClick={() => handleDeleteOwner(owner.id, owner.email)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1.5 rounded"
                      title="Delete owner"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {owner.notes && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-slate-600">
                    <strong>Notes:</strong> {owner.notes}
                  </div>
                )}
              </div>
              {owner.properties.length > 0 && (
                <div className="px-5 py-3 divide-y divide-slate-100">
                  {owner.properties.map(prop => (
                    <div key={prop.id} className="flex items-center justify-between py-2.5">
                      <span className="text-sm text-slate-700">{prop.property_name}</span>
                      <button
                        onClick={() => handleRemovePropertyLink(prop.id)}
                        className="text-slate-400 hover:text-red-600 transition-colors p-1 rounded"
                        title="Remove access"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
