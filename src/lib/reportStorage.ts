import { supabase } from './supabase';
import { PropertyReport } from '../types';
import { generateCSV } from '../csvProcessor';
import { generateHTML, generateCoverLetter } from '../htmlGenerator';

export interface StoredReportMeta {
  propertyName: string;
  yearRange: string;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  bookingCount: number;
  totalNights: number;
}

const sanitizePath = (name: string) =>
  name.replace(/[^a-zA-Z0-9\-_. ()]/g, '_');

export const storeReportFiles = async (
  report: PropertyReport,
  dateRangeStart: string | null,
  dateRangeEnd: string | null,
  generatedBy: string | null
): Promise<void> => {
  const safeProperty = sanitizePath(report.propertyName);
  const timestamp = new Date().toISOString().slice(0, 10);
  const folder = `${safeProperty}/${timestamp}`;

  const filesToUpload = [
    {
      content: generateCSV(report),
      fileName: `${safeProperty} ${report.yearRange}.csv`,
      path: `${folder}/${safeProperty} ${report.yearRange}.csv`,
      mimeType: 'text/csv',
      fileType: 'csv' as const,
    },
    {
      content: generateHTML(report),
      fileName: `${safeProperty} ${report.yearRange}.html`,
      path: `${folder}/${safeProperty} ${report.yearRange}.html`,
      mimeType: 'text/html',
      fileType: 'html' as const,
    },
    {
      content: generateCoverLetter(report),
      fileName: `${safeProperty} ${report.yearRange} - Cover Letter.html`,
      path: `${folder}/${safeProperty} ${report.yearRange} - Cover Letter.html`,
      mimeType: 'text/html',
      fileType: 'cover_letter' as const,
    },
  ];

  for (const file of filesToUpload) {
    const blob = new Blob([file.content], { type: file.mimeType });

    const { error: uploadError } = await supabase.storage
      .from('reports')
      .upload(file.path, blob, { upsert: true, contentType: file.mimeType });

    if (uploadError) {
      console.error('Upload error for', file.fileName, uploadError);
      continue;
    }

    await supabase.from('generated_reports').insert({
      property_name: report.propertyName,
      file_name: file.fileName,
      file_type: file.fileType,
      storage_path: file.path,
      date_range_start: dateRangeStart || null,
      date_range_end: dateRangeEnd || null,
      year_range: report.yearRange,
      booking_count: report.bookings.length,
      total_nights: report.totalNights,
      generated_by: generatedBy,
    });
  }
};

export const getSignedUrl = async (storagePath: string): Promise<string | null> => {
  const { data, error } = await supabase.storage
    .from('reports')
    .createSignedUrl(storagePath, 3600);

  if (error || !data) return null;
  return data.signedUrl;
};
