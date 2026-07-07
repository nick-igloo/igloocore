import JSZip from 'jszip';
import { PropertyReport } from './types';
import { generateCSV } from './csvProcessor';
import { generateHTML, generateCoverLetter } from './htmlGenerator';

export const generateZip = async (reports: PropertyReport[]): Promise<Blob> => {
  const zip = new JSZip();

  reports.forEach(report => {
    const csvContent = generateCSV(report);
    const csvFilename = `${report.propertyName} ${report.yearRange}.csv`;
    zip.file(csvFilename, csvContent);

    const htmlContent = generateHTML(report);
    const htmlFilename = `${report.propertyName} ${report.yearRange}.html`;
    zip.file(htmlFilename, htmlContent);

    const coverLetterContent = generateCoverLetter(report);
    const coverLetterFilename = `${report.propertyName} ${report.yearRange} - Cover Letter.html`;
    zip.file(coverLetterFilename, coverLetterContent);
  });

  return await zip.generateAsync({ type: 'blob' });
};

export const downloadZip = (blob: Blob, filename: string) => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
