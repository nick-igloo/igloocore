import { useState, useRef, useEffect } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';

interface STLCheckRecord {
  checked_at: string;
  property_name: string;
  fire_checked_by?: string;
  legionella_by?: string;
  unoccupied_status?: string;
  maintenance_notes?: string;
}

interface MaintenanceLog {
  id: string;
  property_id: string | null;
  task_description: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  scheduled_date: string | null;
  completed_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  properties?: {
    name: string;
  };
}

const C = {
  navyDeep: '#0d2850',
  navy: '#1a4a7a',
  blue: '#3a8fd1',
  bluePale: '#ddeeff',
  coral: '#e8513a',
  green: '#3ab87a',
  bg: '#f0f4f9',
  surface: '#ffffff',
  surface2: '#eef3f9',
  border: '#d4e2ef',
  muted: '#5a7a9a',
  dim: '#9ab0c5',
};

function STLChecksImport() {
  const [records, setRecords] = useState<STLCheckRecord[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [showNewLogForm, setShowNewLogForm] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterProperty, setFilterProperty] = useState<string>('all');
  const [newLog, setNewLog] = useState({
    property_id: '',
    task_description: '',
    priority: 'Medium',
    status: 'Pending',
    assigned_to: '',
    scheduled_date: '',
    notes: ''
  });

  useEffect(() => {
    fetchMaintenanceLogs();
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    const { data } = await supabase
      .from('properties')
      .select('id, name')
      .eq('active', true)
      .order('name');
    if (data) setProperties(data);
  };

  const fetchMaintenanceLogs = async () => {
    const { data } = await supabase
      .from('maintenance_logs')
      .select(`
        *,
        properties:property_id (name)
      `)
      .order('created_at', { ascending: false });
    if (data) setMaintenanceLogs(data);
  };

  const handleCreateLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLog.property_id || !newLog.task_description.trim()) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      const { error: insertError } = await supabase.from('maintenance_logs').insert({
        property_id: newLog.property_id,
        task_description: newLog.task_description,
        priority: newLog.priority,
        status: newLog.status,
        assigned_to: newLog.assigned_to || null,
        scheduled_date: newLog.scheduled_date || null,
        notes: newLog.notes || null,
        created_by: session.session?.user?.id || null
      });

      if (insertError) throw insertError;

      setNewLog({
        property_id: '',
        task_description: '',
        priority: 'Medium',
        status: 'Pending',
        assigned_to: '',
        scheduled_date: '',
        notes: ''
      });
      setShowNewLogForm(false);
      setSuccess('Maintenance task created successfully');
      setTimeout(() => setSuccess(null), 3000);
      fetchMaintenanceLogs();
    } catch (err) {
      setError('Failed to create maintenance log');
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleUpdateLogStatus = async (logId: string, newStatus: string) => {
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'Completed') {
        updates.completed_date = new Date().toISOString().split('T')[0];
      }

      const { error: updateError } = await supabase
        .from('maintenance_logs')
        .update(updates)
        .eq('id', logId);

      if (updateError) throw updateError;

      fetchMaintenanceLogs();
      setSuccess('Status updated successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to update status');
      setTimeout(() => setError(null), 3000);
    }
  };

  const parseDate = (dateStr: string): string | null => {
    if (!dateStr || !dateStr.trim()) return null;

    const cleaned = dateStr.trim();

    if (cleaned.includes('/')) {
      const parts = cleaned.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts.map(p => parseInt(p, 10));
        const fullYear = year < 100 ? 2000 + year : year;
        const date = new Date(fullYear, month - 1, day);
        return date.toISOString();
      }
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    for (let i = 0; i < monthNames.length; i++) {
      if (cleaned.includes(monthNames[i])) {
        const parts = cleaned.split(/\s+/);
        if (parts.length >= 3) {
          const day = parseInt(parts[1]);
          const year = parseInt(parts[2]);
          const date = new Date(year, i, day);
          if (!isNaN(date.getTime())) {
            return date.toISOString();
          }
        }
        break;
      }
    }

    if (cleaned.includes('-')) {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    return null;
  };

  const loadCSV = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setError(null);
    setSuccess(null);
    setFileName(file.name);
    setRecords([]);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = Papa.parse(text, { skipEmptyLines: true });
      const rows = parsed.data as string[][];

      if (rows.length < 2) {
        setError('CSV file must contain a header row and at least one data row');
        return;
      }

      const processedRecords: STLCheckRecord[] = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        const timestamp = row[0] || '';
        const propertiesRaw = row[1] || '';
        const fireCheckedBy = row[2] || '';
        const legionellaBy = row[3] || '';
        const maintenanceNotes = row[4] || '';
        const unoccupiedStatus = row[5] || '';

        const checkedAt = parseDate(timestamp);
        if (!checkedAt) {
          console.warn(`Row ${i + 1}: Missing or invalid date, skipping`);
          continue;
        }

        if (!propertiesRaw.trim()) {
          console.warn(`Row ${i + 1}: Missing property name, skipping`);
          continue;
        }

        const properties = propertiesRaw.split(',').map(p => p.trim()).filter(Boolean);

        for (const propertyName of properties) {
          processedRecords.push({
            checked_at: checkedAt,
            property_name: propertyName,
            fire_checked_by: fireCheckedBy.trim() || undefined,
            legionella_by: legionellaBy.trim() || undefined,
            unoccupied_status: unoccupiedStatus.trim() || undefined,
            maintenance_notes: maintenanceNotes.trim() || undefined,
          });
        }
      }

      if (processedRecords.length === 0) {
        setError('No valid records found in CSV. Check the file format.');
        return;
      }

      setRecords(processedRecords);
    };

    reader.readAsText(file);
  };

  const importToDatabase = async () => {
    if (records.length === 0) return;

    setImporting(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: insertError } = await supabase
        .from('stl_checks')
        .insert(
          records.map(r => ({
            ...r,
            source: 'csv_import'
          }))
        )
        .select();

      if (insertError) throw insertError;

      setSuccess(`Successfully imported ${data?.length || records.length} records!`);
      setRecords([]);
      setFileName('');
    } catch (err: any) {
      setError(`Failed to import: ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files[0]) {
      loadCSV(e.dataTransfer.files[0]);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.navyDeep, fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ background: C.navy, padding: '0 20px', position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', height: 52, gap: 12 }}>
        <span style={{ color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', flex: 1 }}>igloo</span>
        <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 500 }}>STL Checks Import</span>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px 40px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.navyDeep, letterSpacing: '-0.5px', marginBottom: 4 }}>Import STL Checks</h1>
          <p style={{ color: C.muted, fontSize: 13 }}>Upload CSV file from Google Sheets (handles multiple properties per row)</p>
        </div>

        {error && (
          <div style={{ background: C.surface, border: `2px solid ${C.coral}`, borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: `4px solid ${C.coral}` }}>
            <span style={{ color: C.coral, fontSize: 13, fontWeight: 600 }}>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ background: C.surface, border: `2px solid ${C.green}`, borderRadius: 12, padding: 16, marginBottom: 16, borderLeft: `4px solid ${C.green}` }}>
            <span style={{ color: C.green, fontSize: 13, fontWeight: 600 }}>{success}</span>
          </div>
        )}

        {records.length === 0 && (
          <>
            <div
              style={{
                border: `2px dashed ${drag ? C.blue : C.border}`,
                borderRadius: 12,
                padding: '56px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
                background: drag ? '#e8f2fc' : C.surface,
                marginBottom: 24
              }}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
              onClick={() => fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.[0]) loadCSV(e.target.files[0]); }}
              />
              <div style={{ fontSize: 48, marginBottom: 16 }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>
                Drop CSV file here
              </div>
              <div style={{ color: C.dim, fontSize: 12.5 }}>or click to browse files</div>
            </div>

            <div style={{ background: C.surface, borderRadius: 12, padding: 20, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.dim, marginBottom: 12 }}>
                Expected CSV Format
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
                Your CSV should have these columns in this order:
              </div>
              <ol style={{ fontSize: 13, color: C.muted, lineHeight: 1.8, paddingLeft: 20 }}>
                <li><strong>Timestamp</strong> - Date/time of check (DD/MM/YYYY, "Oct 21 2022 11:11", etc.)</li>
                <li><strong>Property names</strong> - One or more properties separated by commas</li>
                <li><strong>Fire alarms & lighting checked by</strong> - Person name</li>
                <li><strong>Legionella task completed by</strong> - Person name</li>
                <li><strong>Maintenance notes</strong> - Optional notes</li>
                <li><strong>Unoccupied status</strong> - Status description</li>
              </ol>
              <div style={{ marginTop: 12, padding: 12, background: C.bluePale, borderRadius: 8, fontSize: 12, color: C.navy }}>
                <strong>Note:</strong> Multiple properties on one line will be split into separate records with the same check data.
              </div>
            </div>
          </>
        )}

        {records.length > 0 && (
          <div>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 16, borderLeft: `4px solid ${C.green}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{fileName}</div>
                  <div style={{ color: C.muted, fontSize: 12 }}>
                    {records.length} record{records.length !== 1 ? 's' : ''} ready to import
                  </div>
                </div>
                <button
                  style={{
                    padding: '7px 16px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 12,
                    background: C.surface2,
                    color: C.muted,
                    fontFamily: "'Outfit', sans-serif"
                  }}
                  onClick={() => {
                    setRecords([]);
                    setFileName('');
                  }}
                >
                  Clear
                </button>
              </div>

              <button
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: importing ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  background: importing ? C.dim : C.green,
                  color: '#fff',
                  fontFamily: "'Outfit', sans-serif",
                  width: '100%',
                  opacity: importing ? 0.6 : 1
                }}
                onClick={importToDatabase}
                disabled={importing}
              >
                {importing ? 'Importing...' : `Import ${records.length} Record${records.length !== 1 ? 's' : ''}`}
              </button>
            </div>

            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, background: C.surface2 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: C.dim }}>
                  Preview
                </div>
              </div>
              <div style={{ overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ position: 'sticky', top: 0, background: C.surface2, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Date</th>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Property</th>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Fire Check</th>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Legionella</th>
                      <th style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 100).map((record, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? C.surface : '#fafcff', borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: '12px 20px' }}>
                          {new Date(record.checked_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ padding: '12px 20px', fontWeight: 600, color: C.navyDeep }}>
                          {record.property_name}
                        </td>
                        <td style={{ padding: '12px 20px', color: C.muted }}>
                          {record.fire_checked_by || '-'}
                        </td>
                        <td style={{ padding: '12px 20px', color: C.muted }}>
                          {record.legionella_by || '-'}
                        </td>
                        <td style={{ padding: '12px 20px', color: C.muted, fontSize: 11 }}>
                          {record.unoccupied_status || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {records.length > 100 && (
                  <div style={{ padding: 16, textAlign: 'center', color: C.muted, fontSize: 12, background: C.surface2 }}>
                    Showing first 100 of {records.length} records
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Maintenance Logs Section */}
        <div style={{ marginTop: 40, borderTop: `2px solid ${C.border}`, paddingTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: C.navyDeep, marginBottom: 4 }}>
                🔧 Maintenance Logs
              </div>
              <div style={{ fontSize: 13, color: C.muted }}>
                Track and manage property maintenance tasks
              </div>
            </div>
            <button
              style={{
                padding: '10px 20px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
                background: showNewLogForm ? C.coral : C.blue,
                color: '#fff',
                fontFamily: "'Outfit', sans-serif",
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
              onClick={() => setShowNewLogForm(!showNewLogForm)}
            >
              {showNewLogForm ? '✕ Cancel' : '+ Add Task'}
            </button>
          </div>

          {/* New Log Form */}
          {showNewLogForm && (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <form onSubmit={handleCreateLog}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                    Property *
                  </label>
                  <select
                    required
                    value={newLog.property_id}
                    onChange={(e) => setNewLog({ ...newLog, property_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 13,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      fontFamily: "'Outfit', sans-serif"
                    }}
                  >
                    <option value="">Select a property</option>
                    {properties.map(prop => (
                      <option key={prop.id} value={prop.id}>{prop.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                    Task Description *
                  </label>
                  <textarea
                    required
                    value={newLog.task_description}
                    onChange={(e) => setNewLog({ ...newLog, task_description: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 13,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      fontFamily: "'Outfit', sans-serif",
                      minHeight: 60,
                      resize: 'vertical'
                    }}
                    placeholder="Describe the maintenance task..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                      Priority
                    </label>
                    <select
                      value={newLog.priority}
                      onChange={(e) => setNewLog({ ...newLog, priority: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        fontFamily: "'Outfit', sans-serif"
                      }}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                      Status
                    </label>
                    <select
                      value={newLog.status}
                      onChange={(e) => setNewLog({ ...newLog, status: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        fontFamily: "'Outfit', sans-serif"
                      }}
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                      Scheduled Date
                    </label>
                    <input
                      type="date"
                      value={newLog.scheduled_date}
                      onChange={(e) => setNewLog({ ...newLog, scheduled_date: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        fontFamily: "'Outfit', sans-serif"
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                      Assigned To
                    </label>
                    <input
                      type="text"
                      value={newLog.assigned_to}
                      onChange={(e) => setNewLog({ ...newLog, assigned_to: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 13,
                        border: `1px solid ${C.border}`,
                        borderRadius: 8,
                        fontFamily: "'Outfit', sans-serif"
                      }}
                      placeholder="Person or team"
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.navyDeep, marginBottom: 6 }}>
                    Notes
                  </label>
                  <textarea
                    value={newLog.notes}
                    onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 13,
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      fontFamily: "'Outfit', sans-serif",
                      minHeight: 60,
                      resize: 'vertical'
                    }}
                    placeholder="Additional notes..."
                  />
                </div>

                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setShowNewLogForm(false)}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: `1px solid ${C.border}`,
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      background: C.surface,
                      color: C.muted,
                      fontFamily: "'Outfit', sans-serif"
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: 13,
                      background: C.blue,
                      color: '#fff',
                      fontFamily: "'Outfit', sans-serif"
                    }}
                  >
                    Create Task
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Filter by Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'Outfit', sans-serif",
                  background: C.surface
                }}
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Filter by Property
              </label>
              <select
                value={filterProperty}
                onChange={(e) => setFilterProperty(e.target.value)}
                style={{
                  padding: '8px 12px',
                  fontSize: 13,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  fontFamily: "'Outfit', sans-serif",
                  background: C.surface
                }}
              >
                <option value="all">All Properties</option>
                {properties.map(prop => (
                  <option key={prop.id} value={prop.id}>{prop.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Maintenance Logs Table */}
          {maintenanceLogs.length === 0 ? (
            <div style={{
              background: C.surface,
              borderRadius: 12,
              border: `1px solid ${C.border}`,
              padding: '60px 20px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔧</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.navyDeep, marginBottom: 4 }}>
                No maintenance logs yet
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Create your first task to get started
              </div>
            </div>
          ) : (
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead style={{ background: C.surface2 }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Property</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Task</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Priority</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Assigned</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Scheduled</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: C.muted, borderBottom: `2px solid ${C.border}` }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceLogs
                      .filter(log => filterStatus === 'all' || log.status === filterStatus)
                      .filter(log => filterProperty === 'all' || log.property_id === filterProperty)
                      .map((log, i) => {
                        const priorityColors: Record<string, string> = {
                          Low: C.dim,
                          Medium: C.blue,
                          High: '#f59e0b',
                          Urgent: C.coral
                        };

                        const statusColors: Record<string, { bg: string; text: string }> = {
                          Pending: { bg: C.surface2, text: C.muted },
                          'In Progress': { bg: C.bluePale, text: C.blue },
                          Completed: { bg: '#d1fae5', text: C.green }
                        };

                        return (
                          <tr key={log.id} style={{ background: i % 2 === 0 ? C.surface : '#fafcff', borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: '14px 16px', fontWeight: 600, color: C.navyDeep }}>
                              {log.properties?.name || 'Unknown'}
                            </td>
                            <td style={{ padding: '14px 16px', color: C.navyDeep, maxWidth: 300 }}>
                              <div style={{ marginBottom: 4 }}>{log.task_description}</div>
                              {log.notes && (
                                <div style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>
                                  {log.notes}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: priorityColors[log.priority] + '20',
                                color: priorityColors[log.priority]
                              }}>
                                {log.priority}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: statusColors[log.status]?.bg || C.surface2,
                                color: statusColors[log.status]?.text || C.muted
                              }}>
                                {log.status}
                              </span>
                            </td>
                            <td style={{ padding: '14px 16px', color: C.muted }}>
                              {log.assigned_to || '-'}
                            </td>
                            <td style={{ padding: '14px 16px', color: C.muted }}>
                              {log.scheduled_date ? new Date(log.scheduled_date).toLocaleDateString('en-GB') : '-'}
                            </td>
                            <td style={{ padding: '14px 16px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {log.status !== 'Completed' && log.status !== 'In Progress' && (
                                  <button
                                    onClick={() => handleUpdateLogStatus(log.id, 'In Progress')}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: C.bluePale,
                                      color: C.blue,
                                      fontFamily: "'Outfit', sans-serif"
                                    }}
                                  >
                                    Start
                                  </button>
                                )}
                                {log.status !== 'Completed' && (
                                  <button
                                    onClick={() => handleUpdateLogStatus(log.id, 'Completed')}
                                    style={{
                                      padding: '4px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      cursor: 'pointer',
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: '#d1fae5',
                                      color: C.green,
                                      fontFamily: "'Outfit', sans-serif"
                                    }}
                                  >
                                    ✓ Complete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default STLChecksImport;
