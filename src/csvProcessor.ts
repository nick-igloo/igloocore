import Papa from 'papaparse';
import { BookingRow, ProcessedBooking, PropertyReport, DateRangeFilter } from './types';

export const findHeaderRow = (rows: string[][]): number => {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (rows[i].some(cell => cell.includes('Booking number'))) {
      return i;
    }
  }
  return -1;
};

export const trimObject = (obj: Record<string, string>): Record<string, string> => {
  const trimmed: Record<string, string> = {};
  Object.keys(obj).forEach(key => {
    const trimmedKey = key.trim();
    const trimmedValue = obj[key]?.trim() || '';
    trimmed[trimmedKey] = trimmedValue;
  });
  return trimmed;
};

export const cleanNumericValue = (value: string): number => {
  if (!value || value.trim() === '') return 0;
  const cleaned = value.replace(/[£$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export const parseDate = (dateStr: string): Date => {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date();
};

export const calculateNetIncome = (row: BookingRow): number => {
  const paid = cleanNumericValue(row['Paid']);
  const extras = cleanNumericValue(row['Extras with VAT on top']);
  const commission = cleanNumericValue(row['Portal/Intermediary Commission: calculated commission']);

  return paid - extras - commission;
};

export const isDateInRange = (dateStr: string, filter: DateRangeFilter): boolean => {
  if (!filter.startDate && !filter.endDate) return true;
  const date = parseDate(dateStr);
  if (isNaN(date.getTime())) return true;
  if (filter.startDate) {
    const start = new Date(filter.startDate);
    if (date < start) return false;
  }
  if (filter.endDate) {
    const end = new Date(filter.endDate);
    end.setHours(23, 59, 59, 999);
    if (date > end) return false;
  }
  return true;
};

export const processCSV = (fileContent: string, dateFilter?: DateRangeFilter): Promise<PropertyReport[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse(fileContent, {
      complete: (results) => {
        try {
          const rows = results.data as string[][];

          const headerRowIndex = findHeaderRow(rows);
          if (headerRowIndex === -1) {
            reject(new Error('Could not find header row with "Booking number"'));
            return;
          }

          const headers = rows[headerRowIndex].map(h => h.trim());

          const dataRows = rows.slice(headerRowIndex + 1).filter(row =>
            row.some(cell => cell && cell.trim() !== '')
          );

          const allBookings: BookingRow[] = dataRows.map(row => {
            const obj: Record<string, string> = {};
            headers.forEach((header, index) => {
              obj[header] = row[index]?.trim() || '';
            });
            return trimObject(obj) as BookingRow;
          }).filter(booking => booking['Booking number'] && booking['Booking number'].trim() !== '');

          const bookings = dateFilter && (dateFilter.startDate || dateFilter.endDate)
            ? allBookings.filter(booking => isDateInRange(booking['Check-out date'], dateFilter))
            : allBookings;

          const groupedByProperty: { [key: string]: ProcessedBooking[] } = {};

          bookings.forEach(booking => {
            // Try multiple variations of property name column
            const propertyName = (
              booking['Accommodation name'] ||
              booking['Property name'] ||
              booking['Property'] ||
              booking['property name'] ||
              booking['property'] ||
              booking['Listing name'] ||
              booking['Listing'] ||
              ''
            ).trim() || 'Unknown';
            const netIncome = calculateNetIncome(booking);

            const processedBooking: ProcessedBooking = {
              'Booking number': booking['Booking number'],
              'Date': booking['Date'],
              'Property name': propertyName,
              'Status': 'Confirmed',
              'Check-in date': booking['Check-in date'],
              'Check-out date': booking['Check-out date'],
              'Net Income': netIncome.toFixed(2),
              'nights': booking['nights']
            };

            if (!groupedByProperty[propertyName]) {
              groupedByProperty[propertyName] = [];
            }
            groupedByProperty[propertyName].push(processedBooking);
          });

          const propertyReports: PropertyReport[] = Object.keys(groupedByProperty).map(propertyName => {
            const bookings = groupedByProperty[propertyName];

            bookings.sort((a, b) => {
              const dateA = parseDate(a['Check-in date']);
              const dateB = parseDate(b['Check-in date']);
              return dateA.getTime() - dateB.getTime();
            });

            const totalNights = bookings.reduce((sum, booking) => {
              const nights = parseInt(booking['nights'], 10);
              return sum + (isNaN(nights) ? 0 : nights);
            }, 0);

            const years = bookings
              .map(b => parseDate(b['Check-out date']).getFullYear())
              .filter(year => !isNaN(year));

            const minYear = Math.min(...years);
            const maxYear = Math.max(...years);
            const yearRange = minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;

            return {
              propertyName,
              bookings,
              totalNights,
              yearRange
            };
          });

          resolve(propertyReports);
        } catch (error) {
          reject(error);
        }
      },
      error: (error) => {
        reject(error);
      }
    });
  });
};

export const generateCSV = (report: PropertyReport): string => {
  const headers = ['Booking number', 'Date', 'Property name', 'Status', 'Check-in date', 'Check-out date', 'Net Income', 'nights'];

  const rows = report.bookings.map(booking => [
    booking['Booking number'],
    booking['Date'],
    booking['Property name'],
    booking['Status'],
    booking['Check-in date'],
    booking['Check-out date'],
    booking['Net Income'],
    booking['nights']
  ]);

  const totalRow = ['Total', '', '', '', '', '', '', report.totalNights.toString()];
  rows.push(totalRow);

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(','))
  ].join('\n');

  return csvContent;
};

export const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
