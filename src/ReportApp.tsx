import { useState, useRef } from 'react';
import { Upload, Download, FileText, CheckCircle2, Loader2, FileSpreadsheet, Mail, Calendar, ArrowLeft, Cloud, ChevronDown } from 'lucide-react';
import { PropertyReport, DateRangeFilter, FinancialYear } from './types';
import { processCSV, generateCSV, downloadCSV } from './csvProcessor';
import { generateZip, downloadZip } from './zipGenerator';
import { generateHTML, generateCoverLetter, downloadHTML } from './htmlGenerator';
import { storeReportFiles } from './lib/reportStorage';
import { supabase } from './lib/supabase';

function buildFinancialYears(): FinancialYear[] {
  const years: FinancialYear[] = [];
  for (let startYear = 2023; startYear <= 2025; startYear++) {
    const endYear = startYear + 1;
    const endYearShort = String(endYear).slice(2);
    years.push({
      label: `${startYear}/${endYearShort}`,
      startDate: `${startYear}-04-01`,
      endDate: `${endYear}-03-31`,
      displayRange: `April ${startYear} to March ${endYear}`,
    });
  }
  return years;
}

const FINANCIAL_YEARS = buildFinancialYears();

function getDefaultFinancialYear(): FinancialYear {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const fyStartYear = month >= 4 ? year : year - 1;
  return FINANCIAL_YEARS.find(fy => fy.startDate === `${fyStartYear}-04-01`) ?? FINANCIAL_YEARS[FINANCIAL_YEARS.length - 1];
}

function ReportApp() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [reports, setReports] = useState<PropertyReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangeFilter>({ startDate: '', endDate: '' });
  const [selectedFY, setSelectedFY] = useState<FinancialYear>(getDefaultFinancialYear);
  const [csvContent, setCsvContent] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }
    const content = await file.text();
    setCsvContent(content);
    await runProcessing(content, dateFilter, selectedFY);
  };

  const runProcessing = async (content: string, filter: DateRangeFilter, fy: FinancialYear) => {
    setIsProcessing(true);
    setError(null);
    setReports([]);
    setSavedCount(0);

    try {
      const propertyReports = await processCSV(content, filter);
      if (propertyReports.length === 0) {
        setError('No valid bookings found for the selected date range');
      } else {
        setReports(propertyReports.map(r => ({ ...r, financialYear: fy })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDateFilterChange = (field: keyof DateRangeFilter, value: string) => {
    const newFilter = { ...dateFilter, [field]: value };
    setDateFilter(newFilter);
    if (csvContent) {
      runProcessing(csvContent, newFilter, selectedFY);
    }
  };

  const handleFYChange = (fy: FinancialYear) => {
    setSelectedFY(fy);
    if (csvContent) {
      runProcessing(csvContent, dateFilter, fy);
    } else {
      setReports(prev => prev.map(r => ({ ...r, financialYear: fy })));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDownloadCSV = (report: PropertyReport) => {
    downloadCSV(generateCSV(report), `${report.propertyName} ${report.yearRange}.csv`);
  };

  const handleDownloadHTML = (report: PropertyReport) => {
    downloadHTML(generateHTML(report), `${report.propertyName} ${report.yearRange}.html`);
  };

  const handleDownloadCoverLetter = (report: PropertyReport) => {
    downloadHTML(generateCoverLetter(report), `${report.propertyName} ${report.yearRange} - Cover Letter.html`);
  };

  const handleDownloadAll = async () => {
    try {
      const zipBlob = await generateZip(reports);
      downloadZip(zipBlob, 'Property Reports.zip');
    } catch {
      setError('Failed to generate ZIP file');
    }
  };

  const handleSaveAll = async () => {
    setIsSaving(true);
    setSavedCount(0);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;

      let count = 0;
      for (const report of reports) {
        await storeReportFiles(
          report,
          dateFilter.startDate || null,
          dateFilter.endDate || null,
          userId
        );
        count++;
        setSavedCount(count);
      }
    } catch (err) {
      setError('Failed to save some reports to storage');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-10">

        <div className="flex items-center gap-4 mb-10">
          <a
            href="/"
            className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Portal
          </a>
          <div className="h-4 w-px bg-slate-300" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Property Booking Report Splitter</h1>
            <p className="text-slate-500 text-sm">Upload your booking CSV to generate individual property reports</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <div
              className={`border-2 border-dashed rounded-2xl p-10 transition-all duration-200 cursor-pointer ${
                isDragging
                  ? 'border-blue-500 bg-blue-50 scale-[1.01]'
                  : csvContent
                  ? 'border-green-400 bg-green-50 hover:border-green-500'
                  : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
              <div className="flex flex-col items-center justify-center">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${csvContent ? 'bg-green-100' : 'bg-blue-100'}`}>
                  {csvContent ? (
                    <CheckCircle2 className="w-8 h-8 text-green-600" />
                  ) : (
                    <Upload className="w-8 h-8 text-blue-600" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-slate-800 mb-1">
                  {csvContent ? 'CSV loaded — click to replace' : 'Drop your Booking list.csv here'}
                </h3>
                <p className="text-slate-500 text-sm">{csvContent ? 'or drag a new file' : 'or click to browse'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <Calendar className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-slate-800">Financial Year</h3>
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">Select Financial Year</label>
              <div className="relative">
                <select
                  value={selectedFY.label}
                  onChange={(e) => {
                    const fy = FINANCIAL_YEARS.find(y => y.label === e.target.value);
                    if (fy) handleFYChange(fy);
                  }}
                  className="w-full appearance-none border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white pr-8"
                >
                  {FINANCIAL_YEARS.map(fy => (
                    <option key={fy.label} value={fy.label}>{fy.label} (Apr – Mar)</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5">{selectedFY.displayRange}</p>
            </div>
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Custom Date Filter</h4>
              </div>
              <p className="text-xs text-slate-400 mb-3">Override: filter bookings by check-out date</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">From</label>
                <input
                  type="date"
                  value={dateFilter.startDate}
                  onChange={(e) => handleDateFilterChange('startDate', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">To</label>
                <input
                  type="date"
                  value={dateFilter.endDate}
                  onChange={(e) => handleDateFilterChange('endDate', e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {(dateFilter.startDate || dateFilter.endDate) && (
                <button
                  onClick={() => {
                    const cleared = { startDate: '', endDate: '' };
                    setDateFilter(cleared);
                    if (csvContent) runProcessing(csvContent, cleared, selectedFY);
                  }}
                  className="w-full text-xs text-slate-500 hover:text-red-600 transition-colors py-1"
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>

        {isProcessing && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 mb-8">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
              <span className="text-slate-700 font-medium">Processing file...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8">
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        )}

        {reports.length > 0 && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">
                    {reports.length} {reports.length === 1 ? 'property' : 'properties'} found
                  </h3>
                  <p className="text-slate-500 text-sm">
                    {dateFilter.startDate || dateFilter.endDate
                      ? `Filtered by departure date${dateFilter.startDate ? ` from ${dateFilter.startDate}` : ''}${dateFilter.endDate ? ` to ${dateFilter.endDate}` : ''}`
                      : 'All bookings included'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving {savedCount}/{reports.length}...
                    </>
                  ) : savedCount === reports.length && savedCount > 0 ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Saved to Portal
                    </>
                  ) : (
                    <>
                      <Cloud className="w-4 h-4" />
                      Save All to Owner Portal
                    </>
                  )}
                </button>
                {reports.length > 1 && (
                  <button
                    onClick={handleDownloadAll}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Download All ZIP
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {reports.map((report, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="mb-5">
                    <h4 className="text-lg font-bold text-slate-800 mb-2 leading-tight">
                      {report.propertyName}
                    </h4>
                    <div className="flex items-center gap-3 text-sm text-slate-500">
                      <span>{report.bookings.length} {report.bookings.length === 1 ? 'booking' : 'bookings'}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-300" />
                      <span>{report.totalNights} nights</span>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-400">
                      Period: {report.yearRange}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownloadCSV(report)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-800 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        CSV
                      </button>
                      <button
                        onClick={() => handleDownloadHTML(report)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <FileText className="w-4 h-4" />
                        Report
                      </button>
                    </div>
                    <button
                      onClick={() => handleDownloadCoverLetter(report)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      <Mail className="w-4 h-4" />
                      Cover Letter
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {reports.length === 0 && !isProcessing && !error && !csvContent && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 text-lg">Upload a booking list CSV to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReportApp;
