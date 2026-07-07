import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getSignedUrl } from '../lib/reportStorage';
import { GeneratedReport, SafetyDocumentType } from '../types';
import { getProperties, type Property } from '../lib/properties';
import { FileText, FileSpreadsheet, Mail, Download, Loader2, Building2, Calendar, Search, ChevronDown, ChevronUp, AlertCircle, RefreshCw, Upload, X, CheckCircle, Clock, ShieldCheck, File, Trash2, CreditCard as Edit3, Check } from 'lucide-react';

interface PropertyGroup {
  propertyName: string;
  reports: GeneratedReport[];
  latestDate: string;
}

interface PeriodSet {
  key: string;
  periodLabel: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  bookingCount: number;
  totalNights: number;
  generatedAt: string;
  files: GeneratedReport[];
}

const FILE_TYPE_CONFIG = {
  html: { label: 'Report', icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
  cover_letter: { label: 'Cover Letter', icon: Mail, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  csv: { label: 'CSV', icon: FileSpreadsheet, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' },
  uploaded: { label: 'Document', icon: File, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
};

interface UploadingFile {
  id: string;
  file: File;
  status: 'queued' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

function groupByPeriod(reports: GeneratedReport[]): PeriodSet[] {
  const byKey: Record<string, GeneratedReport[]> = {};
  reports.forEach(r => {
    const key = `${r.date_range_start || 'none'}__${r.date_range_end || 'none'}__${r.year_range}__${r.created_at.slice(0, 10)}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(r);
  });

  return Object.entries(byKey).map(([key, files]) => {
    const first = files[0];
    let periodLabel = first.year_range || 'All dates';
    if (first.date_range_start || first.date_range_end) {
      const parts: string[] = [];
      if (first.date_range_start) parts.push(first.date_range_start);
      if (first.date_range_end) parts.push(first.date_range_end);
      periodLabel = parts.join(' – ');
    }
    return {
      key,
      periodLabel,
      dateRangeStart: first.date_range_start,
      dateRangeEnd: first.date_range_end,
      bookingCount: first.booking_count,
      totalNights: first.total_nights,
      generatedAt: first.created_at,
      files,
    };
  }).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

export const AdminReports: React.FC = () => {
  const [reports, setReports] = useState<GeneratedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingProperty, setClearingProperty] = useState<string | null>(null);
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadProperty, setUploadProperty] = useState('');
  const [propertyList, setPropertyList] = useState<Property[]>([]);
  const [isSafetyDocument, setIsSafetyDocument] = useState(false);
  const [safetyDocType, setSafetyDocType] = useState<SafetyDocumentType | null>(null);
  const [expiryDate, setExpiryDate] = useState<string>('');
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  useEffect(() => {
    fetchReports();
    getProperties().then(setPropertyList).catch(() => {});
  }, []);

  const fetchReports = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('generated_reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);

      const properties = [...new Set((data || []).map(r => r.property_name))];
      setExpandedProperties(new Set(properties.slice(0, 3)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (report: GeneratedReport) => {
    setDownloadingId(report.id);
    try {
      const url = await getSignedUrl(report.storage_path);
      if (!url) throw new Error('Could not generate download link');
      const a = document.createElement('a');
      a.href = url;
      a.download = report.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setError('Failed to download file. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (report: GeneratedReport) => {
    if (!confirm(`Delete "${report.file_name}"? This cannot be undone.`)) return;
    setDeletingId(report.id);
    try {
      await supabase.storage.from('reports').remove([report.storage_path]);
      const { error } = await supabase.from('generated_reports').delete().eq('id', report.id);
      if (error) throw error;
      setReports(prev => prev.filter(r => r.id !== report.id));
    } catch (err: any) {
      setError('Failed to delete file: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleUpdateDescription = async (docId: string) => {
    if (!editDescription.trim()) return;

    try {
      const { error } = await supabase
        .from('generated_reports')
        .update({ uploaded_file_type: editDescription })
        .eq('id', docId);

      if (error) throw error;

      setReports(prev => prev.map(r => r.id === docId ? { ...r, uploaded_file_type: editDescription } : r));
      setEditingDocId(null);
      setEditDescription('');
    } catch (err: any) {
      setError('Failed to update description: ' + err.message);
    }
  };

  const uploadFile = async (file: File) => {
    const propName = uploadProperty.trim() || 'Uploaded';
    const safeProp = propName.replace(/[^a-zA-Z0-9\-_. ()]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    const storagePath = `${safeProp}/uploads/${timestamp}/${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase.from('generated_reports').insert({
      property_name: propName,
      file_name: file.name,
      file_type: 'uploaded',
      storage_path: storagePath,
      date_range_start: null,
      date_range_end: null,
      year_range: '',
      booking_count: 0,
      total_nights: 0,
      generated_by: null,
      is_safety_document: isSafetyDocument,
      safety_document_type: isSafetyDocument ? safetyDocType : null,
      expiry_date: expiryDate || null,
      is_public: isSafetyDocument,
    });

    if (dbError) throw dbError;
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
        await uploadFile(entry.file);
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

  const handleClearProperty = async (propertyName: string, propertyReports: GeneratedReport[]) => {
    if (!confirm(`Delete all ${propertyReports.length} files for "${propertyName}"? This cannot be undone.`)) return;
    setClearingProperty(propertyName);
    try {
      const paths = propertyReports.map(r => r.storage_path);
      await supabase.storage.from('reports').remove(paths);
      const ids = propertyReports.map(r => r.id);
      const { error } = await supabase.from('generated_reports').delete().in('id', ids);
      if (error) throw error;
      setReports(prev => prev.filter(r => r.property_name !== propertyName));
    } catch (err: any) {
      setError('Failed to delete files: ' + err.message);
    } finally {
      setClearingProperty(null);
    }
  };

  const toggleExpanded = (propertyName: string) => {
    setExpandedProperties(prev => {
      const next = new Set(prev);
      if (next.has(propertyName)) {
        next.delete(propertyName);
      } else {
        next.add(propertyName);
      }
      return next;
    });
  };

  const propertyGroups: PropertyGroup[] = (() => {
    const byProperty: Record<string, GeneratedReport[]> = {};
    reports.forEach(r => {
      if (!byProperty[r.property_name]) byProperty[r.property_name] = [];
      byProperty[r.property_name].push(r);
    });

    return Object.entries(byProperty)
      .map(([propertyName, propertyReports]) => ({
        propertyName,
        reports: propertyReports,
        latestDate: propertyReports[0]?.created_at || '',
      }))
      .sort((a, b) => b.latestDate.localeCompare(a.latestDate));
  })();

  const filteredGroups = searchTerm
    ? propertyGroups.filter(g =>
        g.propertyName.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : propertyGroups;

  const totalFiles = reports.length;
  const totalProperties = propertyGroups.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div
      className="space-y-5"
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-bold text-slate-800">Generated Reports</h2>
          </div>
          <p className="text-sm text-slate-500">
            {totalFiles} files stored across {totalProperties} {totalProperties === 1 ? 'property' : 'properties'}
          </p>
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
            Upload Files
          </button>
          <button
            onClick={fetchReports}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors px-3 py-2 rounded-lg hover:bg-slate-100"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {showUploadPanel && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Upload Documents</h3>
            <button onClick={() => setShowUploadPanel(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-4">
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

            <div
              className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all cursor-pointer ${isSafetyDocument ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}
              onClick={() => { setIsSafetyDocument(v => !v); if (isSafetyDocument) setSafetyDocType(null); }}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isSafetyDocument ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-2 border-slate-300'}`}>
                {isSafetyDocument && <CheckCircle className="w-3.5 h-3.5 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-4 h-4 flex-shrink-0 ${isSafetyDocument ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-semibold ${isSafetyDocument ? 'text-emerald-800' : 'text-slate-700'}`}>Safety / Compliance Document</span>
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
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Document Type</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {([
                    { value: 'stl_licence', label: 'STL Licence' },
                    { value: 'eicr', label: 'EICR' },
                    { value: 'pat', label: 'PAT Certificate' },
                    { value: 'gas_safety', label: 'Gas Safety' },
                    { value: 'other', label: 'Other' },
                  ] as { value: SafetyDocumentType; label: string }[]).map(opt => (
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
                    <div key={u.id} className="flex items-center gap-3 py-2 px-3 bg-slate-50 rounded-lg">
                      {u.status === 'queued' && <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                      {u.status === 'uploading' && <Loader2 className="w-4 h-4 text-blue-500 animate-spin flex-shrink-0" />}
                      {u.status === 'done' && <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
                      {u.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                      <span className="text-sm text-slate-700 truncate flex-1">{u.file.name}</span>
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

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search properties..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>

      {filteredGroups.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">
            {searchTerm ? 'No properties match your search.' : 'No reports have been generated yet.'}
          </p>
          {!searchTerm && (
            <p className="text-slate-400 text-xs mt-1">Use the Report Splitter to generate and save reports.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroups.map(({ propertyName, reports: propertyReports }) => {
            const isExpanded = expandedProperties.has(propertyName);
            const periodSets = groupByPeriod(propertyReports);
            const latestSet = periodSets[0];

            return (
              <div key={propertyName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button
                  onClick={() => toggleExpanded(propertyName)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-800 truncate">{propertyName}</h3>
                      <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                        <span>{periodSets.length} {periodSets.length === 1 ? 'report period' : 'report periods'}</span>
                        <span>•</span>
                        <span>{propertyReports.length} files</span>
                        {latestSet && (
                          <>
                            <span>•</span>
                            <span>Latest: {new Date(latestSet.generatedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3">
                    {isExpanded && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClearProperty(propertyName, propertyReports); }}
                        disabled={clearingProperty === propertyName}
                        className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 px-2.5 py-1 rounded-md transition-all disabled:opacity-50"
                        title="Delete all files for this property"
                      >
                        {clearingProperty === propertyName ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                        Clear all
                      </button>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-100 divide-y divide-slate-100">
                    {periodSets.map((set) => (
                      <div key={set.key} className="px-5 py-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700">{set.periodLabel}</span>
                          <span className="text-xs text-slate-400">
                            • {set.bookingCount} bookings • {set.totalNights} nights
                          </span>
                          <span className="ml-auto text-xs text-slate-400">
                            {new Date(set.generatedAt).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric'
                            })}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {set.files.map(file => {
                            const config = FILE_TYPE_CONFIG[file.file_type as keyof typeof FILE_TYPE_CONFIG] ?? FILE_TYPE_CONFIG.uploaded;
                            const Icon = config.icon;
                            const isDownloading = downloadingId === file.id;
                            const isDeleting = deletingId === file.id;
                            const isEditing = editingDocId === file.id;
                            return (
                              <div
                                key={file.id}
                                className={`flex flex-col gap-2 p-3 rounded-lg border ${config.border} ${config.bg}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center flex-shrink-0 shadow-sm">
                                    {isDownloading || isDeleting ? (
                                      <Loader2 className={`w-4 h-4 animate-spin ${config.color}`} />
                                    ) : (
                                      <Icon className={`w-4 h-4 ${config.color}`} />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className={`text-xs font-semibold ${config.color} block`}>{config.label}</span>
                                    {file.is_safety_document && !isEditing && (
                                      <span className="text-xs text-emerald-600 font-medium block">
                                        {file.uploaded_file_type || 'Safety doc'}
                                      </span>
                                    )}
                                    {file.expiry_date && (
                                      <span className="text-xs text-slate-400 block">Exp: {new Date(file.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                    )}
                                  </div>
                                  {file.is_safety_document && !isEditing && (
                                    <button
                                      onClick={() => {
                                        setEditingDocId(file.id);
                                        setEditDescription(file.uploaded_file_type || '');
                                      }}
                                      disabled={isDownloading || isDeleting}
                                      className="p-1 rounded text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-40"
                                      title="Edit description"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDownload(file)}
                                    disabled={isDownloading || isDeleting}
                                    className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
                                    title="Download"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(file)}
                                    disabled={isDownloading || isDeleting}
                                    className="p-1 rounded text-slate-400 hover:text-red-600 transition-colors disabled:opacity-40"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {isEditing && (
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={editDescription}
                                      onChange={(e) => setEditDescription(e.target.value)}
                                      className="flex-1 px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                                      placeholder="Document description (e.g., EICR, Gas Safety, etc.)"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleUpdateDescription(file.id)}
                                      className="p-1.5 rounded text-white bg-emerald-600 hover:bg-emerald-700 transition-colors"
                                      title="Save"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingDocId(null);
                                        setEditDescription('');
                                      }}
                                      className="p-1.5 rounded text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
