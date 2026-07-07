import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Download, Loader2, X, ArrowLeft, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BankPaymentsPanel from '../components/BankPaymentsPanel';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { getPropertyNames } from '../lib/properties';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface SettlementRow {
  property: string;
  commission: string;
  vat: string;
  commIncVat: string;
  total: string;
}

interface ProcessResult {
  accepted: SettlementRow[];
  duplicates: string[];
  zeros: string[];
  errors: string[];
}

const extractTextFromPDF = async (file: File): Promise<{ fullText: string }> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    for (const item of textContent.items as any[]) {
      fullText += item.str + ' ';
    }
  }
  return { fullText };
};

const extractPropertyName = (fullText: string, knownProperties: string[]): string => {
  const normalised = fullText.replace(/\s+/g, ' ');
  for (const prop of knownProperties) {
    const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    if (re.test(normalised)) return prop;
  }
  return 'Unknown Property';
};

const parseText = (text: string, knownProperties: string[]): SettlementRow => {
  const property = extractPropertyName(text, knownProperties);
  const commMatch = text.match(/Commission:\s*£\s*([\d,.]+)/i);
  const vatMatch = text.match(/Vat on commission:\s*£\s*([\d,.]+)/i);
  const totalMatch = text.match(/Settlement total:\s*£\s*([\d,.]+)/i);

  const comm = parseFloat((commMatch ? commMatch[1] : '0').replace(/,/g, '')) || 0;
  const vat = parseFloat((vatMatch ? vatMatch[1] : '0').replace(/,/g, '')) || 0;

  return {
    property,
    commission: commMatch ? commMatch[1] : '0.00',
    vat: vatMatch ? vatMatch[1] : '0.00',
    commIncVat: (comm + vat).toFixed(2),
    total: totalMatch ? totalMatch[1] : '0.00',
  };
};

export default function SettlementConverter() {
  const [results, setResults] = useState<SettlementRow[]>([]);
  const resultsRef = useRef<SettlementRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [showBankPayments, setShowBankPayments] = useState(false);
  const [knownProperties, setKnownProperties] = useState<string[]>([]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    getPropertyNames().then(setKnownProperties).catch(() => {});
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setIsProcessing(true);
    setProcessResult(null);

    const parsed: SettlementRow[] = [];
    const errors: string[] = [];

    for (const file of files) {
      setProcessingFile(file.name);
      try {
        const { fullText: text } = await extractTextFromPDF(file);
        const data = parseText(text, knownProperties);
        parsed.push(data);
      } catch (err: any) {
        errors.push(file.name);
      }
    }

    setProcessingFile(null);

    const existingProperties = new Set(resultsRef.current.map(r => r.property));
    const duplicates: string[] = [];
    const accepted: SettlementRow[] = [];
    const seenInBatch = new Set<string>();

    const zeros: string[] = [];

    for (const row of parsed) {
      if (existingProperties.has(row.property) || seenInBatch.has(row.property)) {
        duplicates.push(row.property);
      } else if (parseFloat(row.total.replace(/,/g, '')) === 0) {
        zeros.push(row.property);
      } else {
        accepted.push(row);
        seenInBatch.add(row.property);
      }
    }

    setResults(prev =>
      [...prev, ...accepted].sort((a, b) => a.property.localeCompare(b.property))
    );
    setProcessResult({ accepted, duplicates, zeros, errors });
    setIsProcessing(false);
    e.target.value = '';
  };

  const downloadCSV = () => {
    const headers = 'Property,Comm Ex VAT,VAT,Comm Inc VAT,Settlement\n';
    const clean = (v: string) => v.replace(/,/g, '');
    const csvRows = results.map(r => `"${r.property}",${clean(r.commission)},${clean(r.vat)},${clean(r.commIncVat)},${clean(r.total)}`).join('\n');
    const blob = new Blob([headers + csvRows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `settlements_summary_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearResults = () => {
    setResults([]);
    setProcessResult(null);
  };

  const toNum = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;
  const totalCommission = results.reduce((s, r) => s + toNum(r.commission), 0);
  const totalVat = results.reduce((s, r) => s + toNum(r.vat), 0);
  const totalCommIncVat = results.reduce((s, r) => s + toNum(r.commIncVat), 0);
  const totalSettlement = results.reduce((s, r) => s + toNum(r.total), 0);

  const hasDuplicates = processResult && processResult.duplicates.length > 0;
  const hasZeros = processResult && processResult.zeros.length > 0;
  const hasErrors = processResult && processResult.errors.length > 0;
  const hasAccepted = processResult && processResult.accepted.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-4">
          <a
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </a>
          <div className="h-5 w-px bg-slate-200" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 leading-none">Settlement to CSV</p>
              <p className="text-xs text-slate-500 mt-0.5">Local PDF Parser</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Settlement Converter</h1>
          <p className="text-slate-500 mt-1">Convert property settlement PDFs to CSV — files are processed locally in your browser</p>
        </div>

        <div className="relative bg-white border-2 border-dashed border-slate-300 rounded-2xl p-14 text-center mb-6 hover:border-teal-400 transition-colors group">
          <input
            type="file"
            multiple
            accept=".pdf"
            onChange={handleFileUpload}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isProcessing}
          />
          <div className="w-16 h-16 bg-teal-50 group-hover:bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-colors pointer-events-none">
            <Upload className="w-8 h-8 text-teal-600" />
          </div>
          <p className="text-base font-semibold text-slate-800 mb-1 pointer-events-none">Drop multiple PDF files here</p>
          <p className="text-sm text-slate-400 pointer-events-none">Files stay in your browser — nothing is uploaded</p>
        </div>

        <AnimatePresence mode="wait">
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm"
            >
              <Loader2 className="w-4 h-4 animate-spin text-teal-600 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800">Processing documents</p>
                {processingFile && (
                  <p className="text-xs text-slate-400 truncate mt-0.5">{processingFile}</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hasAccepted && !hasDuplicates && !hasZeros && !hasErrors && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-6 flex items-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-600 flex-shrink-0" />
              <p className="text-sm font-medium text-teal-800">
                {processResult!.accepted.length} {processResult!.accepted.length === 1 ? 'statement' : 'statements'} added successfully
              </p>
              <button
                onClick={() => setProcessResult(null)}
                className="ml-auto text-teal-500 hover:text-teal-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {hasDuplicates && (
            <motion.div
              key="duplicates"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-6 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900">
                    {processResult!.duplicates.length} duplicate{processResult!.duplicates.length > 1 ? 's' : ''} skipped
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5 mb-3">
                    These properties are already in the list and were not added again.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {processResult!.duplicates.map(name => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 border border-amber-200 text-amber-800 text-xs font-medium rounded-md"
                      >
                        <FileText className="w-3 h-3" />
                        {name}
                      </span>
                    ))}
                  </div>
                  {hasAccepted && (
                    <p className="text-xs text-amber-600 mt-3">
                      {processResult!.accepted.length} new {processResult!.accepted.length === 1 ? 'statement was' : 'statements were'} added.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setProcessResult(null)}
                  className="text-amber-400 hover:text-amber-600 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {hasZeros && (
            <motion.div
              key="zeros"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-6 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden"
            >
              <div className="flex items-start gap-3 p-4">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                  <X className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {processResult!.zeros.length} zero-value {processResult!.zeros.length === 1 ? 'statement' : 'statements'} skipped
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 mb-3">
                    These statements had a £0.00 settlement total and were not added.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {processResult!.zeros.map(name => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 border border-slate-200 text-slate-600 text-xs font-medium rounded-md"
                      >
                        <FileText className="w-3 h-3" />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setProcessResult(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {hasErrors && (
            <motion.div
              key="errors"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"
            >
              <X className="w-4 h-4 mt-0.5 text-red-500 flex-shrink-0" />
              <div className="flex-1 text-sm text-red-800">
                <p className="font-semibold">Failed to parse {processResult!.errors.length} {processResult!.errors.length === 1 ? 'file' : 'files'}</p>
                <ul className="mt-1 text-xs text-red-600 space-y-0.5">
                  {processResult!.errors.map(f => <li key={f}>{f}</li>)}
                </ul>
              </div>
              <button onClick={() => setProcessResult(null)} className="text-red-400 hover:text-red-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {results.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">Preview</h2>
                <p className="text-xs text-slate-500 mt-0.5">{results.length} {results.length === 1 ? 'statement' : 'statements'} parsed</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearResults}
                  className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-800 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 bg-teal-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download CSV
                </button>
                <button
                  onClick={() => setShowBankPayments(v => !v)}
                  className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${showBankPayments ? 'bg-slate-800 text-white hover:bg-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  <Building2 className="w-4 h-4" />
                  Bank Payments
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Property</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Comm Ex VAT</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">VAT</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Comm Inc VAT</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider text-right">Settlement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {results.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{r.property}</td>
                      <td className="px-6 py-4 text-right text-slate-700">£{r.commission}</td>
                      <td className="px-6 py-4 text-right text-slate-700">£{r.vat}</td>
                      <td className="px-6 py-4 text-right text-slate-700">£{r.commIncVat}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">£{r.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Totals</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">£{totalCommission.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">£{totalVat.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-slate-900">£{totalCommIncVat.toFixed(2)}</td>
                    <td className="px-6 py-4 text-right font-bold text-teal-700 text-base">£{totalSettlement.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {showBankPayments && results.length > 0 && (
          <BankPaymentsPanel settlements={results} />
        )}
      </main>
    </div>
  );
}
