import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../lib/reportStorage';
import { GeneratedReport } from '../types';
import { getProperties, type Property } from '../lib/properties';
import {
  FileText, FileSpreadsheet, Mail, Download, Loader2, Home, LogOut,
  Building2, Calendar, Trash2, Upload, X, CheckCircle, AlertCircle, File, Clock, ShieldCheck, Flame, Eye
} from 'lucide-react';
import { User } from '@supabase/supabase-js';

interface OwnerDocumentsProps {
  user: User;
  onSignOut: () => void;
}

interface GroupedReports {
  [propertyName: string]: GeneratedReport[];
}

interface UploadingFile {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
  customName?: string;
}

const FILE_TYPE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; border: string }> = {
  html: { label: 'Booking Report', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  cover_letter: { label: 'Cover Letter', icon: Mail, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  csv: { label: 'CSV Data', icon: FileSpreadsheet, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
  uploaded: { label: 'Document', icon: File, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
};

export const OwnerDocuments: React.FC<OwnerDocumentsProps> = ({ user, onSignOut }) => {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<string>('all');
  const [isDragging, setIsDragging] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadProperty, setUploadProperty] = useState<string>('');
  const [propertyList, setPropertyList] = useState<Property[]>([]);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSafetyDocument, setIsSafetyDocument] = useState(false);
  const [safetyDocType, setSafetyDocType] = useState<string>('');
  const [expiryDate, setExpiryDate] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    fetchReports();
    getProperties().then(setPropertyList).catch(() => {});
  }, []);

  const fetchReports = async () => {
    try {
      const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (report: GeneratedReport) => {
    try {
      const url = await getSignedUrl(report.storage_path);
      if (!url) throw new Error('Could not generate view link');

      if (report.file_name.endsWith('.html')) {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch file');
        const htmlContent = await response.text();
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } else {
        window.open(url, '_blank');
      }
    } catch {
      alert('Failed to open file. Please try again.');
    }
  };

  const handleDownload = async (report: GeneratedReport) => {
    setDownloadingId(report.id);
    try {
      const url = await getSignedUrl(report.storage_path);
      if (!url) throw new Error('Could not generate download link');
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch file');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = report.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch {
      alert('Failed to download file. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (report: GeneratedReport) => {
    if (!confirm(`Delete "${report.file_name}"? This cannot be undone.`)) return;
    setDeletingId(report.id);
    try {
      const { error: dbError } = await supabase.from('generated_reports').delete().eq('id', report.id);
      if (dbError) throw dbError;

      const { error: storageError } = await supabase.storage.from('reports').remove([report.storage_path]);
      if (storageError) {
        console.warn('Storage deletion warning:', storageError);
      }

      setReports(prev => prev.filter(r => r.id !== report.id));
    } catch (err: any) {
      alert('Failed to delete file: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const uploadFile = async (file: File, customName?: string) => {
    const propName = uploadProperty.trim() || 'Uploaded';
    const safeProp = propName.replace(/[^a-zA-Z0-9\-_. ()]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    const storagePath = `${safeProp}/uploads/${timestamp}/${file.name}`;
    const displayName = customName?.trim() || file.name;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    const { data: existing } = await supabase
      .from('generated_reports')
      .select('id')
      .eq('storage_path', storagePath)
      .maybeSingle();

    if (existing) {
      const { error: dbError } = await supabase
        .from('generated_reports')
        .update({
          property_name: propName,
          file_name: displayName,
          file_type: 'uploaded',
          generated_by: user.id,
          is_safety_document: isSafetyDocument,
          safety_document_type: isSafetyDocument && safetyDocType ? safetyDocType : null,
          expiry_date: expiryDate || null,
          is_public: isSafetyDocument,
        })
        .eq('id', existing.id);

      if (dbError) throw dbError;
    } else {
      const { error: dbError } = await supabase.from('generated_reports').insert({
        property_name: propName,
        file_name: displayName,
        file_type: 'uploaded',
        storage_path: storagePath,
        date_range_start: null,
        date_range_end: null,
        year_range: '',
        booking_count: 0,
        total_nights: 0,
        generated_by: user.id,
        is_safety_document: isSafetyDocument,
        safety_document_type: isSafetyDocument && safetyDocType ? safetyDocType : null,
        expiry_date: expiryDate || null,
        is_public: isSafetyDocument,
      });

      if (dbError) throw dbError;
    }
  };

  const processFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newEntries: UploadingFile[] = fileArray.map(f => ({
      id: `${Date.now()}-${Math.random()}`,
      file: f,
      status: 'queued',
    }));
    setUploadingFiles(prev => [...prev, ...newEntries]);
  }, []);

  const submitUploads = async () => {
    const queued = uploadingFiles.filter(u => u.status === 'queued');
    if (queued.length === 0) return;
    setIsSubmitting(true);

    setUploadingFiles(prev =>
      prev.map(u => u.status === 'queued' ? { ...u, status: 'uploading' } : u)
    );

    for (const entry of queued) {
      try {
        await uploadFile(entry.file, entry.customName);
        setUploadingFiles(prev =>
          prev.map(u => u.id === entry.id ? { ...u, status: 'done' } : u)
        );
      } catch (err: any) {
        setUploadingFiles(prev =>
          prev.map(u => u.id === entry.id ? { ...u, status: 'error', errorMsg: err.message } : u)
        );
      }
    }

    await fetchReports();
    setIsSubmitting(false);
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setShowUploadPanel(true);
      processFiles(e.dataTransfer.files);
      e.dataTransfer.clearData();
    }
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const groupedReports: GroupedReports = reports.reduce((acc, report) => {
    if (!acc[report.property_name]) acc[report.property_name] = [];
    acc[report.property_name].push(report);
    return acc;
  }, {} as GroupedReports);

  const propertyNames = Object.keys(groupedReports).sort();

  const filteredGroups = selectedProperty === 'all'
    ? groupedReports
    : { [selectedProperty]: groupedReports[selectedProperty] || [] };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-3" />
          <p className="text-slate-400">Loading your documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-slate-50"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-blue-600/20 backdrop-blur-sm border-4 border-dashed border-blue-500 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl px-12 py-10 text-center">
            <Upload className="w-14 h-14 text-blue-500 mx-auto mb-4" />
            <p className="text-2xl font-bold text-slate-800">Drop files to upload</p>
            {uploadProperty && <p className="text-slate-500 mt-2">to "{uploadProperty}"</p>}
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Home className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-base font-bold text-slate-900 leading-none">Owner Portal</p>
                <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowUploadPanel(v => !v)}
                className={`flex items-center gap-2 text-sm font-semibold transition-colors px-3 py-2 rounded-lg border ${
                  showUploadPanel
                    ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">Upload Files</span>
              </button>
              <button
                onClick={onSignOut}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>

          {reports.length > 0 && propertyNames.length > 1 && (
            <div className="flex items-center gap-1.5 pb-3 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setSelectedProperty('all')}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full transition-all ${
                  selectedProperty === 'all'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                All Properties
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${selectedProperty === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {reports.length}
                </span>
              </button>
              {propertyNames.map(name => {
                const count = groupedReports[name]?.length ?? 0;
                const active = selectedProperty === name;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedProperty(name)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-full transition-all ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {name}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {showUploadPanel && (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm mb-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-800">Upload Documents</h3>
              <button onClick={() => setShowUploadPanel(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Property</label>
                <select
                  value={uploadProperty}
                  onChange={e => setUploadProperty(e.target.value)}
                  className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select a property...</option>
                  {propertyList.map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${isSafetyDocument ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
                onClick={() => setIsSafetyDocument(v => !v)}
              >
                <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isSafetyDocument ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-2 border-slate-300'}`}>
                  {isSafetyDocument && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${isSafetyDocument ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <span className={`text-sm font-semibold ${isSafetyDocument ? 'text-emerald-800' : 'text-slate-700'}`}>Safety Document</span>
                    {isSafetyDocument && (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">Publicly visible</span>
                    )}
                  </div>
                  <p className={`text-xs mt-0.5 ${isSafetyDocument ? 'text-emerald-700' : 'text-slate-400'}`}>
                    Designate this document for public licence compliance — it will appear on the public Safety Documents page.
                  </p>
                </div>
              </div>

              {isSafetyDocument && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Document Type</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {([
                      { value: 'stl_licence', label: 'STL Licence' },
                      { value: 'eicr', label: 'EICR' },
                      { value: 'pat', label: 'PAT Certificate' },
                      { value: 'gas_safety', label: 'Gas Safety' },
                      { value: 'other', label: 'Other' },
                    ] as { value: string; label: string }[]).map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSafetyDocType(opt.value)}
                        className={`px-3 py-2.5 text-sm font-semibold rounded-lg border-2 transition-all text-left ${
                          safetyDocType === opt.value
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Expiry Date <span className="normal-case font-normal text-slate-400">(optional)</span></label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={e => setExpiryDate(e.target.value)}
                  className="w-full max-w-sm border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-xl p-8 text-center cursor-pointer transition-colors group"
              >
                <Upload className="w-8 h-8 text-slate-400 group-hover:text-blue-500 mx-auto mb-3 transition-colors" />
                <p className="text-sm font-semibold text-slate-700">Click to browse files</p>
                <p className="text-xs text-slate-400 mt-1">or drag and drop anywhere on the page</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={onFileInputChange}
                />
              </div>

              {uploadingFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {uploadingFiles.map(u => (
                      <div key={u.id} className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-2">
                          {u.status === 'queued' && <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                          {u.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />}
                          {u.status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                          {u.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                          <span className="text-xs text-slate-500 truncate flex-1">{u.file.name}</span>
                          {u.status === 'queued' && <span className="text-xs text-slate-400">Queued</span>}
                          {u.status === 'uploading' && <span className="text-xs text-slate-400">Uploading...</span>}
                          {u.status === 'done' && <span className="text-xs text-emerald-600">Done</span>}
                          {u.status === 'error' && <span className="text-xs text-red-600 truncate max-w-[8rem]">{u.errorMsg}</span>}
                          {u.status !== 'uploading' && (
                            <button
                              onClick={() => setUploadingFiles(prev => prev.filter(x => x.id !== u.id))}
                              className="text-slate-400 hover:text-slate-600 ml-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        {u.status === 'queued' && (
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Display Name <span className="text-slate-400 font-normal">(leave blank to use filename)</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g., Gas Safety Certificate 2026"
                              value={u.customName || ''}
                              onChange={(e) => setUploadingFiles(prev =>
                                prev.map(item => item.id === u.id ? { ...item, customName: e.target.value } : item)
                              )}
                              className="w-full text-sm px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {uploadingFiles.some(u => u.status === 'queued') && (
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        onClick={submitUploads}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                      >
                        {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Upload {uploadingFiles.filter(u => u.status === 'queued').length} file{uploadingFiles.filter(u => u.status === 'queued').length !== 1 ? 's' : ''}
                      </button>
                      <button
                        onClick={() => setUploadingFiles(prev => prev.filter(u => u.status !== 'queued'))}
                        className="text-sm text-slate-500 hover:text-slate-700 transition-colors"
                      >
                        Clear queue
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {reports.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-5">
              <FileText className="w-10 h-10 text-slate-400" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">No documents yet</h2>
            <p className="text-slate-500">Your property reports and documents will appear here once they are generated.</p>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900">Your Documents</h2>
              <p className="text-sm text-slate-500 mt-0.5">{reports.length} files across {propertyNames.length} {propertyNames.length === 1 ? 'property' : 'properties'}</p>
            </div>

            <div className="space-y-8">
              {Object.entries(filteredGroups).map(([propertyName, propertyReports]) => {
                const reportSets = groupByPeriod(propertyReports);
                return (
                  <div key={propertyName} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-4 flex items-center gap-3">
                      <Building2 className="w-5 h-5 text-slate-300" />
                      <h3 className="text-lg font-bold text-white">{propertyName}</h3>
                      <span className="ml-auto text-xs text-slate-400 font-medium">{propertyReports.length} files</span>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {reportSets.map((set, setIndex) => (
                        <div key={setIndex} className="px-6 py-5">
                          {set.periodLabel && (
                            <div className="flex items-center gap-2 mb-4">
                              <Calendar className="w-4 h-4 text-slate-400" />
                              <span className="text-sm font-semibold text-slate-600">{set.periodLabel}</span>
                              {set.bookingCount > 0 && (
                                <span className="text-xs text-slate-400">• {set.bookingCount} bookings • {set.totalNights} nights</span>
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {set.files.map(report => {
                              const config = FILE_TYPE_CONFIG[report.file_type] ?? FILE_TYPE_CONFIG.uploaded;
                              const Icon = config.icon;
                              const isDownloading = downloadingId === report.id;
                              const isDeleting = deletingId === report.id;
                              return (
                                <div
                                  key={report.id}
                                  className={`flex items-center gap-3 p-4 rounded-xl border ${config.border} ${config.bg} group`}
                                >
                                  <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
                                    {isDownloading || isDeleting ? (
                                      <Loader2 className={`w-5 h-5 animate-spin ${config.color}`} />
                                    ) : (
                                      <Icon className={`w-5 h-5 ${config.color}`} />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
                                      {report.is_safety_document && (
                                        <span className="flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                                          <ShieldCheck className="w-3 h-3" />
                                          Safety
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => handleView(report)}
                                      disabled={isDownloading || isDeleting}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-white/70 transition-colors disabled:opacity-40"
                                      title="View"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDownload(report)}
                                      disabled={isDownloading || isDeleting}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/70 transition-colors disabled:opacity-40"
                                      title="Download"
                                    >
                                      <Download className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDelete(report)}
                                      disabled={isDownloading || isDeleting}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-white/70 transition-colors disabled:opacity-40"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

interface ReportSet {
  periodLabel: string;
  bookingCount: number;
  totalNights: number;
  files: GeneratedReport[];
}

function groupByPeriod(reports: GeneratedReport[]): ReportSet[] {
  const byPeriod: Record<string, GeneratedReport[]> = {};

  reports.forEach(r => {
    const key = `${r.date_range_start || ''}__${r.date_range_end || ''}__${r.year_range}`;
    if (!byPeriod[key]) byPeriod[key] = [];
    byPeriod[key].push(r);
  });

  return Object.entries(byPeriod)
    .map(([, files]) => {
      const first = files[0];
      let periodLabel = first.year_range || '';
      if (first.date_range_start || first.date_range_end) {
        const parts = [];
        if (first.date_range_start) parts.push(first.date_range_start);
        if (first.date_range_end) parts.push(first.date_range_end);
        periodLabel = parts.join(' – ');
      }
      return {
        periodLabel,
        bookingCount: first.booking_count,
        totalNights: first.total_nights,
        files,
      };
    })
    .sort((a, b) => b.periodLabel.localeCompare(a.periodLabel));
}
