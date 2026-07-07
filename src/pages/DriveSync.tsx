import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft,
  HardDrive,
  FolderSearch,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Download,
  RefreshCw,
  Search,
  Zap,
  ChevronDown,
  ChevronRight,
  Building2,
  Settings,
  Link,
  Folder,
  RotateCcw,
  Square,
  CheckSquare,
  Pencil,
  Eye,
  EyeOff,
  Calendar,
  Save,
  X,
} from 'lucide-react';

interface QueueItem {
  id: string;
  file_name: string;
  mime_type: string;
  status: 'pending' | 'processing' | 'matched' | 'needs_review' | 'filed' | 'error';
  matched_property_name: string | null;
  matched_property_id: string | null;
  detected_doc_type: string | null;
  detected_expiry_date: string | null;
  confidence_score: number;
  error_message: string | null;
  subfolder_path: string | null;
  created_at: string;
  processed_at: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface DriveFolder {
  id: string;
  name: string;
}

interface FiledReport {
  id: string;
  property_name: string;
  property_id: string | null;
  file_name: string;
  file_type: string;
  storage_path: string;
  is_safety_document: boolean;
  safety_document_type: string | null;
  expiry_date: string | null;
  is_public: boolean | null;
  created_at: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  stl_licence: 'STL Licence',
  eicr: 'EICR',
  pat: 'PAT Certificate',
  gas_safety: 'Gas Safety',
  fire_risk_assessment: 'Fire Risk Assessment',
  insurance: 'Insurance',
  inventory: 'Inventory',
  other: 'Other',
};

const DOC_TYPE_COLORS: Record<string, string> = {
  stl_licence: 'bg-blue-100 text-blue-700 border-blue-200',
  eicr: 'bg-amber-100 text-amber-700 border-amber-200',
  pat: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  gas_safety: 'bg-orange-100 text-orange-700 border-orange-200',
  fire_risk_assessment: 'bg-red-100 text-red-700 border-red-200',
  insurance: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  inventory: 'bg-slate-100 text-slate-700 border-slate-200',
  other: 'bg-gray-100 text-gray-600 border-gray-200',
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

type ViewMode = 'properties' | 'unmatched' | 'filed' | 'browse';

interface BrowseItem {
  id: string;
  name: string;
  mimeType?: string;
  size?: string | null;
}

export default function DriveSync() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [scanning, setScanning] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [filing, setFiling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('properties');
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [useVision, setUseVision] = useState(true);
  const [editingItem, setEditingItem] = useState<string | null>(null);

  // Folder config
  const [savedFolderId, setSavedFolderId] = useState('');
  const [folderIdInput, setFolderIdInput] = useState('');
  const [showFolderConfig, setShowFolderConfig] = useState(false);

  // Folder browser
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [browseFolders, setBrowseFolders] = useState<DriveFolder[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());

  // Filed documents (from generated_reports)
  const [filedReports, setFiledReports] = useState<FiledReport[]>([]);
  const [editingReport, setEditingReport] = useState<string | null>(null);
  const [expandedFiledProperties, setExpandedFiledProperties] = useState<Set<string>>(new Set());

  // Manual browse state
  const [browsePropertyId, setBrowsePropertyId] = useState<string | null>(null);
  const [browsePropertyName, setBrowsePropertyName] = useState('');
  const [browsePath, setBrowsePath] = useState<{ id: string; name: string }[]>([]);
  const [browseCurrentFolders, setBrowseCurrentFolders] = useState<BrowseItem[]>([]);
  const [browseCurrentFiles, setBrowseCurrentFiles] = useState<BrowseItem[]>([]);
  const [browseSelectedFiles, setBrowseSelectedFiles] = useState<Set<string>>(new Set());
  const [browseNavigating, setBrowseNavigating] = useState(false);
  const [browseQueuing, setBrowseQueuing] = useState(false);

  const loadQueue = useCallback(async () => {
    const { data } = await supabase
      .from('drive_sync_queue')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setQueue(data);
  }, []);

  const loadProperties = useCallback(async () => {
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setProperties(data);
  }, []);

  const loadSavedFolder = useCallback(async () => {
    const { data } = await supabase
      .from('drive_sync_folders')
      .select('folder_id')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.folder_id) {
      setSavedFolderId(data.folder_id);
      setFolderIdInput(data.folder_id);
    }
  }, []);

  const loadFiledReports = useCallback(async () => {
    const { data } = await supabase
      .from('generated_reports')
      .select('id, property_name, property_id, file_name, file_type, storage_path, is_safety_document, safety_document_type, expiry_date, is_public, created_at')
      .eq('file_type', 'uploaded')
      .order('created_at', { ascending: false });
    if (data) setFiledReports(data as FiledReport[]);
  }, []);

  useEffect(() => {
    loadQueue();
    loadProperties();
    loadSavedFolder();
    loadFiledReports();
  }, [loadQueue, loadProperties, loadSavedFolder, loadFiledReports]);

  const handleBrowseFolder = async () => {
    const fid = savedFolderId || folderIdInput.trim();
    if (!fid) {
      setShowFolderConfig(true);
      return;
    }
    setBrowseLoading(true);
    setError(null);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'list_folders', folderId: fid }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to list folders');
      setBrowseFolders(data.folders || []);
      setSelectedFolders(new Set((data.folders || []).map((f: DriveFolder) => f.id)));
      setShowFolderBrowser(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBrowseLoading(false);
    }
  };

  const handleScanSelected = async () => {
    const fid = savedFolderId || folderIdInput.trim();
    if (!fid) return;
    if (selectedFolders.size === 0) {
      setError('Select at least one property folder to scan.');
      return;
    }

    setScanning(true);
    setError(null);
    setSuccess(null);
    setShowFolderBrowser(false);

    const propertyFolderIds = browseFolders
      .filter(f => selectedFolders.has(f.id))
      .map(f => ({ id: f.id, name: f.name }));

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'scan',
          folderId: fid,
          folderName: 'Property Documents',
          subfolderFilter: ['compliance'],
          propertyFolderIds,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Scan failed');
      setSuccess(`Scanned ${propertyFolderIds.length} folders. Found ${data.total_files} files, ${data.new_files} new queued.`);
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleScanAll = async () => {
    const fid = savedFolderId || folderIdInput.trim();
    if (!fid) {
      setShowFolderConfig(true);
      return;
    }
    setScanning(true);
    setError(null);
    setSuccess(null);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'scan',
          folderId: fid,
          folderName: 'Property Documents',
          subfolderFilter: ['compliance'],
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Scan failed');
      setSuccess(`Found ${data.total_files} files, ${data.new_files} new queued for processing.`);
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setScanning(false);
    }
  };

  const handleClassifyAll = async () => {
    const pendingIds = queue
      .filter(q => q.status === 'pending' || q.status === 'needs_review')
      .map(q => q.id);
    if (pendingIds.length === 0) return;
    setClassifying(true);
    setError(null);

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/classify-drive-document`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'classify_batch', queueItemIds: pendingIds, useVision }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Classification failed');
      setSuccess(`Classified ${pendingIds.length} documents.`);
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClassifying(false);
    }
  };

  const handleFileItem = async (itemId: string) => {
    setFiling(prev => new Set(prev).add(itemId));
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'download_and_store', queueItemId: itemId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Filing failed');
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFiling(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleFileAllMatched = async () => {
    const matchedItems = queue.filter(q => q.status === 'matched');
    if (matchedItems.length === 0) return;
    for (const item of matchedItems) {
      await handleFileItem(item.id);
    }
    setSuccess(`Filed ${matchedItems.length} documents.`);
  };

  const handleResetSession = async () => {
    const nonFiledCount = queue.filter(q => q.status !== 'filed').length;
    if (nonFiledCount === 0) return;
    if (!confirm(`Reset session? This will clear ${nonFiledCount} items (pending, matched, review, errors). Filed documents are kept.`)) return;
    const { error: rpcError } = await supabase.rpc('reset_drive_sync_session');
    if (rpcError) {
      setError(`Failed to reset: ${rpcError.message}`);
      return;
    }
    setSuccess('Session reset. All non-filed items cleared.');
    await loadQueue();
  };

  const handleUpdateItem = async (itemId: string, updates: Partial<QueueItem>) => {
    await supabase.from('drive_sync_queue').update(updates).eq('id', itemId);
    setEditingItem(null);
    await loadQueue();
  };

  const handleUpdateReport = async (reportId: string, updates: Partial<FiledReport>) => {
    const { error: updateErr } = await supabase.from('generated_reports').update(updates).eq('id', reportId);
    if (updateErr) {
      setError(`Failed to update: ${updateErr.message}`);
      return;
    }
    setEditingReport(null);
    await loadFiledReports();
    setSuccess('Document updated.');
  };

  const handleSaveFolder = async () => {
    const fid = folderIdInput.trim();
    if (!fid) return;
    await supabase.from('drive_sync_folders').upsert(
      { folder_id: fid, folder_name: 'Property Documents' },
      { onConflict: 'folder_id' }
    );
    setSavedFolderId(fid);
    setShowFolderConfig(false);
  };

  // Manual browse functions
  const handleBrowseRoot = async () => {
    const fid = savedFolderId || folderIdInput.trim();
    if (!fid) return;
    setBrowsePropertyName('');
    setBrowsePropertyId(null);
    setBrowsePath([{ id: fid, name: 'All Properties' }]);
    setBrowseSelectedFiles(new Set());
    await navigateToFolder(fid);
  };

  const navigateToFolder = async (targetFolderId: string) => {
    setBrowseNavigating(true);
    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'browse', folderId: targetFolderId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Browse failed');
      setBrowseCurrentFolders(data.folders || []);
      setBrowseCurrentFiles(data.files || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBrowseNavigating(false);
    }
  };

  const handleBrowseNavigateInto = async (folder: BrowseItem) => {
    setBrowsePath(prev => [...prev, { id: folder.id, name: folder.name }]);
    await navigateToFolder(folder.id);
  };

  const handleBrowseNavigateBack = async (index: number) => {
    if (index < 0) {
      setBrowsePath([]);
      setBrowseCurrentFolders([]);
      setBrowseCurrentFiles([]);
      setBrowseSelectedFiles(new Set());
      return;
    }
    const newPath = browsePath.slice(0, index + 1);
    setBrowsePath(newPath);
    await navigateToFolder(newPath[newPath.length - 1].id);
  };

  const handleBrowseQueueFiles = async () => {
    if (browseSelectedFiles.size === 0) return;
    setBrowseQueuing(true);
    setError(null);

    const selectedFiles = browseCurrentFiles.filter(f => browseSelectedFiles.has(f.id));
    const subfolderPath = browsePath.map(p => p.name).join('/');
    const fid = savedFolderId || folderIdInput.trim();

    try {
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/google-drive-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'queue_files',
          folderId: fid,
          folderName: 'Property Documents',
          files: selectedFiles.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
          propertyName: browsePropertyName,
          propertyId: browsePropertyId,
          subfolderPath,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Queue failed');
      setSuccess(`Queued ${data.queued} files for ${browsePropertyName}.${data.already_exists > 0 ? ` ${data.already_exists} already in queue.` : ''}`);
      setBrowseSelectedFiles(new Set());
      await loadQueue();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBrowseQueuing(false);
    }
  };

  // Group items by property
  const groupedByProperty = queue.reduce<Record<string, QueueItem[]>>((acc, item) => {
    if (item.status === 'filed') return acc;
    const key = item.matched_property_name || '__unmatched__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const unmatchedItems = groupedByProperty['__unmatched__'] || [];
  const propertyGroups = Object.entries(groupedByProperty)
    .filter(([key]) => key !== '__unmatched__')
    .sort(([a], [b]) => a.localeCompare(b));

  const filteredPropertyGroups = searchTerm
    ? propertyGroups.filter(([name, items]) =>
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        items.some(i => i.file_name.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : propertyGroups;

  const filteredUnmatched = searchTerm
    ? unmatchedItems.filter(i => i.file_name.toLowerCase().includes(searchTerm.toLowerCase()))
    : unmatchedItems;

  const counts = {
    pending: queue.filter(q => q.status === 'pending').length,
    matched: queue.filter(q => q.status === 'matched').length,
    needs_review: queue.filter(q => q.status === 'needs_review').length,
    filed: filedReports.length,
    total: queue.length,
    active: queue.filter(q => q.status !== 'filed').length,
  };

  const toggleProperty = (name: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedProperties(new Set(filteredPropertyGroups.map(([name]) => name)));
  };

  const toggleFolderSelection = (folderId: string) => {
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const hasActiveItems = counts.active > 0;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <a
                href="/"
                className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors text-slate-600 hover:text-slate-900"
                title="Back to Dashboard"
              >
                <ArrowLeft className="w-4 h-4" />
              </a>
              <div className="w-9 h-9 bg-teal-600 rounded-lg flex items-center justify-center">
                <HardDrive className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 leading-none">Drive Document Sync</p>
                <p className="text-xs text-slate-500 mt-0.5">Import compliance documents from Google Drive</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasActiveItems && (
                <button
                  onClick={handleResetSession}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  title="Clear all pending/unmatched and start fresh"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  New Session
                </button>
              )}
              <button
                onClick={() => setShowFolderConfig(!showFolderConfig)}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                title="Configure folder"
              >
                <Settings className="w-3.5 h-3.5" />
                {savedFolderId ? 'Connected' : 'Setup'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Folder Config (collapsible) */}
        {showFolderConfig && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <Link className="w-4 h-4 text-teal-600" />
              Google Drive Folder Connection
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Paste the ID of your top-level property documents folder. This is the folder that contains
              a subfolder for each property (e.g. "The Bellhouse", "Eagle Lodge").
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={folderIdInput}
                onChange={(e) => setFolderIdInput(e.target.value)}
                placeholder="Google Drive folder ID"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
              />
              <button
                onClick={handleSaveFolder}
                disabled={!folderIdInput.trim()}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
            {savedFolderId && (
              <p className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Connected: {savedFolderId.slice(0, 24)}...
              </p>
            )}
          </div>
        )}

        {/* Alerts */}
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
            <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
        {success && (
          <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-600">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Workflow Actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
            {/* Scan options */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleBrowseFolder}
                disabled={scanning || browseLoading || (!savedFolderId && !folderIdInput.trim())}
                className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {browseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                Choose Properties to Scan
              </button>
              <button
                onClick={handleScanAll}
                disabled={scanning || (!savedFolderId && !folderIdInput.trim())}
                className="flex items-center gap-2 px-4 py-2.5 text-teal-700 bg-teal-50 border border-teal-200 text-sm font-medium rounded-lg hover:bg-teal-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                {scanning ? 'Scanning...' : 'Scan All'}
              </button>
            </div>

            {/* Classify */}
            <button
              onClick={handleClassifyAll}
              disabled={classifying || counts.pending + counts.needs_review === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {classifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              {classifying ? 'Classifying...' : `Classify ${counts.pending + counts.needs_review}`}
            </button>

            {/* File All */}
            <button
              onClick={handleFileAllMatched}
              disabled={counts.matched === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              File {counts.matched} Matched
            </button>

            <div className="sm:ml-auto flex items-center gap-2">
              <button
                onClick={loadQueue}
                className="p-2 text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Vision toggle */}
          <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
            <button
              onClick={() => setUseVision(!useVision)}
              className={`relative w-8 h-[18px] rounded-full transition-colors ${useVision ? 'bg-teal-600' : 'bg-slate-300'}`}
            >
              <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${useVision ? 'translate-x-[14px]' : ''}`} />
            </button>
            <span className="text-xs text-slate-600">
              {useVision ? 'AI Vision enabled (reads document content)' : 'Filename-only mode (faster, less accurate)'}
            </span>
          </div>
        </div>

        {/* Folder Browser Modal */}
        {showFolderBrowser && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Select Properties to Scan</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pick which property folders to import compliance documents from.
                  {selectedFolders.size > 0 && (
                    <span className="ml-1 font-medium text-teal-600">{selectedFolders.size} selected</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedFolders.size === browseFolders.length) {
                      setSelectedFolders(new Set());
                    } else {
                      setSelectedFolders(new Set(browseFolders.map(f => f.id)));
                    }
                  }}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors"
                >
                  {selectedFolders.size === browseFolders.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                {browseFolders.map(folder => {
                  const isSelected = selectedFolders.has(folder.id);
                  return (
                    <button
                      key={folder.id}
                      onClick={() => toggleFolderSelection(folder.id)}
                      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${
                        isSelected
                          ? 'bg-teal-50 border border-teal-200 text-teal-800'
                          : 'bg-slate-50 border border-transparent hover:border-slate-200 text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      )}
                      <Folder className="w-4 h-4 flex-shrink-0 text-slate-400" />
                      <span className="text-sm font-medium truncate">{folder.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <button
                onClick={() => setShowFolderBrowser(false)}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScanSelected}
                disabled={selectedFolders.size === 0 || scanning}
                className="flex items-center gap-2 px-5 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                Scan {selectedFolders.size} {selectedFolders.size === 1 ? 'Property' : 'Properties'}
              </button>
            </div>
          </div>
        )}

        {/* Status Summary */}
        {queue.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Active', value: counts.active, color: 'bg-slate-100 text-slate-700' },
              { label: 'Pending', value: counts.pending, color: 'bg-slate-100 text-slate-600' },
              { label: 'Matched', value: counts.matched, color: 'bg-emerald-50 text-emerald-700' },
              { label: 'Needs Review', value: counts.needs_review, color: 'bg-amber-50 text-amber-700' },
              { label: 'Filed', value: counts.filed, color: 'bg-teal-50 text-teal-700' },
            ].map(s => (
              <div key={s.label} className={`${s.color} rounded-lg px-4 py-3 text-center`}>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* View Tabs + Search */}
        {queue.length > 0 && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {([
                { key: 'properties' as ViewMode, label: 'By Property', count: propertyGroups.length },
                { key: 'unmatched' as ViewMode, label: 'Unmatched', count: unmatchedItems.length },
                { key: 'browse' as ViewMode, label: 'Browse Drive', count: null },
                { key: 'filed' as ViewMode, label: 'Document Manager', count: filedReports.length },
              ]).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setViewMode(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                    viewMode === tab.key
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className={`min-w-[1.25rem] px-1 py-0.5 rounded text-[10px] font-bold ${
                      viewMode === tab.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search properties or files..."
                className="w-full pl-9 pr-8 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none bg-white"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              )}
            </div>

            {viewMode === 'properties' && filteredPropertyGroups.length > 0 && (
              <button
                onClick={expandAll}
                className="text-xs text-teal-600 hover:text-teal-700 font-medium"
              >
                Expand all
              </button>
            )}
          </div>
        )}

        {/* Property-Grouped View */}
        {viewMode === 'properties' && (
          <div className="space-y-3">
            {filteredPropertyGroups.map(([propertyName, items]) => {
              const isExpanded = expandedProperties.has(propertyName);
              const matchedCount = items.filter(i => i.status === 'matched').length;
              const reviewCount = items.filter(i => i.status === 'needs_review').length;
              const pendingCount = items.filter(i => i.status === 'pending').length;

              return (
                <div key={propertyName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => toggleProperty(propertyName)}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                    <Building2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
                    <span className="font-semibold text-sm text-slate-900 flex-1">{propertyName}</span>

                    <div className="flex items-center gap-2">
                      {matchedCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          {matchedCount} ready
                        </span>
                      )}
                      {reviewCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <AlertTriangle className="w-3 h-3" />
                          {reviewCount} review
                        </span>
                      )}
                      {pendingCount > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          {pendingCount} pending
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{items.length} docs</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-100">
                      <div className="divide-y divide-slate-50">
                        {items.map(item => (
                          <DocumentRow
                            key={item.id}
                            item={item}
                            properties={properties}
                            isEditing={editingItem === item.id}
                            isFiling={filing.has(item.id)}
                            onEdit={() => setEditingItem(item.id)}
                            onCancelEdit={() => setEditingItem(null)}
                            onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                            onFile={() => handleFileItem(item.id)}
                          />
                        ))}
                      </div>
                      {matchedCount > 0 && (
                        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
                          <button
                            onClick={async () => {
                              for (const item of items.filter(i => i.status === 'matched')) {
                                await handleFileItem(item.id);
                              }
                            }}
                            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            File all {matchedCount} matched for {propertyName}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredPropertyGroups.length === 0 && queue.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
                <p className="text-sm text-slate-500">
                  {searchTerm ? 'No properties match your search.' : 'No documents matched to properties yet. Run Classify to sort them.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Unmatched View */}
        {viewMode === 'unmatched' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {filteredUnmatched.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredUnmatched.map(item => (
                  <DocumentRow
                    key={item.id}
                    item={item}
                    properties={properties}
                    isEditing={editingItem === item.id}
                    isFiling={filing.has(item.id)}
                    onEdit={() => setEditingItem(item.id)}
                    onCancelEdit={() => setEditingItem(null)}
                    onUpdate={(updates) => handleUpdateItem(item.id, updates)}
                    onFile={() => handleFileItem(item.id)}
                    showPropertyAssign
                  />
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-slate-500">All documents are matched to properties.</p>
              </div>
            )}
          </div>
        )}

        {/* Browse Drive View */}
        {viewMode === 'browse' && (
          <ManualBrowseView
            savedFolderId={savedFolderId || folderIdInput.trim()}
            properties={properties}
            browsePath={browsePath}
            browseCurrentFolders={browseCurrentFolders}
            browseCurrentFiles={browseCurrentFiles}
            browseSelectedFiles={browseSelectedFiles}
            browseNavigating={browseNavigating}
            browseQueuing={browseQueuing}
            browsePropertyName={browsePropertyName}
            onSelectProperty={(id, name) => {
              setBrowsePropertyId(id);
              setBrowsePropertyName(name);
            }}
            onBrowseRoot={handleBrowseRoot}
            onNavigateInto={handleBrowseNavigateInto}
            onNavigateBack={handleBrowseNavigateBack}
            onToggleFile={(fileId) => {
              setBrowseSelectedFiles(prev => {
                const next = new Set(prev);
                if (next.has(fileId)) next.delete(fileId);
                else next.add(fileId);
                return next;
              });
            }}
            onSelectAllFiles={() => {
              setBrowseSelectedFiles(new Set(browseCurrentFiles.map(f => f.id)));
            }}
            onDeselectAllFiles={() => setBrowseSelectedFiles(new Set())}
            onQueueFiles={handleBrowseQueueFiles}
          />
        )}

        {/* Filed View - Document Browser */}
        {viewMode === 'filed' && (
          <FiledDocumentBrowser
            reports={filedReports}
            properties={properties}
            editingReport={editingReport}
            expandedProperties={expandedFiledProperties}
            searchTerm={searchTerm}
            onToggleProperty={(name) => {
              setExpandedFiledProperties(prev => {
                const next = new Set(prev);
                if (next.has(name)) next.delete(name);
                else next.add(name);
                return next;
              });
            }}
            onExpandAll={(names) => setExpandedFiledProperties(new Set(names))}
            onEdit={setEditingReport}
            onCancelEdit={() => setEditingReport(null)}
            onUpdate={handleUpdateReport}
          />
        )}

        {/* Empty State */}
        {queue.length === 0 && !showFolderConfig && !showFolderBrowser && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
            <HardDrive className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">Ready to import documents</h3>
            <p className="text-sm text-slate-500 max-w-lg mx-auto mb-6">
              Connect your Google Drive folder, then choose which properties to scan.
              The AI will read each document, match it to the correct property, and prepare it for filing.
            </p>
            {!savedFolderId ? (
              <button
                onClick={() => setShowFolderConfig(true)}
                className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors"
              >
                Connect Google Drive Folder
              </button>
            ) : (
              <button
                onClick={handleBrowseFolder}
                disabled={browseLoading}
                className="px-5 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition-colors flex items-center gap-2 mx-auto"
              >
                {browseLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSearch className="w-4 h-4" />}
                Choose Properties to Scan
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function DocumentRow({
  item,
  properties,
  isEditing,
  isFiling,
  onEdit,
  onCancelEdit,
  onUpdate,
  onFile,
  showPropertyAssign,
}: {
  item: QueueItem;
  properties: Property[];
  isEditing: boolean;
  isFiling: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updates: Partial<QueueItem>) => void;
  onFile: () => void;
  showPropertyAssign?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-left w-full"
          >
            <p className="text-sm font-medium text-slate-800 truncate">{item.file_name}</p>
            {item.subfolder_path && (
              <p className="text-[11px] text-teal-600 truncate">/{item.subfolder_path}</p>
            )}
          </button>
        </div>

        {/* Doc Type Badge */}
        {item.detected_doc_type && (
          <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${DOC_TYPE_COLORS[item.detected_doc_type] || DOC_TYPE_COLORS.other}`}>
            {DOC_TYPE_LABELS[item.detected_doc_type] || item.detected_doc_type}
          </span>
        )}

        {/* Expiry */}
        {item.detected_expiry_date && (
          <span className="hidden sm:block text-xs text-slate-500">{item.detected_expiry_date}</span>
        )}

        {/* Confidence */}
        {item.confidence_score > 0 && (
          <div className="hidden sm:flex items-center gap-1">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  item.confidence_score >= 0.7 ? 'bg-emerald-500' :
                  item.confidence_score >= 0.4 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${item.confidence_score * 100}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 w-7">{Math.round(item.confidence_score * 100)}%</span>
          </div>
        )}

        {/* Status */}
        {item.status === 'pending' && (
          <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Pending</span>
        )}
        {item.status === 'needs_review' && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">Review</span>
        )}
        {item.status === 'error' && (
          <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">Error</span>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {(item.status === 'needs_review' || item.status === 'matched' || showPropertyAssign) && !isEditing && (
            <button
              onClick={onEdit}
              className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded hover:bg-slate-50 transition-colors"
            >
              Edit
            </button>
          )}
          {item.status === 'matched' && (
            <button
              onClick={onFile}
              disabled={isFiling}
              className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-1"
            >
              {isFiling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              File
            </button>
          )}
        </div>
      </div>

      {/* Expanded / Edit state */}
      {(expanded || isEditing) && (
        <div className="mt-3 pl-0 sm:pl-4 space-y-2">
          {item.error_message && (
            <div className={`px-3 py-2 rounded-md text-xs ${
              item.status === 'error'
                ? 'bg-red-50 border border-red-100 text-red-700'
                : 'bg-blue-50 border border-blue-100 text-blue-800'
            }`}>
              <span className="font-semibold">{item.status === 'error' ? 'Error' : 'AI Reasoning'}:</span>{' '}
              {item.error_message}
            </div>
          )}

          {isEditing && (
            <EditQueueItemForm
              item={item}
              properties={properties}
              onUpdate={onUpdate}
              onCancelEdit={onCancelEdit}
            />
          )}
        </div>
      )}
    </div>
  );
}

function EditQueueItemForm({
  item,
  properties,
  onUpdate,
  onCancelEdit,
}: {
  item: QueueItem;
  properties: Property[];
  onUpdate: (updates: Partial<QueueItem>) => void;
  onCancelEdit: () => void;
}) {
  const [editProp, setEditProp] = useState(item.matched_property_name || '');
  const [editDocType, setEditDocType] = useState(item.detected_doc_type || '');

  const handleSave = () => {
    const updates: Partial<QueueItem> = {};
    const prop = properties.find(p => p.name === editProp);
    if (prop) {
      updates.matched_property_name = prop.name;
      (updates as any).matched_property_id = prop.id;
      updates.status = 'matched';
    }
    if (editDocType !== (item.detected_doc_type || '')) {
      (updates as any).detected_doc_type = editDocType || null;
    }
    if (Object.keys(updates).length > 0) {
      onUpdate(updates);
    } else {
      onCancelEdit();
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 bg-slate-50 rounded-lg p-3">
      <div className="min-w-[180px]">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Property</label>
        <select
          value={editProp}
          onChange={(e) => setEditProp(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
        >
          <option value="">-- Select property --</option>
          {properties.map(p => (
            <option key={p.id} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      <div className="min-w-[150px]">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Doc Type</label>
        <select
          value={editDocType}
          onChange={(e) => setEditDocType(e.target.value)}
          className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
        >
          <option value="">-- Select type --</option>
          {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleSave}
        className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-600 rounded hover:bg-teal-700 transition-colors flex items-center gap-1"
      >
        <Save className="w-3 h-3" />
        Save
      </button>
      <button
        onClick={onCancelEdit}
        className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded hover:bg-white transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

function ManualBrowseView({
  savedFolderId,
  properties,
  browsePath,
  browseCurrentFolders,
  browseCurrentFiles,
  browseSelectedFiles,
  browseNavigating,
  browseQueuing,
  browsePropertyName,
  onSelectProperty,
  onBrowseRoot,
  onNavigateInto,
  onNavigateBack,
  onToggleFile,
  onSelectAllFiles,
  onDeselectAllFiles,
  onQueueFiles,
}: {
  savedFolderId: string;
  properties: Property[];
  browsePath: { id: string; name: string }[];
  browseCurrentFolders: BrowseItem[];
  browseCurrentFiles: BrowseItem[];
  browseSelectedFiles: Set<string>;
  browseNavigating: boolean;
  browseQueuing: boolean;
  browsePropertyName: string;
  onSelectProperty: (id: string, name: string) => void;
  onBrowseRoot: () => void;
  onNavigateInto: (folder: BrowseItem) => void;
  onNavigateBack: (index: number) => void;
  onToggleFile: (fileId: string) => void;
  onSelectAllFiles: () => void;
  onDeselectAllFiles: () => void;
  onQueueFiles: () => void;
}) {
  const [selectedPropId, setSelectedPropId] = useState('');
  const isInsideFolder = browsePath.length > 0;

  // Auto-browse root when tab is shown and not already browsing
  useEffect(() => {
    if (!isInsideFolder && savedFolderId) {
      onBrowseRoot();
    }
  }, []);

  // Not connected
  if (!savedFolderId) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <HardDrive className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Connect a Google Drive folder first using the Setup button above.</p>
      </div>
    );
  }

  // Loading state before content appears
  if (!isInsideFolder && browseNavigating) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Loading Drive folder...</p>
      </div>
    );
  }

  if (!isInsideFolder) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin mx-auto mb-2" />
        <p className="text-sm text-slate-500">Opening folder...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Breadcrumb */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 flex-wrap">
          {browsePath.map((segment, idx) => (
            <span key={segment.id} className="flex items-center gap-1.5">
              {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-400" />}
              {idx === browsePath.length - 1 ? (
                <span className="text-xs font-semibold text-slate-800">{segment.name}</span>
              ) : (
                <button
                  onClick={() => onNavigateBack(idx)}
                  className="text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
                >
                  {segment.name}
                </button>
              )}
            </span>
          ))}
          {browseNavigating && <Loader2 className="w-3.5 h-3.5 text-teal-500 animate-spin ml-2" />}
        </div>

        {/* Property assignment bar */}
        <div className="px-5 py-2 bg-teal-50 border-b border-teal-100 flex items-center gap-2 flex-wrap">
          <Building2 className="w-3.5 h-3.5 text-teal-600 flex-shrink-0" />
          <span className="text-xs font-medium text-teal-800">Assign queued files to:</span>
          <select
            value={selectedPropId}
            onChange={(e) => {
              setSelectedPropId(e.target.value);
              const prop = properties.find(p => p.id === e.target.value);
              if (prop) onSelectProperty(prop.id, prop.name);
              else onSelectProperty('', '');
            }}
            className="px-2 py-1 border border-teal-200 rounded text-xs bg-white text-slate-800 max-w-xs"
          >
            <option value="">Select property...</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {browsePropertyName && !selectedPropId && (
            <span className="text-xs text-teal-700 font-medium">({browsePropertyName})</span>
          )}
        </div>

        {/* Content */}
        <div className="divide-y divide-slate-50">
          {/* Subfolders */}
          {browseCurrentFolders.map(folder => (
            <button
              key={folder.id}
              onClick={() => onNavigateInto(folder)}
              disabled={browseNavigating}
              className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left disabled:opacity-50"
            >
              <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <span className="text-sm font-medium text-slate-800">{folder.name}</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto" />
            </button>
          ))}

          {/* Files */}
          {browseCurrentFiles.length > 0 && browseCurrentFolders.length > 0 && (
            <div className="px-5 py-2 bg-slate-50">
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Files</span>
            </div>
          )}
          {browseCurrentFiles.map(file => {
            const isSelected = browseSelectedFiles.has(file.id);
            return (
              <button
                key={file.id}
                onClick={() => onToggleFile(file.id)}
                className={`w-full flex items-center gap-3 px-5 py-3 transition-colors text-left ${
                  isSelected ? 'bg-teal-50' : 'hover:bg-slate-50'
                }`}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-teal-600 flex-shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-300 flex-shrink-0" />
                )}
                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-sm text-slate-800 flex-1 truncate">{file.name}</span>
                {file.size && (
                  <span className="text-[10px] text-slate-400">
                    {(parseInt(file.size) / 1024).toFixed(0)} KB
                  </span>
                )}
              </button>
            );
          })}

          {/* Empty state */}
          {!browseNavigating && browseCurrentFolders.length === 0 && browseCurrentFiles.length === 0 && (
            <div className="p-8 text-center">
              <FileText className="w-6 h-6 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">This folder is empty.</p>
            </div>
          )}
        </div>

        {/* Action bar */}
        {browseCurrentFiles.length > 0 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={browseSelectedFiles.size === browseCurrentFiles.length ? onDeselectAllFiles : onSelectAllFiles}
                className="text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {browseSelectedFiles.size === browseCurrentFiles.length ? 'Deselect All' : 'Select All'}
              </button>
              {browseSelectedFiles.size > 0 && (
                <span className="text-xs text-teal-600 font-medium">{browseSelectedFiles.size} selected</span>
              )}
            </div>
            <button
              onClick={onQueueFiles}
              disabled={browseSelectedFiles.size === 0 || browseQueuing}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-xs font-semibold rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {browseQueuing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Queue {browseSelectedFiles.size} {browseSelectedFiles.size === 1 ? 'File' : 'Files'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FiledDocumentBrowser({
  reports,
  properties,
  editingReport,
  expandedProperties,
  searchTerm,
  onToggleProperty,
  onExpandAll,
  onEdit,
  onCancelEdit,
  onUpdate,
}: {
  reports: FiledReport[];
  properties: Property[];
  editingReport: string | null;
  expandedProperties: Set<string>;
  searchTerm: string;
  onToggleProperty: (name: string) => void;
  onExpandAll: (names: string[]) => void;
  onEdit: (id: string) => void;
  onCancelEdit: () => void;
  onUpdate: (id: string, updates: Partial<FiledReport>) => void;
}) {
  const grouped = reports.reduce<Record<string, FiledReport[]>>((acc, r) => {
    const key = r.property_name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});

  const propertyGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  const filtered = searchTerm
    ? propertyGroups.filter(([name, items]) =>
        name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        items.some(i => i.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (i.safety_document_type && DOC_TYPE_LABELS[i.safety_document_type]?.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      )
    : propertyGroups;

  if (reports.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No documents have been filed yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filtered.length > 3 && (
        <div className="flex justify-end">
          <button
            onClick={() => onExpandAll(filtered.map(([name]) => name))}
            className="text-xs text-teal-600 hover:text-teal-700 font-medium"
          >
            Expand all
          </button>
        </div>
      )}

      {filtered.map(([propertyName, items]) => {
        const isExpanded = expandedProperties.has(propertyName);
        const publicCount = items.filter(i => i.is_public).length;
        const docTypes = [...new Set(items.filter(i => i.safety_document_type).map(i => i.safety_document_type!))];

        return (
          <div key={propertyName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              onClick={() => onToggleProperty(propertyName)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50/50 transition-colors text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              )}
              <Building2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <span className="font-semibold text-sm text-slate-900 flex-1">{propertyName}</span>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {docTypes.slice(0, 3).map(dt => (
                  <span key={dt} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${DOC_TYPE_COLORS[dt] || DOC_TYPE_COLORS.other}`}>
                    {DOC_TYPE_LABELS[dt] || dt}
                  </span>
                ))}
                {docTypes.length > 3 && (
                  <span className="text-[10px] text-slate-400">+{docTypes.length - 3}</span>
                )}
                <span className="text-xs text-slate-400 ml-1">{items.length} docs</span>
                {publicCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600">
                    <Eye className="w-3 h-3" />
                    {publicCount}
                  </span>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {items.map(report => (
                  <FiledReportRow
                    key={report.id}
                    report={report}
                    properties={properties}
                    isEditing={editingReport === report.id}
                    onEdit={() => onEdit(report.id)}
                    onCancelEdit={onCancelEdit}
                    onUpdate={(updates) => onUpdate(report.id, updates)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-sm text-slate-500">No filed documents match your search.</p>
        </div>
      )}
    </div>
  );
}

function FiledReportRow({
  report,
  properties,
  isEditing,
  onEdit,
  onCancelEdit,
  onUpdate,
}: {
  report: FiledReport;
  properties: Property[];
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (updates: Partial<FiledReport>) => void;
}) {
  const [editProperty, setEditProperty] = useState(report.property_name);
  const [editDocType, setEditDocType] = useState(report.safety_document_type || '');
  const [editExpiry, setEditExpiry] = useState(report.expiry_date || '');
  const [editIsPublic, setEditIsPublic] = useState(report.is_public ?? false);

  const handleSave = () => {
    const prop = properties.find(p => p.name === editProperty);
    onUpdate({
      property_name: editProperty,
      property_id: prop?.id || report.property_id,
      safety_document_type: editDocType || null,
      is_safety_document: !!editDocType && editDocType !== 'other',
      expiry_date: editExpiry || null,
      is_public: editIsPublic,
    });
  };

  return (
    <div className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
      <div className="flex items-center gap-3">
        {/* Public indicator */}
        {report.is_public ? (
          <Eye className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" title="Public on safety page" />
        ) : (
          <EyeOff className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" title="Not public" />
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">{report.file_name}</p>
        </div>

        {/* Doc Type Badge */}
        {report.safety_document_type && (
          <span className={`hidden sm:inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${DOC_TYPE_COLORS[report.safety_document_type] || DOC_TYPE_COLORS.other}`}>
            {DOC_TYPE_LABELS[report.safety_document_type] || report.safety_document_type}
          </span>
        )}

        {/* Expiry */}
        {report.expiry_date && (
          <span className={`hidden sm:flex items-center gap-1 text-xs ${
            new Date(report.expiry_date) < new Date() ? 'text-red-600 font-medium' : 'text-slate-500'
          }`}>
            <Calendar className="w-3 h-3" />
            {new Date(report.expiry_date).toLocaleDateString()}
          </span>
        )}

        {/* Date filed */}
        <span className="hidden sm:block text-xs text-slate-400">
          {new Date(report.created_at).toLocaleDateString()}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isEditing && (
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-slate-700 border border-transparent hover:border-slate-200 rounded transition-colors"
              title="Edit document"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Edit Form */}
      {isEditing && (
        <div className="mt-3 bg-slate-50 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Property</label>
              <select
                value={editProperty}
                onChange={(e) => setEditProperty(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
              >
                {properties.map(p => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Document Type</label>
              <select
                value={editDocType}
                onChange={(e) => setEditDocType(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
              >
                <option value="">-- None --</option>
                {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Expiry Date</label>
              <input
                type="date"
                value={editExpiry}
                onChange={(e) => setEditExpiry(e.target.value)}
                className="mt-1 w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Visibility</label>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  onClick={() => setEditIsPublic(!editIsPublic)}
                  className={`relative w-8 h-[18px] rounded-full transition-colors ${editIsPublic ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${editIsPublic ? 'translate-x-[14px]' : ''}`} />
                </button>
                <span className="text-xs text-slate-600">
                  {editIsPublic ? 'Public (safety page)' : 'Private'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-semibold rounded hover:bg-teal-700 transition-colors"
            >
              <Save className="w-3 h-3" />
              Save Changes
            </button>
            <button
              onClick={onCancelEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded hover:bg-white transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
