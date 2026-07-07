import { PropertyReport } from './types';

// Helper for professional currency formatting
const formatCurrency = (amount: number | string) => {
  const val = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-GB', { 
    style: 'currency', 
    currency: 'GBP',
    minimumFractionDigits: 2 
  }).format(val);
};

export const generateHTML = (report: PropertyReport): string => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.propertyName} - Booking Report</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --brand-navy: #164e87;
      --brand-blue: #3b9df4;
      --text-main: #1e293b;
      --border-color: #e2e8f0;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Montserrat', sans-serif;
      background-color: #ffffff;
      color: var(--text-main);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
    }

    .header {
      background-color: var(--brand-navy) !important;
      color: white !important;
      padding: 45px 40px;
      border-bottom: 8px solid var(--brand-blue);
    }

    .logo {
      height: 40px;
      margin-bottom: 25px;
      filter: brightness(0) invert(1);
    }

    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 5px;
    }

    .header .period {
      font-size: 14px;
      opacity: 0.9;
      font-weight: 500;
    }

    .summary-bar {
      display: flex;
      justify-content: flex-start;
      gap: 60px;
      padding: 25px 40px;
      background: #ffffff;
      border-bottom: 1px solid var(--border-color);
      font-size: 14px;
      font-weight: 600;
      color: var(--brand-navy);
    }

    .content { padding: 40px 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    th {
      background: var(--brand-navy) !important;
      color: white !important;
      padding: 14px 15px;
      text-align: left;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    td {
      padding: 16px 15px;
      border-bottom: 1px solid #f1f5f9;
    }

    .booking-ref { font-weight: 700; color: var(--brand-navy); }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      background: #e3f2fd !important;
      color: var(--brand-navy);
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
    }

    .total-row {
      font-weight: 800;
      color: var(--brand-navy);
      font-size: 14px;
    }

    .total-row td {
      padding: 25px 15px;
      border-top: 2px solid var(--brand-navy);
      border-bottom: none;
    }

    .footer {
      margin-top: 40px;
      padding: 20px;
      text-align: center;
      color: var(--brand-blue);
      font-size: 14px;
      font-weight: 700;
    }

    @media print {
      @page { size: A4; margin: 10mm; }
      body { padding: 0; }
      .header { border-radius: 0; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://igloo.scot/child/assets/img/logo.svg" alt="Igloo Logo" class="logo">
      <h1>${report.propertyName}</h1>
      <div class="period">Booking & Revenue Statement | Period: ${report.yearRange}</div>
    </div>

    <div class="summary-bar">
      <span>Total Stays: ${report.bookings.length}</span>
      <span>Total Nights: ${report.totalNights}</span>
    </div>

    <div class="content">
      <table>
        <thead>
          <tr>
            <th>Booking Ref</th>
            <th>Date</th>
            <th>Status</th>
            <th>Check-in</th>
            <th>Check-out</th>
            <th>Booking Value</th>
            <th>Nights</th>
          </tr>
        </thead>
        <tbody>
          ${report.bookings.map(booking => `
          <tr>
            <td class="booking-ref">${booking['Booking number']}</td>
            <td>${booking['Date']}</td>
            <td><span class="status-badge">CONFIRMED</span></td>
            <td>${booking['Check-in date']}</td>
            <td>${booking['Check-out date']}</td>
            <td style="font-weight:600">${formatCurrency(booking['Net Income'])}</td>
            <td>${booking['nights']}</td>
          </tr>
          `).join('')}
          <tr class="total-row">
            <td colspan="6" style="text-align: right;">Combined Total Nights</td>
            <td>${report.totalNights}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="footer">
      www.igloo.scot
    </div>
  </div>
</body>
</html>`;
};

export const generateCoverLetter = (report: PropertyReport): string => {
  const currentDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const fyLabel = report.financialYear?.label ?? report.yearRange;
  const fyDisplayRange = report.financialYear?.displayRange ?? report.yearRange;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Montserrat', sans-serif;
      color: #1e293b;
      line-height: 1.8;
      padding: 60px;
      background: #f4f7fa;
      -webkit-print-color-adjust: exact;
    }
    .page {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 60px 80px;
      border-top: 10px solid #164e87;
      min-height: 1000px;
      display: flex;
      flex-direction: column;
    }
    .logo { height: 40px; margin-bottom: 20px; }
    .company-address {
      text-align: right;
      margin-bottom: 60px;
      font-size: 14px;
      line-height: 1.6;
    }
    .company-name {
      font-weight: bold;
      margin-bottom: 2px;
      color: #164e87;
    }
    .date { margin-bottom: 40px; }
    .letter-body { font-size: 15px; text-align: justify; flex-grow: 1; }
    .letter-body p { margin-bottom: 20px; }
    .signature { margin-top: 40px; font-weight: 700; color: #164e87; line-height: 1.6; }
    .footer {
      text-align: center;
      color: #3b9df4;
      font-size: 14px;
      font-weight: 700;
      margin-top: 40px;
    }
    @media print { @page { size: A4; margin: 0; } body { padding: 0; } .page { box-shadow: none; } }
  </style>
</head>
<body>
  <div class="page">
    <img src="https://igloo.scot/child/assets/img/logo.svg" alt="Igloo Logo" class="logo">

    <div class="company-address">
      <div class="company-name">Igloo Highland Ltd</div>
      <div>3 Clan Court</div>
      <div>Aviemore</div>
      <div>PH22 1TX</div>
      <div>admin@igloo.scot</div>
      <div>01479 816433</div>
    </div>

    <div class="date">${currentDate}</div>

    <p style="margin-bottom: 30px;">To whom it may concern,</p>

    <div class="letter-body">
      <p>This is to confirm <strong>${report.propertyName}</strong> is currently listed with our agency for short term rentals. We list the property on behalf of the owner and accept bookings via our own website igloo.scot along with listing on Visit Cairngorms, Visit Scotland, Airbnb, Booking.com and Vrbo.</p>

      <p>During the ${fyLabel} period there have been <strong>${report.bookings.length} bookings</strong> totalling <strong>${report.totalNights} nights</strong>.</p>

      <p>We have enclosed a list of bookings for stays covering ${fyDisplayRange}.</p>

      <p>Should you have any questions or require further information, please do not hesitate to let us know.</p>

      <div class="signature">
        <div style="margin-top: 40px; margin-bottom: 40px;">Kind regards,</div>
        Nick Lyon & Erin McBean<br>
        Directors, Igloo Highland Ltd
      </div>
    </div>

    <div class="footer">
      www.igloo.scot
    </div>
  </div>
</body>
</html>`;
};

export const downloadHTML = (content: string, filename: string) => {
  const blob = new Blob([content], { type: 'text/html;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};