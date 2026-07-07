import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { PATTestResult, PATTestType, TestResult, Property } from '../types';
import { getProxiedUrl } from '../lib/urlProxy';
import {
  Zap, Plus, Camera, Upload, FileDown, Loader2,
  AlertCircle, CheckCircle, Trash2, Eye, X, Calendar,
  MapPin, ClipboardList, User, FileText, Download, Clock
} from 'lucide-react';

interface PropertyTestSchedule {
  property_id: string;
  property_name: string;
  last_test_date: string | null;
  days_since_test: number | null;
  status: 'overdue' | 'upcoming' | 'current' | 'not_tested';
  total_tests: number;
}

const TEST_TYPES: PATTestType[] = ['Class 1', 'Class 2', 'Lead', 'Visual'];

interface TestEntry {
  id: string;
  asset_description: string;
  location_in_property: string;
  test_type: PATTestType;
  result: TestResult;
  notes: string;
  photo: File | null;
}

export default function PATTestingTool() {
  const [tests, setTests] = useState<PATTestResult[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState<false | 'single' | 'batch'>(false);
  const [saving, setSaving] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'tests' | 'schedule'>('tests');
  const [schedules, setSchedules] = useState<PropertyTestSchedule[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [sessionData, setSessionData] = useState({
    property_name: '',
    custom_property_name: '',
    use_custom_property: false,
    test_date: new Date().toISOString().split('T')[0],
    tested_by: '',
  });

  const [currentEntry, setCurrentEntry] = useState<TestEntry>({
    id: crypto.randomUUID(),
    asset_description: '',
    location_in_property: '',
    test_type: 'Class 1' as PATTestType,
    result: 'pass' as TestResult,
    notes: '',
    photo: null,
  });

  const [batchTests, setBatchTests] = useState<TestEntry[]>([]);

  const [formData, setFormData] = useState({
    property_name: '',
    test_date: new Date().toISOString().split('T')[0],
    asset_description: '',
    location_in_property: '',
    test_type: 'Class 1' as PATTestType,
    result: 'pass' as TestResult,
    notes: '',
    tested_by: '',
    photo: null as File | null,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [testsRes, propsRes] = await Promise.all([
        supabase
          .from('pat_test_results')
          .select('*')
          .order('test_date', { ascending: false }),
        supabase
          .from('properties')
          .select('*')
          .eq('active', true)
          .order('name'),
      ]);

      if (testsRes.error) throw testsRes.error;
      if (propsRes.error) throw propsRes.error;

      setTests(testsRes.data || []);
      setProperties(propsRes.data || []);

      calculateSchedules(testsRes.data || [], propsRes.data || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateSchedules = (allTests: PATTestResult[], allProperties: Property[]) => {
    const scheduleData: PropertyTestSchedule[] = allProperties
      .map(property => {
        const propertyTests = allTests.filter(t => t.property_name === property.name);
        const lastTest = propertyTests.length > 0 ? propertyTests[0] : null;

        let daysSinceTest: number | null = null;
        let status: PropertyTestSchedule['status'] = 'not_tested';

        if (lastTest) {
          const lastTestDate = new Date(lastTest.test_date);
          const today = new Date();
          daysSinceTest = Math.floor((today.getTime() - lastTestDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceTest > 365) {
            status = 'overdue';
          } else if (daysSinceTest > 335) {
            status = 'upcoming';
          } else {
            status = 'current';
          }
        }

        return {
          property_id: property.id,
          property_name: property.name,
          last_test_date: lastTest?.test_date || null,
          days_since_test: daysSinceTest,
          status,
          total_tests: propertyTests.length,
        };
      })
      .filter(schedule => schedule.status !== 'not_tested');

    scheduleData.sort((a, b) => {
      const statusOrder = { 'overdue': 0, 'upcoming': 1, 'current': 2 };
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return a.property_name.localeCompare(b.property_name);
    });

    setSchedules(scheduleData);
  };

  const addTestToQueue = () => {
    if (!currentEntry.asset_description || !currentEntry.location_in_property) {
      alert('Please fill in asset description and location');
      return;
    }

    setBatchTests([...batchTests, currentEntry]);

    setCurrentEntry({
      id: crypto.randomUUID(),
      asset_description: '',
      location_in_property: '',
      test_type: currentEntry.test_type,
      result: 'pass',
      notes: '',
      photo: null,
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const removeTestFromQueue = (id: string) => {
    setBatchTests(batchTests.filter(t => t.id !== id));
  };

  const submitBatchTests = async () => {
    if (batchTests.length === 0) {
      alert('No tests to submit. Add at least one test.');
      return;
    }

    setSaving(true);

    try {
      const propertyName = sessionData.use_custom_property ? sessionData.custom_property_name : sessionData.property_name;
      const selectedProp = properties.find(p => p.name === propertyName);

      for (const entry of batchTests) {
        let photoUrl = null;

        if (entry.photo) {
          const fileExt = entry.photo.name.split('.').pop();
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `${propertyName}/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('pat-test-photos')
            .upload(filePath, entry.photo);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('pat-test-photos')
            .getPublicUrl(filePath);

          photoUrl = getProxiedUrl(publicUrl);
        }

        const { error: insertError } = await supabase
          .from('pat_test_results')
          .insert({
            property_id: selectedProp?.id || null,
            property_name: propertyName,
            test_date: sessionData.test_date,
            asset_description: entry.asset_description,
            location_in_property: entry.location_in_property,
            test_type: entry.test_type,
            result: entry.result,
            notes: entry.notes || null,
            tested_by: sessionData.tested_by || null,
            photo_url: photoUrl,
          });

        if (insertError) throw insertError;
      }

      await fetchData();
      setShowForm(false);
      resetBatchForm();
      alert(`Successfully saved ${batchTests.length} test results!`);
    } catch (error: any) {
      console.error('Error saving tests:', error);
      alert('Failed to save test results. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let photoUrl = null;

      if (formData.photo) {
        const fileExt = formData.photo.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${formData.property_name}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('pat-test-photos')
          .upload(filePath, formData.photo);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('pat-test-photos')
          .getPublicUrl(filePath);

        photoUrl = publicUrl;
      }

      const selectedProp = properties.find(p => p.name === formData.property_name);

      const { error: insertError } = await supabase
        .from('pat_test_results')
        .insert({
          property_id: selectedProp?.id || null,
          property_name: formData.property_name,
          test_date: formData.test_date,
          asset_description: formData.asset_description,
          location_in_property: formData.location_in_property,
          test_type: formData.test_type,
          result: formData.result,
          notes: formData.notes || null,
          tested_by: formData.tested_by || null,
          photo_url: photoUrl,
        });

      if (insertError) throw insertError;

      await fetchData();
      setShowForm(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving test:', error);
      alert('Failed to save test result. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setFormData({
      property_name: '',
      test_date: new Date().toISOString().split('T')[0],
      asset_description: '',
      location_in_property: '',
      test_type: 'Class 1',
      result: 'pass',
      notes: '',
      tested_by: '',
      photo: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const resetBatchForm = () => {
    setSessionData({
      property_name: '',
      custom_property_name: '',
      use_custom_property: false,
      test_date: new Date().toISOString().split('T')[0],
      tested_by: '',
    });
    setCurrentEntry({
      id: crypto.randomUUID(),
      asset_description: '',
      location_in_property: '',
      test_type: 'Class 1',
      result: 'pass',
      notes: '',
      photo: null,
    });
    setBatchTests([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const handleDelete = async (id: string, photoUrl: string | null) => {
    if (!confirm('Are you sure you want to delete this test result?')) return;

    try {
      if (photoUrl) {
        const path = photoUrl.split('/pat-test-photos/')[1];
        if (path) {
          await supabase.storage.from('pat-test-photos').remove([path]);
        }
      }

      const { error } = await supabase
        .from('pat_test_results')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchData();
    } catch (error: any) {
      console.error('Error deleting test:', error);
      alert('Failed to delete test result.');
    }
  };

  const generateHTMLReport = async (selectedTests: PATTestResult[]) => {
    if (selectedTests.length === 0) return;

    const propertyName = filterProperty !== 'all' ? filterProperty : selectedTests[0]?.property_name || 'Multiple Properties';
    const now = new Date();
    const generatedDate = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const generatedTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const passed = selectedTests.filter(t => t.result === 'pass').length;
    const failed = selectedTests.filter(t => t.result === 'fail').length;
    const passRate = selectedTests.length > 0 ? Math.round((passed / selectedTests.length) * 100) : 0;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PAT Certificate - ${propertyName}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      background: white;
      padding: 0;
      min-height: 100vh;
    }
    .page-header {
      background: linear-gradient(135deg, #3b6b8f 0%, #4a7fa1 100%);
      padding: 32px 40px;
      color: white;
    }
    .header-content {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .left-section {
      display: flex;
      align-items: center;
      gap: 24px;
    }
    .logo {
      height: 48px;
      width: auto;
      filter: brightness(0) invert(1);
    }
    .property-header {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .property-icon {
      background: rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 12px;
      flex-shrink: 0;
    }
    .property-info h1 {
      font-size: 28px;
      font-weight: 700;
      color: white;
      margin-bottom: 4px;
    }
    .property-subtitle {
      font-size: 14px;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 400;
    }
    .notice-banner {
      background: rgba(255, 255, 255, 0.15);
      border-left: 4px solid white;
      padding: 12px 16px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 380px;
    }
    .notice-banner svg {
      flex-shrink: 0;
    }
    .notice-text {
      color: white;
      font-size: 13px;
      font-weight: 500;
    }
    .main-content {
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 40px;
    }
    .card-header {
      background: #f8fafc;
      padding: 24px;
      border-bottom: 1px solid #e2e8f0;
      margin-bottom: 24px;
    }
    .card-title {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 16px;
    }
    .meta-info {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      font-size: 14px;
      color: #64748b;
    }
    .meta-info strong {
      color: #1e293b;
      font-weight: 600;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }
    .stat-card {
      background: white;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 20px;
      border-left: 4px solid #e2e8f0;
    }
    .stat-card.pass {
      border-left-color: #22c55e;
      background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%);
    }
    .stat-card.fail {
      border-left-color: #ef4444;
      background: linear-gradient(135deg, #ffffff 0%, #fef2f2 100%);
    }
    .stat-card.rate {
      border-left-color: #3b82f6;
      background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%);
    }
    .stat-value {
      font-size: 36px;
      font-weight: 700;
      margin-bottom: 4px;
      line-height: 1;
    }
    .stat-label {
      font-size: 13px;
      color: #64748b;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .table-container {
      overflow-x: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    thead {
      background: #f1f5f9;
      border-bottom: 2px solid #e2e8f0;
    }
    th {
      padding: 14px 16px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    tbody tr {
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.15s;
    }
    tbody tr:last-child {
      border-bottom: none;
    }
    tbody tr:hover {
      background: #f8fafc;
    }
    td {
      padding: 16px;
      font-size: 14px;
      color: #1e293b;
    }
    .result-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .result-pass {
      background: #dcfce7;
      color: #16a34a;
    }
    .result-fail {
      background: #fee2e2;
      color: #dc2626;
    }
    @media print {
      .page-header { padding: 20px 40px; }
      .main-content { margin-top: 20px; }
      .table-container { border: 1px solid #e2e8f0; }
    }
    @media (max-width: 768px) {
      .header-content { flex-direction: column; align-items: flex-start; gap: 20px; }
      .stats-grid { grid-template-columns: 1fr; }
      .main-content { padding: 0 20px; }
    }
  </style>
</head>
<body>
  <div class="page-header">
    <div class="header-content">
      <div class="left-section">
        <img src="https://igloo-core.bolt.host/logo.svg" alt="igloo holiday homes" class="logo">

        <div class="property-header">
          <div class="property-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
          </div>
          <div class="property-info">
            <h1>${propertyName}</h1>
            <p class="property-subtitle">Portable Appliance Testing Certificate</p>
          </div>
        </div>
      </div>

      <div class="notice-banner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        <span class="notice-text">Documents published for short-term let licence compliance verification.</span>
      </div>
    </div>
  </div>

  <div class="main-content">
    <div class="card-header">
      <h2 class="card-title">Compliance Documents</h2>
      <div class="meta-info">
        <div><strong>Property:</strong> ${propertyName}</div>
        <div><strong>Generated:</strong> ${generatedDate} at ${generatedTime}</div>
        <div><strong>Total Tests:</strong> ${selectedTests.length}</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card pass">
        <div class="stat-value" style="color: #16a34a;">${passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat-card fail">
        <div class="stat-value" style="color: #dc2626;">${failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-card rate">
        <div class="stat-value" style="color: #3b82f6;">${passRate}%</div>
        <div class="stat-label">Pass Rate</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Test Date</th>
            <th>Property</th>
            <th>Asset Description</th>
            <th>Location</th>
            <th>Test Type</th>
            <th>Result</th>
            <th>Tested By</th>
          </tr>
        </thead>
        <tbody>
          ${selectedTests.map(test => `
            <tr>
              <td>${new Date(test.test_date).toLocaleDateString('en-GB')}</td>
              <td><strong>${test.property_name}</strong></td>
              <td>${test.asset_description}</td>
              <td>${test.location_in_property}</td>
              <td><span style="color: #64748b; font-size: 13px;">${test.test_type}</span></td>
              <td>
                <span class="result-badge result-${test.result}">
                  ${test.result.toUpperCase()}
                </span>
              </td>
              <td style="color: #64748b;">${test.tested_by || '-'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const fileName = `PAT_Certificate_${propertyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.html`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    await saveToDocumentManager(blob, fileName, 'html', propertyName, selectedTests);
  };

  const generateCSV = async (selectedTests: PATTestResult[]) => {
    if (selectedTests.length === 0) return;

    const propertyName = filterProperty !== 'all' ? filterProperty : selectedTests[0]?.property_name || 'Multiple Properties';

    const headers = [
      'Test Date',
      'Property Name',
      'Asset Description',
      'Location',
      'Test Type',
      'Result',
      'Tested By',
      'Notes',
      'Photo URL',
    ];

    const rows = selectedTests.map(test => [
      test.test_date,
      test.property_name,
      test.asset_description,
      test.location_in_property,
      test.test_type,
      test.result,
      test.tested_by || '',
      test.notes || '',
      test.photo_url || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const fileName = `PAT_Tests_${propertyName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);

    await saveToDocumentManager(blob, fileName, 'csv', propertyName, selectedTests);
  };

  const saveToDocumentManager = async (
    blob: Blob,
    fileName: string,
    fileType: 'html' | 'csv',
    propertyName: string,
    selectedTests: PATTestResult[]
  ) => {
    try {
      const storagePath = `${propertyName.replace(/[^a-zA-Z0-9\-_. ()]/g, '_')}/pat-reports/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(storagePath, blob, {
          upsert: true,
          contentType: fileType === 'html' ? 'text/html; charset=utf-8' : 'text/csv',
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      const selectedProp = properties.find(p => p.name === propertyName);

      const { error: dbError } = await supabase
        .from('generated_reports')
        .insert({
          property_id: selectedProp?.id || null,
          property_name: propertyName,
          file_name: fileName,
          file_type: 'uploaded',
          storage_path: storagePath,
          year_range: new Date().getFullYear().toString(),
          booking_count: selectedTests.length,
          total_nights: 0,
          is_safety_document: true,
          safety_document_type: 'pat',
          is_public: true,
          uploaded_file_type: 'PAT Certificate',
        });

      if (dbError) throw dbError;

      alert('PAT Certificate saved to Document Manager successfully!');
    } catch (error: any) {
      console.error('Error saving to document manager:', error);
      alert('Failed to save to Document Manager: ' + error.message);
    }
  };

  const filteredTests = tests.filter(test => {
    if (filterProperty !== 'all' && test.property_name !== filterProperty) return false;
    if (filterDateFrom && test.test_date < filterDateFrom) return false;
    if (filterDateTo && test.test_date > filterDateTo) return false;
    return true;
  });

  const stats = {
    total: filteredTests.length,
    passed: filteredTests.filter(t => t.result === 'pass').length,
    failed: filteredTests.filter(t => t.result === 'fail').length,
    properties: new Set(filteredTests.map(t => t.property_name)).size,
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center shadow-sm">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">PAT Testing Tool</h1>
              <p className="text-slate-500 mt-1">Portable Appliance Testing log and reporting</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Tests</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</p>
              </div>
              <ClipboardList className="w-8 h-8 text-slate-400" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Passed</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{stats.passed}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Failed</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{stats.failed}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Properties</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{stats.properties}</p>
              </div>
              <MapPin className="w-8 h-8 text-slate-400" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">Property</label>
              <select
                value={filterProperty}
                onChange={(e) => setFilterProperty(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              >
                <option value="all">All Properties</option>
                {properties.map(prop => (
                  <option key={prop.id} value={prop.name}>{prop.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">Date From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-sm font-medium text-slate-700 mb-2">Date To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => generateHTMLReport(filteredTests)}
                disabled={filteredTests.length === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <FileDown className="w-4 h-4" />
                HTML Report
              </button>
              <button
                onClick={() => generateCSV(filteredTests)}
                disabled={filteredTests.length === 0}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
              >
                <Download className="w-4 h-4" />
                CSV
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
          <div className="border-b border-slate-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('tests')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                  activeTab === 'tests'
                    ? 'text-green-700 border-b-2 border-green-600 bg-green-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <ClipboardList className="w-4 h-4" />
                  Test Results
                </div>
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 px-6 py-4 text-sm font-semibold transition-colors ${
                  activeTab === 'schedule'
                    ? 'text-green-700 border-b-2 border-green-600 bg-green-50'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Test Schedule
                </div>
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'tests' && (
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900">Test Results</h2>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowForm('single');
                }}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 flex items-center gap-2 font-medium"
              >
                <Plus className="w-4 h-4" />
                Single Test
              </button>
              <button
                onClick={() => {
                  setShowForm('batch');
                  resetBatchForm();
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2 font-medium shadow-sm"
              >
                <Zap className="w-4 h-4" />
                Batch Testing
              </button>
            </div>
          </div>
        )}

        {activeTab === 'tests' ? (
          loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
            </div>
          ) : filteredTests.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <Zap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No test results found</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Property</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Asset</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Result</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tested By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTests.map((test) => (
                      <tr key={test.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">{new Date(test.test_date).toLocaleDateString('en-GB')}</td>
                        <td className="px-4 py-3 text-sm text-slate-900 font-medium">{test.property_name}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{test.asset_description}</td>
                        <td className="px-4 py-3 text-sm text-slate-600">{test.location_in_property}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {test.test_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                            test.result === 'pass'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {test.result}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">{test.tested_by || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            {test.photo_url && (
                              <button
                                onClick={() => setSelectedImage(test.photo_url)}
                                className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                title="View photo"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(test.id, test.photo_url)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Test Schedule</h2>
                <p className="text-sm text-slate-600 mt-1">Annual PAT testing status for all properties</p>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
              </div>
            ) : schedules.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No properties tested yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {schedules.map((schedule) => {
                  const getStatusColor = () => {
                    switch (schedule.status) {
                      case 'overdue':
                        return 'border-red-300 bg-red-50';
                      case 'upcoming':
                        return 'border-amber-300 bg-amber-50';
                      case 'current':
                        return 'border-green-300 bg-green-50';
                      case 'not_tested':
                        return 'border-slate-300 bg-slate-50';
                    }
                  };

                  const getStatusBadge = () => {
                    switch (schedule.status) {
                      case 'overdue':
                        return (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-800 rounded-lg font-semibold text-sm">
                            <AlertCircle className="w-4 h-4" />
                            Overdue
                          </div>
                        );
                      case 'upcoming':
                        return (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-800 rounded-lg font-semibold text-sm">
                            <Clock className="w-4 h-4" />
                            Due Soon
                          </div>
                        );
                      case 'current':
                        return (
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg font-semibold text-sm">
                            <CheckCircle className="w-4 h-4" />
                            Current
                          </div>
                        );
                    }
                  };

                  const getDaysRemaining = () => {
                    if (!schedule.days_since_test) return null;
                    const daysRemaining = 365 - schedule.days_since_test;
                    return daysRemaining;
                  };

                  const daysRemaining = getDaysRemaining();

                  return (
                    <div
                      key={schedule.property_id}
                      className={`rounded-xl border-2 shadow-sm p-5 transition-all hover:shadow-md ${getStatusColor()}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <MapPin className="w-5 h-5 text-slate-600" />
                            <h3 className="text-lg font-bold text-slate-900">{schedule.property_name}</h3>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-xs text-slate-600 font-medium mb-1">Last Test Date</p>
                              <p className="text-sm font-semibold text-slate-900">
                                {schedule.last_test_date
                                  ? new Date(schedule.last_test_date).toLocaleDateString('en-GB')
                                  : 'Never tested'}
                              </p>
                            </div>

                            {schedule.days_since_test !== null && (
                              <>
                                <div>
                                  <p className="text-xs text-slate-600 font-medium mb-1">Days Since Test</p>
                                  <p className="text-sm font-semibold text-slate-900">{schedule.days_since_test} days</p>
                                </div>

                                <div>
                                  <p className="text-xs text-slate-600 font-medium mb-1">
                                    {daysRemaining && daysRemaining > 0 ? 'Days Until Due' : 'Days Overdue'}
                                  </p>
                                  <p className={`text-sm font-semibold ${
                                    daysRemaining && daysRemaining > 0 ? 'text-slate-900' : 'text-red-700'
                                  }`}>
                                    {daysRemaining !== null
                                      ? daysRemaining > 0
                                        ? `${daysRemaining} days`
                                        : `${Math.abs(daysRemaining)} days`
                                      : '-'}
                                  </p>
                                </div>
                              </>
                            )}

                            <div>
                              <p className="text-xs text-slate-600 font-medium mb-1">Total Tests Recorded</p>
                              <p className="text-sm font-semibold text-slate-900">{schedule.total_tests}</p>
                            </div>
                          </div>
                        </div>

                        <div className="ml-4">
                          {getStatusBadge()}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showForm === 'single' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">New PAT Test</h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Property <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.property_name}
                  onChange={(e) => setFormData({ ...formData, property_name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="">Select property...</option>
                  {properties.map(prop => (
                    <option key={prop.id} value={prop.name}>{prop.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Test Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={formData.test_date}
                  onChange={(e) => setFormData({ ...formData, test_date: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Asset Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.asset_description}
                  onChange={(e) => setFormData({ ...formData, asset_description: e.target.value })}
                  placeholder="e.g., Microwave, Kettle, TV"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Location in Property <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.location_in_property}
                  onChange={(e) => setFormData({ ...formData, location_in_property: e.target.value })}
                  placeholder="e.g., Kitchen, Living Room"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Test Type <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.test_type}
                  onChange={(e) => setFormData({ ...formData, test_type: e.target.value as PATTestType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  {TEST_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Result <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="pass"
                      checked={formData.result === 'pass'}
                      onChange={(e) => setFormData({ ...formData, result: e.target.value as TestResult })}
                      className="w-4 h-4 text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-green-700">Pass</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="fail"
                      checked={formData.result === 'fail'}
                      onChange={(e) => setFormData({ ...formData, result: e.target.value as TestResult })}
                      className="w-4 h-4 text-red-600 focus:ring-red-500"
                    />
                    <span className="text-sm font-medium text-red-700">Fail</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tested By</label>
                <input
                  type="text"
                  value={formData.tested_by}
                  onChange={(e) => setFormData({ ...formData, tested_by: e.target.value })}
                  placeholder="Name of tester"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes or observations"
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Photo</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-500 hover:bg-green-50 flex items-center justify-center gap-2 text-sm font-medium text-slate-600"
                  >
                    <Camera className="w-4 h-4" />
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-500 hover:bg-green-50 flex items-center justify-center gap-2 text-sm font-medium text-slate-600"
                  >
                    <Upload className="w-4 h-4" />
                    Upload Photo
                  </button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setFormData({ ...formData, photo: file });
                  }}
                  className="hidden"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setFormData({ ...formData, photo: file });
                  }}
                  className="hidden"
                />
                {formData.photo && (
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {formData.photo.name}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Test'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm === 'batch' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Batch PAT Testing</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {batchTests.length} test{batchTests.length !== 1 ? 's' : ''} queued
                </p>
              </div>
              <button
                onClick={() => {
                  if (batchTests.length > 0 && !confirm('You have unsaved tests. Are you sure you want to close?')) {
                    return;
                  }
                  setShowForm(false);
                  resetBatchForm();
                }}
                className="p-1 hover:bg-slate-100 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {!sessionData.property_name && !sessionData.custom_property_name ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-800 font-medium">
                      Set up your testing session. These details will apply to all tests in this batch.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Property <span className="text-red-500">*</span>
                    </label>

                    <div className="flex items-center gap-3 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={!sessionData.use_custom_property}
                          onChange={() => setSessionData({ ...sessionData, use_custom_property: false, custom_property_name: '' })}
                          className="w-4 h-4 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-slate-700">Select from list</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={sessionData.use_custom_property}
                          onChange={() => setSessionData({ ...sessionData, use_custom_property: true, property_name: '' })}
                          className="w-4 h-4 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-slate-700">Ad hoc property</span>
                      </label>
                    </div>

                    {!sessionData.use_custom_property ? (
                      <select
                        required
                        value={sessionData.property_name}
                        onChange={(e) => setSessionData({ ...sessionData, property_name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      >
                        <option value="">Select property...</option>
                        {properties.map(prop => (
                          <option key={prop.id} value={prop.name}>{prop.name}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={sessionData.custom_property_name}
                        onChange={(e) => setSessionData({ ...sessionData, custom_property_name: e.target.value })}
                        placeholder="Enter property name"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Test Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={sessionData.test_date}
                      onChange={(e) => setSessionData({ ...sessionData, test_date: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Tested By</label>
                    <input
                      type="text"
                      value={sessionData.tested_by}
                      onChange={(e) => setSessionData({ ...sessionData, tested_by: e.target.value })}
                      placeholder="Name of tester"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const propertyName = sessionData.use_custom_property ? sessionData.custom_property_name : sessionData.property_name;
                      if (!propertyName) {
                        alert('Please select or enter a property');
                        return;
                      }
                    }}
                    disabled={sessionData.use_custom_property ? !sessionData.custom_property_name : !sessionData.property_name}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    Start Testing Session
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-green-900">Testing Session Active</p>
                        <p className="text-sm text-green-700 mt-1">
                          <span className="font-semibold">{sessionData.use_custom_property ? sessionData.custom_property_name : sessionData.property_name}</span> - {new Date(sessionData.test_date).toLocaleDateString('en-GB')}
                        </p>
                        {sessionData.tested_by && (
                          <p className="text-sm text-green-700">Tester: {sessionData.tested_by}</p>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (batchTests.length > 0 && !confirm('This will clear all queued tests. Continue?')) {
                            return;
                          }
                          resetBatchForm();
                        }}
                        className="text-sm text-green-700 hover:text-green-900 font-medium"
                      >
                        Change
                      </button>
                    </div>
                  </div>

                  {batchTests.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-lg">
                      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                        <h4 className="text-sm font-semibold text-slate-900">Queued Tests ({batchTests.length})</h4>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                        {batchTests.map((test) => (
                          <div key={test.id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-slate-900">{test.asset_description}</p>
                              <p className="text-xs text-slate-500">{test.location_in_property} - {test.test_type}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                                test.result === 'pass' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {test.result}
                              </span>
                              {test.photo && <Camera className="w-4 h-4 text-green-600" />}
                              <button
                                onClick={() => removeTestFromQueue(test.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-slate-200 pt-6">
                    <h4 className="text-sm font-semibold text-slate-900 mb-4">Add Appliance</h4>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Asset <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={currentEntry.asset_description}
                            onChange={(e) => setCurrentEntry({ ...currentEntry, asset_description: e.target.value })}
                            placeholder="e.g., Microwave"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            Location <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={currentEntry.location_in_property}
                            onChange={(e) => setCurrentEntry({ ...currentEntry, location_in_property: e.target.value })}
                            placeholder="e.g., Kitchen"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Test Type</label>
                          <select
                            value={currentEntry.test_type}
                            onChange={(e) => setCurrentEntry({ ...currentEntry, test_type: e.target.value as PATTestType })}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                          >
                            {TEST_TYPES.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">Result</label>
                          <div className="flex gap-4 mt-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                value="pass"
                                checked={currentEntry.result === 'pass'}
                                onChange={(e) => setCurrentEntry({ ...currentEntry, result: e.target.value as TestResult })}
                                className="w-4 h-4 text-green-600 focus:ring-green-500"
                              />
                              <span className="text-sm font-medium text-green-700">Pass</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="radio"
                                value="fail"
                                checked={currentEntry.result === 'fail'}
                                onChange={(e) => setCurrentEntry({ ...currentEntry, result: e.target.value as TestResult })}
                                className="w-4 h-4 text-red-600 focus:ring-red-500"
                              />
                              <span className="text-sm font-medium text-red-700">Fail</span>
                            </label>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Notes (Optional)</label>
                        <input
                          type="text"
                          value={currentEntry.notes}
                          onChange={(e) => setCurrentEntry({ ...currentEntry, notes: e.target.value })}
                          placeholder="Any additional notes"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Photo (Optional)</label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-500 hover:bg-green-50 flex items-center justify-center gap-2 text-sm font-medium text-slate-600"
                          >
                            <Camera className="w-4 h-4" />
                            Take Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 px-4 py-2 border-2 border-dashed border-slate-300 rounded-lg hover:border-green-500 hover:bg-green-50 flex items-center justify-center gap-2 text-sm font-medium text-slate-600"
                          >
                            <Upload className="w-4 h-4" />
                            Upload Photo
                          </button>
                        </div>
                        <input
                          ref={cameraInputRef}
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setCurrentEntry({ ...currentEntry, photo: file });
                          }}
                          className="hidden"
                        />
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) setCurrentEntry({ ...currentEntry, photo: file });
                          }}
                          className="hidden"
                        />
                        {currentEntry.photo && (
                          <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                            <CheckCircle className="w-4 h-4" />
                            {currentEntry.photo.name}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={addTestToQueue}
                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Add to Queue (Next)
                      </button>
                    </div>
                  </div>

                  {batchTests.length > 0 && (
                    <div className="border-t border-slate-200 pt-6">
                      <button
                        onClick={submitBatchTests}
                        disabled={saving}
                        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-bold text-lg flex items-center justify-center gap-2"
                      >
                        {saving ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Saving {batchTests.length} test{batchTests.length !== 1 ? 's' : ''}...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-5 h-5" />
                            Complete Testing - Submit {batchTests.length} Test{batchTests.length !== 1 ? 's' : ''}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50" onClick={() => setSelectedImage(null)}>
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 right-0 p-2 bg-white rounded-lg hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedImage}
              alt="Test photo"
              className="max-w-full max-h-[90vh] rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
}
